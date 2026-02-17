#!/usr/bin/env node
/**
 * Strict Video QA System for @dailydealfeed
 * All checks must pass for approval - no exceptions
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const THRESHOLDS = {
  minDuration: 8,
  maxDuration: 15,
  minWidth: 1080,
  minHeight: 1920,
  minBitrate: 1000000,  // 1 Mbps minimum
  minFileSize: 500000,  // 500KB minimum
  maxFileSize: 10000000, // 10MB max
  requiredAudio: true
};

function evaluateVideo(videoPath) {
  const result = {
    file: videoPath,
    filename: path.basename(videoPath),
    passed: false,
    score: 0,
    checks: {},
    issues: [],
    metadata: null
  };

  if (!fs.existsSync(videoPath)) {
    result.issues.push(`File not found: ${videoPath}`);
    return result;
  }

  try {
    const probe = JSON.parse(execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`,
      { encoding: 'utf8', timeout: 30000 }
    ));

    const video = probe.streams.find(s => s.codec_type === 'video');
    const audio = probe.streams.find(s => s.codec_type === 'audio');
    const format = probe.format;

    if (!video) {
      result.issues.push('No video stream found');
      return result;
    }

    // 1. Resolution check (must be exactly 1080x1920)
    result.checks.resolution = video.width === 1080 && video.height === 1920;
    if (!result.checks.resolution) {
      result.issues.push(`Bad resolution: ${video.width}x${video.height} (need 1080x1920)`);
    }

    // 2. Duration check
    const duration = parseFloat(format.duration);
    result.checks.duration = duration >= THRESHOLDS.minDuration && duration <= THRESHOLDS.maxDuration;
    if (!result.checks.duration) {
      result.issues.push(`Bad duration: ${duration.toFixed(1)}s (need ${THRESHOLDS.minDuration}-${THRESHOLDS.maxDuration}s)`);
    }

    // 3. Audio check
    result.checks.hasAudio = !!audio;
    if (!result.checks.hasAudio) {
      result.issues.push('Missing audio track');
    }

    // 4. Bitrate check
    const bitrate = parseInt(format.bit_rate) || 0;
    result.checks.bitrate = bitrate >= THRESHOLDS.minBitrate;
    if (!result.checks.bitrate) {
      result.issues.push(`Low bitrate: ${(bitrate/1000000).toFixed(2)} Mbps (need ≥1 Mbps)`);
    }

    // 5. File size check
    const fileSize = parseInt(format.size);
    result.checks.fileSize = fileSize >= THRESHOLDS.minFileSize && fileSize <= THRESHOLDS.maxFileSize;
    if (!result.checks.fileSize) {
      result.issues.push(`Bad file size: ${(fileSize/1000000).toFixed(2)} MB (need 0.5-10 MB)`);
    }

    // 6. Aspect ratio verification
    const aspect = video.width / video.height;
    result.checks.aspectRatio = Math.abs(aspect - 0.5625) < 0.01;
    if (!result.checks.aspectRatio) {
      result.issues.push(`Wrong aspect ratio: ${aspect.toFixed(4)} (need 0.5625)`);
    }

    // Calculate score
    const checkCount = Object.keys(result.checks).length;
    const passedCount = Object.values(result.checks).filter(v => v).length;
    result.score = Math.round((passedCount / checkCount) * 10);

    // Must pass ALL checks to be approved
    result.passed = passedCount === checkCount;

    result.metadata = {
      width: video.width,
      height: video.height,
      duration: duration,
      bitrate: bitrate,
      fileSize: fileSize,
      codec: video.codec_name,
      audioCodec: audio?.codec_name
    };

  } catch (error) {
    result.issues.push(`Probe error: ${error.message}`);
  }

  return result;
}

// Batch evaluate all videos in a directory
function evaluateAll(dir) {
  if (!fs.existsSync(dir)) {
    return { passed: [], failed: [], error: 'Directory not found' };
  }
  
  const videos = fs.readdirSync(dir).filter(f => f.endsWith('.mp4'));
  const results = { passed: [], failed: [] };

  for (const video of videos) {
    const result = evaluateVideo(path.join(dir, video));
    if (result.passed) {
      results.passed.push(result);
    } else {
      results.failed.push(result);
    }
  }

  return results;
}

// Move failing videos to rejected folder
function enforceQA(approvedDir, rejectedDir) {
  if (!fs.existsSync(approvedDir)) {
    console.log(`Directory not found: ${approvedDir}`);
    return { moved: 0, kept: 0 };
  }
  
  if (!fs.existsSync(rejectedDir)) {
    fs.mkdirSync(rejectedDir, { recursive: true });
  }
  
  const results = evaluateAll(approvedDir);
  let moved = 0;
  
  for (const failed of results.failed) {
    const src = failed.file;
    const dest = path.join(rejectedDir, failed.filename);
    
    // Write rejection reason
    const reasonFile = path.join(rejectedDir, failed.filename.replace('.mp4', '.rejection.json'));
    fs.writeFileSync(reasonFile, JSON.stringify({
      file: failed.filename,
      rejectedAt: new Date().toISOString(),
      issues: failed.issues,
      checks: failed.checks,
      metadata: failed.metadata
    }, null, 2));
    
    // Move the file
    fs.renameSync(src, dest);
    moved++;
    console.log(`  ❌ Moved: ${failed.filename}`);
    console.log(`     Reason: ${failed.issues.join(', ')}`);
  }
  
  return { moved, kept: results.passed.length };
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const arg = args[0];
  
  if (!arg) {
    console.log('Usage:');
    console.log('  node video-qa.js <video.mp4>           Evaluate single video');
    console.log('  node video-qa.js <directory>           Evaluate all videos in directory');
    console.log('  node video-qa.js --enforce             Move failing videos from approved/ to rejected/');
    process.exit(1);
  }
  
  if (arg === '--enforce') {
    const projectDir = path.join(__dirname, '..');
    const approvedDir = path.join(projectDir, 'output', 'approved');
    const rejectedDir = path.join(projectDir, 'output', 'rejected');
    
    console.log('\n=== ENFORCING QA ===');
    const { moved, kept } = enforceQA(approvedDir, rejectedDir);
    console.log(`\nResult: ${kept} kept, ${moved} rejected`);
    
  } else if (fs.existsSync(arg) && fs.statSync(arg).isDirectory()) {
    const results = evaluateAll(arg);
    console.log(`\n=== QA RESULTS ===`);
    console.log(`Passed: ${results.passed.length}`);
    console.log(`Failed: ${results.failed.length}`);
    
    if (results.passed.length > 0) {
      console.log(`\n✅ Passed videos:`);
      for (const p of results.passed) {
        console.log(`  ${p.filename} (score: ${p.score}/10)`);
      }
    }
    
    if (results.failed.length > 0) {
      console.log(`\n❌ Failed videos:`);
      for (const f of results.failed) {
        console.log(`  ${f.filename}: ${f.issues.join(', ')}`);
      }
    }
  } else if (fs.existsSync(arg)) {
    const result = evaluateVideo(arg);
    console.log(JSON.stringify(result, null, 2));
    console.log(result.passed ? '\n✅ PASSED' : `\n❌ FAILED: ${result.issues.join(', ')}`);
    process.exit(result.passed ? 0 : 1);
  } else {
    console.log(`File or directory not found: ${arg}`);
    process.exit(1);
  }
}

module.exports = { evaluateVideo, evaluateAll, enforceQA, THRESHOLDS };
