#!/usr/bin/env node
/**
 * AFV Clip Pipeline
 * 
 * Processes raw AFV clips through:
 * 1. Smart Crop (16:9 → 9:16)
 * 2. Cliffhanger Cut (end before payoff)
 * 
 * Output: Ready-to-use clips for TikTok/Reels
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const CLIPS_DIR = path.join(__dirname, '../clips');
const RAW_DIR = path.join(CLIPS_DIR, 'raw');
const PROCESSED_DIR = path.join(CLIPS_DIR, 'processed');
const TEMP_DIR = path.join(CLIPS_DIR, 'temp');
const TIMESTAMPS_FILE = path.join(CLIPS_DIR, 'afv-timestamps.json');

const SCRIPTS_DIR = __dirname;

/**
 * Parse timestamp string (MM:SS or M:SS) to seconds
 */
function parseTimestamp(ts) {
  if (typeof ts === 'number') return ts;
  const parts = ts.split(':').map(Number);
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  } else if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  return parseFloat(ts) || 0;
}

/**
 * Get video duration using ffprobe
 */
function getVideoDuration(videoPath) {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`,
      { encoding: 'utf8' }
    );
    return parseFloat(output.trim());
  } catch (err) {
    console.error(`Failed to get duration for ${videoPath}:`, err.message);
    return 0;
  }
}

/**
 * Get video dimensions
 */
function getVideoDimensions(videoPath) {
  try {
    const output = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${videoPath}"`,
      { encoding: 'utf8' }
    );
    const [width, height] = output.trim().split(',').map(Number);
    return { width, height };
  } catch (err) {
    console.error(`Failed to get dimensions for ${videoPath}:`, err.message);
    return { width: 0, height: 0 };
  }
}

/**
 * Run smart-crop.js on a clip
 */
function runSmartCrop(inputPath, outputPath) {
  const cmd = `node "${path.join(SCRIPTS_DIR, 'smart-crop.js')}" "${inputPath}" "${outputPath}" --fallback center`;
  console.log(`  → Smart Crop: ${path.basename(inputPath)}`);
  try {
    execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch (err) {
    console.error(`    Smart crop failed: ${err.message}`);
    return false;
  }
}

/**
 * Run cliffhanger-cut.js on a clip
 */
function runCliffhangerCut(inputPath, outputPath, impactTimestamp, duration = 3.0) {
  // Ensure impact timestamp doesn't exceed video duration
  const videoDuration = getVideoDuration(inputPath);
  const adjustedImpact = Math.min(impactTimestamp, videoDuration - 0.1);
  
  // Calculate a good duration that fits within the video
  const leadTime = 0.5;
  let actualDuration = duration;
  const endTime = adjustedImpact - leadTime;
  const startTime = endTime - actualDuration;
  
  if (startTime < 0) {
    actualDuration = endTime; // Adjust duration to fit
  }
  
  // Ensure minimum duration of 2 seconds
  if (actualDuration < 2.0) {
    actualDuration = Math.min(2.0, endTime);
  }
  
  const cmd = `node "${path.join(SCRIPTS_DIR, 'cliffhanger-cut.js')}" "${inputPath}" "${outputPath}" --impact ${adjustedImpact.toFixed(2)} --lead 0.5 --duration ${actualDuration.toFixed(2)}`;
  console.log(`  → Cliffhanger Cut: impact=${adjustedImpact.toFixed(2)}s, duration=${actualDuration.toFixed(2)}s`);
  
  try {
    execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
    return true;
  } catch (err) {
    console.error(`    Cliffhanger cut failed: ${err.message}`);
    return false;
  }
}

/**
 * Verify processed clip meets requirements
 */
function verifyClip(clipPath) {
  const dims = getVideoDimensions(clipPath);
  const duration = getVideoDuration(clipPath);
  
  const aspectRatio = dims.width / dims.height;
  const targetRatio = 9 / 16;
  const ratioOk = Math.abs(aspectRatio - targetRatio) < 0.05;
  
  const durationOk = duration >= 1.5 && duration <= 5.0;
  
  return {
    valid: ratioOk && durationOk,
    width: dims.width,
    height: dims.height,
    aspectRatio: aspectRatio.toFixed(3),
    duration: duration.toFixed(2),
    issues: [
      !ratioOk ? `Aspect ratio ${aspectRatio.toFixed(3)} (expected ~0.5625)` : null,
      !durationOk ? `Duration ${duration.toFixed(2)}s (expected 2-4s)` : null
    ].filter(Boolean)
  };
}

/**
 * Main pipeline
 */
async function main() {
  console.log('🎬 AFV Clip Processing Pipeline\n');
  
  // Create directories
  fs.mkdirSync(PROCESSED_DIR, { recursive: true });
  fs.mkdirSync(TEMP_DIR, { recursive: true });
  
  // Load timestamps
  const timestampsData = JSON.parse(fs.readFileSync(TIMESTAMPS_FILE, 'utf8'));
  
  // Build a map of all clips with their metadata
  const clipMeta = {};
  for (const sourceVideo of timestampsData.source_videos) {
    for (const moment of sourceVideo.moments) {
      const startSec = parseTimestamp(moment.start);
      const impactSec = parseTimestamp(moment.impact_moment);
      // Calculate relative impact within the extracted clip
      const relativeImpact = impactSec - startSec;
      
      clipMeta[moment.id] = {
        ...moment,
        startSec,
        impactSec,
        relativeImpact,
        sourceVideo: sourceVideo.title
      };
    }
  }
  
  console.log(`Found ${Object.keys(clipMeta).length} clips to process\n`);
  
  // Find all raw clips
  const rawClips = fs.readdirSync(RAW_DIR)
    .filter(f => f.match(/^afv-\d+-raw\.mp4$/))
    .sort();
  
  console.log(`Raw clips in ${RAW_DIR}: ${rawClips.length}\n`);
  
  const results = [];
  const manifest = { clips: [] };
  
  for (const rawFile of rawClips) {
    const clipId = rawFile.replace('-raw.mp4', '');
    const meta = clipMeta[clipId];
    
    if (!meta) {
      console.log(`⚠️  ${clipId}: No metadata found, skipping`);
      continue;
    }
    
    console.log(`\n📹 Processing ${clipId}: "${meta.description}"`);
    
    const rawPath = path.join(RAW_DIR, rawFile);
    const tempPath = path.join(TEMP_DIR, `${clipId}-portrait.mp4`);
    const finalPath = path.join(PROCESSED_DIR, `${clipId}.mp4`);
    
    // Check raw clip duration to calculate proper relative impact
    const rawDuration = getVideoDuration(rawPath);
    console.log(`  Raw duration: ${rawDuration.toFixed(2)}s`);
    
    // Calculate relative impact - the clips were extracted starting from 'start' timestamp
    // So relative impact is impactSec - startSec
    let relativeImpact = meta.relativeImpact;
    
    // Sanity check: ensure impact is within clip bounds
    if (relativeImpact > rawDuration) {
      console.log(`  ⚠️  Impact ${relativeImpact.toFixed(2)}s > duration ${rawDuration.toFixed(2)}s, adjusting`);
      relativeImpact = rawDuration - 0.5;
    }
    if (relativeImpact < 0) {
      relativeImpact = rawDuration * 0.75; // Use 75% of clip as impact point
    }
    
    console.log(`  Relative impact: ${relativeImpact.toFixed(2)}s`);
    
    // Step 1: Smart Crop (16:9 → 9:16)
    const cropOk = runSmartCrop(rawPath, tempPath);
    if (!cropOk) {
      results.push({ id: clipId, success: false, error: 'Smart crop failed' });
      continue;
    }
    
    // Step 2: Cliffhanger Cut
    const cutOk = runCliffhangerCut(tempPath, finalPath, relativeImpact, 3.0);
    if (!cutOk) {
      results.push({ id: clipId, success: false, error: 'Cliffhanger cut failed' });
      continue;
    }
    
    // Step 3: Verify
    const verification = verifyClip(finalPath);
    console.log(`  ✓ Verified: ${verification.width}x${verification.height}, ${verification.duration}s`);
    
    if (verification.issues.length > 0) {
      console.log(`  ⚠️  Issues: ${verification.issues.join(', ')}`);
    }
    
    results.push({
      id: clipId,
      success: true,
      ...verification
    });
    
    // Add to manifest
    manifest.clips.push({
      id: clipId,
      file: `clips/processed/${clipId}.mp4`,
      vibe: meta.vibe,
      duration: parseFloat(verification.duration),
      description: meta.description,
      sourceVideo: meta.sourceVideo
    });
  }
  
  // Clean up temp directory
  console.log('\n🧹 Cleaning up temp files...');
  try {
    fs.rmSync(TEMP_DIR, { recursive: true, force: true });
  } catch (err) {
    // Ignore cleanup errors
  }
  
  // Write manifest
  const manifestPath = path.join(CLIPS_DIR, 'processed-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`\n📋 Manifest saved: ${manifestPath}`);
  
  // Summary
  const successful = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;
  
  console.log('\n' + '='.repeat(50));
  console.log(`✅ Processed: ${successful}/${results.length} clips`);
  if (failed > 0) {
    console.log(`❌ Failed: ${failed}`);
    results.filter(r => !r.success).forEach(r => {
      console.log(`   - ${r.id}: ${r.error}`);
    });
  }
  console.log('='.repeat(50));
  
  return { results, manifest };
}

// Run
main().catch(err => {
  console.error('Pipeline failed:', err);
  process.exit(1);
});
