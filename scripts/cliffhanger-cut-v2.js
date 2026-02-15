#!/usr/bin/env node

/**
 * Cliffhanger Cut V2 - Peak Tension Extraction
 * 
 * WHAT CHANGED FROM V1:
 * - Duration: 5 seconds default (was 3) for better setup → tension → cut
 * - Auto-detect impact moment using motion spike analysis
 * - Cut 0.5-1s BEFORE impact for maximum "wait what?!" effect
 * - Audio peak correlation for impact timing validation
 * 
 * The psychology:
 * - Human brain CRAVES closure
 * - Cut RIGHT before the payoff = dopamine anticipation
 * - Viewer is compelled to keep watching/scrolling to find "what happened"
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  // Timing defaults (CHANGED: 5s instead of 3s)
  defaultDuration: 5.0,       // 5 seconds for setup + tension
  defaultLeadTime: 0.6,       // Cut 0.6s before impact (sweet spot)
  minDuration: 4.0,           // Don't go below 4s
  maxDuration: 6.0,           // Don't exceed 6s
  
  // Impact detection
  motionSpikeThreshold: 0.3,  // 30% motion increase = spike
  audioSpikeThreshold: -20,   // dB level for audio spike
  
  // Encoding
  codec: 'libx264',
  preset: 'fast',
  crf: 22,
};

/**
 * Get video duration
 */
function getVideoDuration(inputPath) {
  const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${inputPath}"`;
  return parseFloat(execSync(cmd, { encoding: 'utf8' }).trim());
}

/**
 * Detect motion spikes in video
 * Returns array of timestamps where motion suddenly increases (potential impacts)
 */
async function detectMotionSpikes(inputPath, verbose = false) {
  const duration = getVideoDuration(inputPath);
  
  if (verbose) console.log('  Analyzing motion for spikes...');
  
  try {
    // Use scene change detection with a low threshold
    // Scene changes often correlate with impact moments
    const cmd = `ffmpeg -i "${inputPath}" -vf "select='gt(scene,0.15)',showinfo" -vsync vfr -f null - 2>&1`;
    const output = execSync(cmd, { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });
    
    // Parse timestamps
    const spikes = [];
    const regex = /pts_time:(\d+\.?\d*)/g;
    let match;
    while ((match = regex.exec(output)) !== null) {
      const timestamp = parseFloat(match[1]);
      // Only consider spikes in the middle-to-end of the clip (where impacts happen)
      if (timestamp > duration * 0.3) {
        spikes.push(timestamp);
      }
    }
    
    if (verbose) console.log(`  Found ${spikes.length} motion spikes`);
    
    return spikes;
  } catch (err) {
    if (verbose) console.log(`  Motion detection failed: ${err.message}`);
    return [];
  }
}

/**
 * Detect audio peaks (impacts often make noise!)
 */
async function detectAudioPeaks(inputPath, verbose = false) {
  const duration = getVideoDuration(inputPath);
  
  try {
    // Find audio volume peaks
    const cmd = `ffmpeg -i "${inputPath}" -af "volumedetect" -vn -f null - 2>&1`;
    const output = execSync(cmd, { encoding: 'utf8' });
    
    // Also try to find sudden volume increases
    const peakCmd = `ffmpeg -i "${inputPath}" -af "silencedetect=noise=-25dB:d=0.1" -vn -f null - 2>&1 | grep silence_end`;
    let peakOutput = '';
    try {
      peakOutput = execSync(peakCmd, { encoding: 'utf8' });
    } catch { /* no peaks found */ }
    
    // Parse silence ends (= sound starts = potential impacts)
    const peaks = [];
    const regex = /silence_end:\s*(\d+\.?\d*)/g;
    let match;
    while ((match = regex.exec(peakOutput)) !== null) {
      const timestamp = parseFloat(match[1]);
      if (timestamp > duration * 0.4) {
        peaks.push(timestamp);
      }
    }
    
    if (verbose && peaks.length > 0) console.log(`  Found ${peaks.length} audio peaks`);
    
    return peaks;
  } catch (err) {
    return [];
  }
}

/**
 * Find the best impact moment in a clip
 * Combines motion spikes and audio peaks
 */
async function findImpactMoment(inputPath, options = {}) {
  const { verbose = false, hintTimestamp = null } = options;
  const duration = getVideoDuration(inputPath);
  
  // If we have a hint (from timestamps file), validate it
  if (hintTimestamp !== null && hintTimestamp > 0 && hintTimestamp < duration) {
    if (verbose) console.log(`  Using hint timestamp: ${hintTimestamp.toFixed(2)}s`);
    return hintTimestamp;
  }
  
  // Auto-detect: combine motion and audio analysis
  const [motionSpikes, audioPeaks] = await Promise.all([
    detectMotionSpikes(inputPath, verbose),
    detectAudioPeaks(inputPath, verbose)
  ]);
  
  // Combine and weight the spikes
  const allSpikes = [];
  
  for (const spike of motionSpikes) {
    allSpikes.push({ time: spike, source: 'motion', weight: 1.0 });
  }
  
  for (const peak of audioPeaks) {
    // Check if there's a nearby motion spike (within 0.5s)
    const hasMotion = motionSpikes.some(s => Math.abs(s - peak) < 0.5);
    allSpikes.push({ time: peak, source: 'audio', weight: hasMotion ? 2.0 : 0.8 });
  }
  
  if (allSpikes.length === 0) {
    // No spikes detected, assume impact is near the end
    if (verbose) console.log('  No spikes detected, assuming impact at 75% mark');
    return duration * 0.75;
  }
  
  // Find the most significant spike (prefer later ones in the clip)
  allSpikes.sort((a, b) => {
    // Weight by position (later = more likely to be the "payoff")
    const positionWeight = (s) => s.time / duration;
    return (b.weight * positionWeight(b)) - (a.weight * positionWeight(a));
  });
  
  const bestSpike = allSpikes[0];
  if (verbose) console.log(`  Best impact: ${bestSpike.time.toFixed(2)}s (${bestSpike.source})`);
  
  return bestSpike.time;
}

/**
 * Create a cliffhanger cut
 * 
 * @param {string} inputPath - Source video
 * @param {string} outputPath - Output path
 * @param {Object} options
 * @param {number} [options.impactMoment] - Known impact timestamp (optional, auto-detects if not provided)
 * @param {number} [options.duration=5.0] - Target duration (4-6s recommended)
 * @param {number} [options.leadTime=0.6] - Cut this many seconds BEFORE impact
 * @param {boolean} [options.verbose] - Show detailed output
 */
async function cliffhangerCutV2(inputPath, outputPath, options = {}) {
  let {
    impactMoment = null,
    duration = CONFIG.defaultDuration,
    leadTime = CONFIG.defaultLeadTime,
    verbose = false
  } = options;
  
  if (!fs.existsSync(inputPath)) {
    throw new Error(`File not found: ${inputPath}`);
  }
  
  const videoDuration = getVideoDuration(inputPath);
  console.log(`🔪 Cliffhanger Cut V2: ${path.basename(inputPath)}`);
  console.log(`  Source: ${videoDuration.toFixed(2)}s`);
  
  // Clamp duration to valid range
  duration = Math.max(CONFIG.minDuration, Math.min(CONFIG.maxDuration, duration));
  
  // Find or validate impact moment
  if (impactMoment === null || impactMoment === undefined) {
    impactMoment = await findImpactMoment(inputPath, { verbose });
  } else if (verbose) {
    console.log(`  Using provided impact: ${impactMoment.toFixed(2)}s`);
  }
  
  // Calculate cliffhanger timing
  // END = impact - leadTime (the "wait what?!" moment)
  // START = END - duration (enough setup time)
  const endTime = Math.max(leadTime + 0.5, Math.min(videoDuration - 0.1, impactMoment - leadTime));
  let startTime = endTime - duration;
  
  // Don't go before video start
  if (startTime < 0) {
    startTime = 0;
  }
  
  const actualDuration = endTime - startTime;
  
  console.log(`  Impact: ${impactMoment.toFixed(2)}s → Cut: ${endTime.toFixed(2)}s (${leadTime}s before)`);
  console.log(`  Clip: ${startTime.toFixed(2)}s → ${endTime.toFixed(2)}s (${actualDuration.toFixed(2)}s)`);
  
  // Build FFmpeg command
  const cmd = [
    'ffmpeg', '-y',
    '-ss', startTime.toFixed(3),
    '-i', `"${inputPath}"`,
    '-t', actualDuration.toFixed(3),
    '-c:v', CONFIG.codec,
    '-preset', CONFIG.preset,
    '-crf', CONFIG.crf,
    '-c:a', 'aac', '-b:a', '128k',
    '-movflags', '+faststart',
    `"${outputPath}"`
  ].join(' ');
  
  if (verbose) console.log(`  Running: ${cmd}`);
  
  return new Promise((resolve, reject) => {
    const proc = spawn('sh', ['-c', cmd], { stdio: verbose ? 'inherit' : 'pipe' });
    
    proc.on('close', code => {
      if (code === 0) {
        console.log(`  ✅ Output: ${outputPath}`);
        resolve({
          success: true,
          outputPath,
          timing: {
            startTime,
            endTime,
            duration: actualDuration,
            impactMoment,
            leadTime,
            cliffhangerAt: endTime
          }
        });
      } else {
        reject(new Error(`FFmpeg exit code ${code}`));
      }
    });
    
    proc.on('error', reject);
  });
}

/**
 * Process multiple clips from timestamp metadata
 */
async function processFromTimestamps(timestampFile, sourceDir, outputDir, globalOptions = {}) {
  const data = JSON.parse(fs.readFileSync(timestampFile, 'utf8'));
  
  // Handle nested structure from afv-timestamps.json
  const allMoments = [];
  
  if (data.source_videos) {
    for (const source of data.source_videos) {
      if (source.moments) {
        for (const moment of source.moments) {
          allMoments.push(moment);
        }
      }
    }
  } else if (Array.isArray(data)) {
    allMoments.push(...data);
  } else if (data.clips) {
    allMoments.push(...data.clips);
  }
  
  fs.mkdirSync(outputDir, { recursive: true });
  
  const results = [];
  
  for (const clip of allMoments) {
    const clipId = clip.id || clip.name;
    const sourceFile = `${clipId}-raw.mp4`;
    const inputPath = path.join(sourceDir, sourceFile);
    const outputPath = path.join(outputDir, `${clipId}.mp4`);
    
    // Parse impact moment (handles "M:SS" format)
    let impactMoment = null;
    if (clip.impact_moment) {
      const match = clip.impact_moment.match(/^(\d+):(\d+)$/);
      if (match) {
        impactMoment = parseInt(match[1]) * 60 + parseInt(match[2]);
      } else {
        impactMoment = parseFloat(clip.impact_moment);
      }
    }
    
    // The raw clips are already extracted segments, so impact_moment is relative to source
    // We need to find the actual impact in the raw clip
    // For now, use auto-detection on the raw clip
    
    try {
      const result = await cliffhangerCutV2(inputPath, outputPath, {
        impactMoment: null, // Auto-detect from raw clip
        duration: globalOptions.duration || CONFIG.defaultDuration,
        leadTime: globalOptions.leadTime || CONFIG.defaultLeadTime,
        verbose: globalOptions.verbose
      });
      
      results.push({ id: clipId, ...result });
    } catch (err) {
      console.log(`  ❌ ${clipId}: ${err.message}`);
      results.push({ id: clipId, success: false, error: err.message });
    }
  }
  
  return results;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
🔪 Cliffhanger Cut V2 - Peak Tension Extraction

Creates clips that end RIGHT BEFORE the payoff moment for maximum engagement.

Usage:
  node cliffhanger-cut-v2.js <input> <output> [options]
  node cliffhanger-cut-v2.js --batch <timestamps.json> --source <dir> --output <dir>

Options:
  --impact <seconds>     When the action happens (auto-detected if not provided)
  --duration <seconds>   Clip length (default: 5.0, range: 4-6s)
  --lead <seconds>       How far before impact to cut (default: 0.6s)
  --verbose, -v          Detailed output

Examples:
  # Auto-detect impact and create 5s cliffhanger
  node cliffhanger-cut-v2.js raw.mp4 cliffhanger.mp4

  # Manual impact time
  node cliffhanger-cut-v2.js raw.mp4 cliffhanger.mp4 --impact 6.5

  # Process all AFV clips
  node cliffhanger-cut-v2.js --batch afv-timestamps.json --source ./raw --output ./processed
`);
    process.exit(0);
  }
  
  // Batch mode
  if (args.includes('--batch')) {
    const batchIdx = args.indexOf('--batch');
    const sourceIdx = args.indexOf('--source');
    const outputIdx = args.indexOf('--output');
    const durationIdx = args.indexOf('--duration');
    const leadIdx = args.indexOf('--lead');
    const verbose = args.includes('--verbose') || args.includes('-v');
    
    const timestampFile = args[batchIdx + 1];
    const sourceDir = sourceIdx !== -1 ? args[sourceIdx + 1] : './raw';
    const outputDir = outputIdx !== -1 ? args[outputIdx + 1] : './processed';
    
    const options = {
      verbose,
      duration: durationIdx !== -1 ? parseFloat(args[durationIdx + 1]) : CONFIG.defaultDuration,
      leadTime: leadIdx !== -1 ? parseFloat(args[leadIdx + 1]) : CONFIG.defaultLeadTime
    };
    
    processFromTimestamps(timestampFile, sourceDir, outputDir, options)
      .then(results => {
        const success = results.filter(r => r.success).length;
        console.log(`\n✅ Processed ${results.length} clips. ${success} succeeded.`);
      })
      .catch(err => {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      });
  } else {
    // Single file mode
    const inputPath = args[0];
    const outputPath = args[1] && !args[1].startsWith('-') ? args[1] : inputPath.replace('.mp4', '-cliffhanger.mp4');
    
    const impactIdx = args.indexOf('--impact');
    const durationIdx = args.indexOf('--duration');
    const leadIdx = args.indexOf('--lead');
    const verbose = args.includes('--verbose') || args.includes('-v');
    
    const options = {
      impactMoment: impactIdx !== -1 ? parseFloat(args[impactIdx + 1]) : null,
      duration: durationIdx !== -1 ? parseFloat(args[durationIdx + 1]) : CONFIG.defaultDuration,
      leadTime: leadIdx !== -1 ? parseFloat(args[leadIdx + 1]) : CONFIG.defaultLeadTime,
      verbose
    };
    
    cliffhangerCutV2(inputPath, outputPath, options)
      .then(() => {
        console.log('✅ Done!');
        process.exit(0);
      })
      .catch(err => {
        console.error(`❌ Error: ${err.message}`);
        process.exit(1);
      });
  }
}

module.exports = { cliffhangerCutV2, findImpactMoment, processFromTimestamps, CONFIG };
