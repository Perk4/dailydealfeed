#!/usr/bin/env node
/**
 * cliffhanger-cut.js
 * 
 * Creates engagement-maximizing clips by cutting RIGHT BEFORE the payoff moment.
 * 
 * Psychology: Human brain NEEDS closure. Cut before payoff = viewer watches longer,
 * hoping to see what happens. This is how viral TikToks work.
 * 
 * @example
 * // Raw clip: kid swings bat at 6.0s
 * // Impact moment: 6.0s, leadTime: 0.5s, duration: 3.0s
 * // Output: clip from 2.5s to 5.5s (ends just before swing completes)
 */

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs').promises;
const path = require('path');

const execAsync = promisify(exec);

// Lead time presets based on content type
const LEAD_TIME_PRESETS = {
  physical: 0.5,      // Falls, hits, collisions — need anticipation buildup
  reaction: 0.3,      // Facial reactions, reveals — tighter cut
  suspense: 0.7,      // Building tension moments — longer buildup
  quick: 0.25,        // Very fast actions — minimal lead
  default: 0.5
};

/**
 * Cut a clip to end right before the impact moment (cliffhanger style)
 * 
 * @param {string} inputPath - Path to source video
 * @param {string} outputPath - Path for output clip
 * @param {Object} options - Cutting options
 * @param {number} options.impactTimestamp - When the action/payoff happens (seconds)
 * @param {number} [options.leadTime=0.5] - Seconds before impact to cut
 * @param {number} [options.duration=3.0] - Total clip duration
 * @param {string} [options.preset] - Use a lead time preset (physical/reaction/suspense/quick)
 * @param {boolean} [options.fadeOut=false] - Add subtle fade at end
 * @param {number} [options.minStart=0] - Don't start before this timestamp
 * @returns {Promise<{success: boolean, outputPath: string, timing: Object}>}
 */
async function cliffhangerCut(inputPath, outputPath, options = {}) {
  const {
    impactTimestamp,
    leadTime = options.preset ? LEAD_TIME_PRESETS[options.preset] : LEAD_TIME_PRESETS.default,
    duration = 3.0,
    fadeOut = false,
    minStart = 0
  } = options;

  if (impactTimestamp === undefined) {
    throw new Error('impactTimestamp is required — when does the payoff happen?');
  }

  // Calculate cliffhanger timing
  // End = just before the impact (the "wait what?!" moment)
  const endTime = impactTimestamp - leadTime;
  
  // Start = enough time to build up to the cliffhanger
  let startTime = endTime - duration;
  
  // Don't go negative or before allowed minimum
  if (startTime < minStart) {
    startTime = minStart;
    // Adjust actual duration if we hit the boundary
  }
  
  const actualDuration = endTime - startTime;
  
  if (actualDuration <= 0) {
    throw new Error(`Invalid timing: impact at ${impactTimestamp}s with ${leadTime}s lead and ${duration}s duration results in negative clip`);
  }

  // Build ffmpeg command
  let filters = [];
  
  if (fadeOut) {
    // Subtle 0.3s fade at the end to soften the cut
    filters.push(`fade=t=out:st=${actualDuration - 0.3}:d=0.3`);
  }

  const filterArg = filters.length > 0 ? `-vf "${filters.join(',')}"` : '';
  
  // Use -ss before -i for fast seeking, but use -accurate_seek for precision
  const cmd = `ffmpeg -y -ss ${startTime.toFixed(3)} -i "${inputPath}" -t ${actualDuration.toFixed(3)} ${filterArg} -c:v libx264 -preset fast -crf 18 -c:a aac -b:a 128k "${outputPath}"`;
  
  try {
    await execAsync(cmd);
    
    return {
      success: true,
      outputPath,
      timing: {
        startTime,
        endTime,
        actualDuration,
        impactTimestamp,
        leadTime,
        cliffhangerMoment: endTime
      }
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      command: cmd
    };
  }
}

/**
 * Get video duration using ffprobe
 */
async function getVideoDuration(videoPath) {
  const cmd = `ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 "${videoPath}"`;
  const { stdout } = await execAsync(cmd);
  return parseFloat(stdout.trim());
}

/**
 * Process multiple clips from timestamp metadata file
 * 
 * @param {string} timestampFile - Path to afv-timestamps.json
 * @param {string} sourceDir - Directory containing source videos
 * @param {string} outputDir - Directory for output clips
 * @param {Object} [globalOptions] - Options to apply to all clips
 */
async function processFromTimestamps(timestampFile, sourceDir, outputDir, globalOptions = {}) {
  const timestampData = JSON.parse(await fs.readFile(timestampFile, 'utf8'));
  
  // Handle both array and object formats
  const clips = Array.isArray(timestampData) ? timestampData : timestampData.clips || timestampData.moments || [];
  
  await fs.mkdir(outputDir, { recursive: true });
  
  const results = [];
  
  for (const clip of clips) {
    // Support multiple field naming conventions
    const impactTimestamp = clip.impact_moment ?? clip.impactMoment ?? clip.impact ?? clip.payoff;
    const sourceFile = clip.file ?? clip.filename ?? clip.source;
    const clipId = clip.id ?? clip.name ?? path.basename(sourceFile, path.extname(sourceFile));
    
    if (!impactTimestamp || !sourceFile) {
      results.push({
        id: clipId,
        success: false,
        error: 'Missing impact_moment or file in timestamp data'
      });
      continue;
    }
    
    const inputPath = path.join(sourceDir, sourceFile);
    const outputPath = path.join(outputDir, `cliffhanger_${clipId}.mp4`);
    
    try {
      const result = await cliffhangerCut(inputPath, outputPath, {
        impactTimestamp,
        leadTime: clip.lead_time ?? globalOptions.leadTime ?? 0.5,
        duration: clip.duration ?? globalOptions.duration ?? 3.0,
        minStart: clip.start ?? 0,
        ...globalOptions
      });
      
      results.push({
        id: clipId,
        ...result
      });
      
      if (result.success) {
        console.log(`✅ ${clipId}: Cut at ${result.timing.cliffhangerMoment.toFixed(2)}s (${result.timing.actualDuration.toFixed(2)}s clip)`);
      }
    } catch (error) {
      results.push({
        id: clipId,
        success: false,
        error: error.message
      });
      console.log(`❌ ${clipId}: ${error.message}`);
    }
  }
  
  return results;
}

/**
 * Interactive mode: Analyze a clip and suggest impact moments
 * Uses audio peaks and scene changes as hints
 */
async function analyzeForImpact(videoPath) {
  // Detect audio peaks (often correlate with impact moments)
  const audioPeaksCmd = `ffmpeg -i "${videoPath}" -af "silencedetect=noise=-30dB:d=0.5,astats=metadata=1:reset=1" -f null - 2>&1 | grep -E "lavfi\\.(astats\\.Overall\\.Peak|silence)" | head -20`;
  
  // Detect scene changes
  const sceneChangeCmd = `ffmpeg -i "${videoPath}" -vf "select='gt(scene,0.3)',showinfo" -f null - 2>&1 | grep showinfo | head -10`;
  
  try {
    const [audioPeaks, sceneChanges] = await Promise.all([
      execAsync(audioPeaksCmd).catch(() => ({ stdout: '' })),
      execAsync(sceneChangeCmd).catch(() => ({ stdout: '' }))
    ]);
    
    const duration = await getVideoDuration(videoPath);
    
    return {
      duration,
      hints: {
        audioPeaks: audioPeaks.stdout,
        sceneChanges: sceneChanges.stdout
      },
      suggestion: `Video is ${duration.toFixed(2)}s. Check scene changes and audio peaks above for likely impact moments.`
    };
  } catch (error) {
    return { error: error.message };
  }
}

/**
 * Test different lead times on the same clip to find optimal
 */
async function testLeadTimes(inputPath, outputDir, impactTimestamp, duration = 3.0) {
  const leadTimes = [0.25, 0.3, 0.4, 0.5, 0.6, 0.7];
  const results = [];
  
  await fs.mkdir(outputDir, { recursive: true });
  
  for (const leadTime of leadTimes) {
    const outputPath = path.join(outputDir, `test_lead_${leadTime.toFixed(2).replace('.', '_')}s.mp4`);
    
    const result = await cliffhangerCut(inputPath, outputPath, {
      impactTimestamp,
      leadTime,
      duration
    });
    
    results.push({
      leadTime,
      ...result
    });
    
    console.log(`Lead ${leadTime}s: ends at ${(impactTimestamp - leadTime).toFixed(2)}s`);
  }
  
  return results;
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args.includes('--help')) {
    console.log(`
🎬 Cliffhanger Cut — End clips RIGHT BEFORE the payoff

Usage:
  node cliffhanger-cut.js <input> <output> --impact <seconds> [options]
  node cliffhanger-cut.js --batch <timestamps.json> --source <dir> --output <dir>
  node cliffhanger-cut.js --analyze <video>
  node cliffhanger-cut.js --test-leads <input> --impact <seconds> --output <dir>

Options:
  --impact <seconds>     When the payoff/action happens (REQUIRED for single clip)
  --lead <seconds>       How much before impact to cut (default: 0.5)
  --duration <seconds>   Total clip length (default: 3.0)
  --preset <name>        Use preset: physical(0.5), reaction(0.3), suspense(0.7), quick(0.25)
  --fade                 Add subtle fade out at end

Examples:
  # Kid swings bat at 6.0s — cut just before
  node cliffhanger-cut.js raw.mp4 cliffhanger.mp4 --impact 6.0 --lead 0.5

  # Process all clips from timestamps file
  node cliffhanger-cut.js --batch afv-timestamps.json --source ./raw --output ./cliffhangers

  # Test different lead times to find optimal
  node cliffhanger-cut.js --test-leads raw.mp4 --impact 6.0 --output ./tests
    `);
    return;
  }

  // Batch mode
  if (args.includes('--batch')) {
    const batchIdx = args.indexOf('--batch');
    const sourceIdx = args.indexOf('--source');
    const outputIdx = args.indexOf('--output');
    
    const timestampFile = args[batchIdx + 1];
    const sourceDir = sourceIdx !== -1 ? args[sourceIdx + 1] : '.';
    const outputDir = outputIdx !== -1 ? args[outputIdx + 1] : './cliffhangers';
    
    const results = await processFromTimestamps(timestampFile, sourceDir, outputDir);
    console.log(`\nProcessed ${results.length} clips. ${results.filter(r => r.success).length} succeeded.`);
    return;
  }

  // Analyze mode
  if (args.includes('--analyze')) {
    const analyzeIdx = args.indexOf('--analyze');
    const videoPath = args[analyzeIdx + 1];
    const analysis = await analyzeForImpact(videoPath);
    console.log(JSON.stringify(analysis, null, 2));
    return;
  }

  // Test leads mode
  if (args.includes('--test-leads')) {
    const testIdx = args.indexOf('--test-leads');
    const impactIdx = args.indexOf('--impact');
    const outputIdx = args.indexOf('--output');
    
    const inputPath = args[testIdx + 1];
    const impact = parseFloat(args[impactIdx + 1]);
    const outputDir = outputIdx !== -1 ? args[outputIdx + 1] : './lead_tests';
    
    await testLeadTimes(inputPath, outputDir, impact);
    return;
  }

  // Single file mode
  const inputPath = args[0];
  const outputPath = args[1];
  
  const impactIdx = args.indexOf('--impact');
  const leadIdx = args.indexOf('--lead');
  const durationIdx = args.indexOf('--duration');
  const presetIdx = args.indexOf('--preset');
  
  if (impactIdx === -1) {
    console.error('Error: --impact <seconds> is required. When does the payoff happen?');
    process.exit(1);
  }
  
  const options = {
    impactTimestamp: parseFloat(args[impactIdx + 1]),
    leadTime: leadIdx !== -1 ? parseFloat(args[leadIdx + 1]) : undefined,
    duration: durationIdx !== -1 ? parseFloat(args[durationIdx + 1]) : 3.0,
    preset: presetIdx !== -1 ? args[presetIdx + 1] : undefined,
    fadeOut: args.includes('--fade')
  };
  
  const result = await cliffhangerCut(inputPath, outputPath, options);
  
  if (result.success) {
    console.log(`✅ Cliffhanger created!`);
    console.log(`   Clip: ${result.timing.startTime.toFixed(2)}s → ${result.timing.endTime.toFixed(2)}s`);
    console.log(`   Cuts ${result.timing.leadTime}s BEFORE impact at ${result.timing.impactTimestamp}s`);
    console.log(`   Duration: ${result.timing.actualDuration.toFixed(2)}s`);
    console.log(`   Output: ${result.outputPath}`);
  } else {
    console.error(`❌ Failed: ${result.error}`);
    process.exit(1);
  }
}

// Export for module use
module.exports = {
  cliffhangerCut,
  processFromTimestamps,
  analyzeForImpact,
  testLeadTimes,
  getVideoDuration,
  LEAD_TIME_PRESETS
};

// Run CLI if executed directly
if (require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
