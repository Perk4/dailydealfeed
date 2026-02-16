#!/usr/bin/env node
/**
 * Clip Evaluation System for @dailydealfeed
 * Scores clips on multiple quality metrics to filter bad hooks
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function evaluateClip(clipPath) {
  console.log(`🎬 Evaluating: ${path.basename(clipPath)}`);
  
  const result = {
    file: clipPath,
    filename: path.basename(clipPath),
    scores: {
      aspect_ratio: 0,   // 0-10
      resolution: 0,     // 0-10
      duration: 0,       // 0-10
      has_audio: 0,      // 0-10
      motion: 0,         // 0-10
      quality: 0         // 0-10
    },
    metadata: {},
    total_score: 0,
    approved: false,
    issues: []
  };
  
  // Check file exists
  if (!fs.existsSync(clipPath)) {
    result.issues.push(`File not found: ${clipPath}`);
    return result;
  }
  
  // Get video metadata with ffprobe
  try {
    const probeCmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${clipPath}"`;
    const probeOutput = JSON.parse(execSync(probeCmd).toString());
    
    const videoStream = probeOutput.streams.find(s => s.codec_type === 'video');
    const audioStream = probeOutput.streams.find(s => s.codec_type === 'audio');
    
    if (!videoStream) {
      result.issues.push('No video stream found');
      return result;
    }
    
    result.metadata = {
      width: videoStream?.width || 0,
      height: videoStream?.height || 0,
      duration: parseFloat(probeOutput.format?.duration || 0),
      has_audio: !!audioStream,
      codec: videoStream?.codec_name,
      bitrate: parseInt(probeOutput.format?.bit_rate || 0),
      fps: eval(videoStream?.r_frame_rate || '0') || 0
    };
    
    // 1. Aspect Ratio Score (9:16 = 0.5625)
    const aspectRatio = result.metadata.width / result.metadata.height;
    const targetAspect = 9/16; // 0.5625
    const aspectDiff = Math.abs(aspectRatio - targetAspect);
    if (aspectDiff < 0.03) result.scores.aspect_ratio = 10;
    else if (aspectDiff < 0.05) result.scores.aspect_ratio = 8;
    else if (aspectDiff < 0.1) result.scores.aspect_ratio = 5;
    else {
      result.scores.aspect_ratio = 2;
      result.issues.push(`Wrong aspect ratio: ${aspectRatio.toFixed(3)} (need ~0.5625)`);
    }
    
    // 2. Resolution Score
    const height = result.metadata.height;
    if (height >= 1920) result.scores.resolution = 10;
    else if (height >= 1080) result.scores.resolution = 9;
    else if (height >= 720) result.scores.resolution = 7;
    else if (height >= 480) result.scores.resolution = 5;
    else {
      result.scores.resolution = 3;
      result.issues.push(`Low resolution: ${height}p (need ≥720p)`);
    }
    
    // 3. Duration Score (4-6s ideal for hooks)
    const duration = result.metadata.duration;
    if (duration >= 4 && duration <= 6) result.scores.duration = 10;
    else if (duration >= 3 && duration <= 8) result.scores.duration = 7;
    else if (duration >= 2 && duration <= 10) result.scores.duration = 5;
    else {
      result.scores.duration = 3;
      result.issues.push(`Duration ${duration.toFixed(1)}s (ideal: 4-6s)`);
    }
    
    // 4. Audio Score
    result.scores.has_audio = result.metadata.has_audio ? 10 : 3;
    if (!result.metadata.has_audio) {
      result.issues.push('No audio track');
    }
    
    // 5. Motion Score - skip expensive scene detection for speed, use duration-based heuristic
    // Short clips with good fps tend to have more action
    const fps = result.metadata.fps;
    if (fps >= 30) result.scores.motion = 8;
    else if (fps >= 24) result.scores.motion = 7;
    else if (fps >= 15) result.scores.motion = 5;
    else result.scores.motion = 4;
    
    result.metadata.scene_changes = -1; // Not calculated for speed
    
    // 6. Quality Score (check bitrate as proxy)
    const bitrate = result.metadata.bitrate;
    if (bitrate > 3000000) result.scores.quality = 10;
    else if (bitrate > 2000000) result.scores.quality = 9;
    else if (bitrate > 1000000) result.scores.quality = 7;
    else if (bitrate > 500000) result.scores.quality = 5;
    else if (bitrate > 0) result.scores.quality = 3;
    else result.scores.quality = 5; // Unknown bitrate
    
  } catch (error) {
    result.issues.push(`Probe error: ${error.message}`);
    return result;
  }
  
  // Calculate total score (weighted average)
  const weights = {
    aspect_ratio: 2.0,  // Most important - wrong ratio = bad hook
    resolution: 1.5,    // High res looks professional
    duration: 1.0,      // Ideal hook length
    has_audio: 1.5,     // Audio is engaging
    motion: 1.0,        // Action = engaging
    quality: 1.0        // Visual quality
  };
  
  let totalWeight = 0;
  let weightedSum = 0;
  for (const [key, weight] of Object.entries(weights)) {
    weightedSum += result.scores[key] * weight;
    totalWeight += weight;
  }
  
  result.total_score = parseFloat((weightedSum / totalWeight).toFixed(2));
  
  // Approval criteria: score >= 7.0 AND less than 2 critical issues
  const criticalIssues = result.issues.filter(i => 
    i.includes('aspect ratio') || 
    i.includes('Low resolution') ||
    i.includes('No video stream')
  );
  
  result.approved = result.total_score >= 6.5 && criticalIssues.length === 0;
  
  return result;
}

// Export for use as module
module.exports = { evaluateClip };

// CLI
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node evaluate-clip.js <clip.mp4> [--json]');
    console.log('       node evaluate-clip.js <directory> [--json]');
    process.exit(1);
  }
  
  const target = args[0];
  const jsonOutput = args.includes('--json');
  
  // Check if it's a directory
  const stat = fs.statSync(target);
  
  if (stat.isDirectory()) {
    const files = fs.readdirSync(target)
      .filter(f => f.endsWith('.mp4') && !f.includes('.part'))
      .map(f => path.join(target, f));
    
    const results = [];
    for (const file of files) {
      const result = await evaluateClip(file);
      results.push(result);
    }
    
    if (jsonOutput) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(`\n=== Evaluated ${results.length} clips ===`);
      const approved = results.filter(r => r.approved);
      const rejected = results.filter(r => !r.approved);
      
      console.log(`✅ Approved: ${approved.length}`);
      console.log(`❌ Rejected: ${rejected.length}`);
      
      // Top 5
      const sorted = results.sort((a, b) => b.total_score - a.total_score);
      console.log('\n📊 Top 5 by score:');
      sorted.slice(0, 5).forEach((r, i) => {
        const status = r.approved ? '✅' : '❌';
        console.log(`  ${i+1}. ${status} ${r.filename} - ${r.total_score}/10`);
      });
    }
  } else {
    const result = await evaluateClip(target);
    
    if (jsonOutput) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(JSON.stringify(result, null, 2));
      
      if (result.approved) {
        console.log(`\n✅ APPROVED (${result.total_score}/10)`);
      } else {
        console.log(`\n❌ REJECTED (${result.total_score}/10): ${result.issues.join(', ')}`);
      }
    }
  }
}

if (require.main === module) {
  main().catch(console.error);
}
