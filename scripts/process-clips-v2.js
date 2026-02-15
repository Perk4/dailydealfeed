#!/usr/bin/env node

/**
 * Process Clips V2 - Full Pipeline
 * 
 * Combines:
 * 1. Cliffhanger Cut V2 (5s clips, auto-detect impact, cut before payoff)
 * 2. Smart Crop V2 (motion-based subject tracking for 9:16)
 * 
 * Result: Viral-ready clips that end on tension and keep subject in frame
 */

const { cliffhangerCutV2 } = require('./cliffhanger-cut-v2.js');
const { smartCropV2 } = require('./smart-crop-v2.js');
const fs = require('fs');
const path = require('path');

const CONFIG = {
  // Target clip settings
  duration: 5.0,           // 5 second clips
  leadTime: 0.6,           // Cut 0.6s before impact
  
  // Directories
  rawDir: '/root/dailydealfeed/clips/raw',
  outputDir: '/root/dailydealfeed/clips/processed',
  tempDir: '/root/dailydealfeed/clips/temp',
};

async function processClip(clipId, options = {}) {
  const { verbose = false } = options;
  
  const rawPath = path.join(CONFIG.rawDir, `${clipId}-raw.mp4`);
  const tempPath = path.join(CONFIG.tempDir, `${clipId}-cut.mp4`);
  const outputPath = path.join(CONFIG.outputDir, `${clipId}.mp4`);
  
  if (!fs.existsSync(rawPath)) {
    throw new Error(`Raw clip not found: ${rawPath}`);
  }
  
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📹 Processing: ${clipId}`);
  console.log(`${'='.repeat(50)}`);
  
  // Step 1: Cliffhanger cut (trim to 5s, end before impact)
  console.log('\n📍 Step 1: Cliffhanger Cut');
  const cutResult = await cliffhangerCutV2(rawPath, tempPath, {
    duration: CONFIG.duration,
    leadTime: CONFIG.leadTime,
    verbose
  });
  
  // Step 2: Smart crop to 9:16 portrait
  console.log('\n📍 Step 2: Smart Crop to 9:16');
  const cropResult = await smartCropV2(tempPath, outputPath, { verbose });
  
  // Clean up temp file
  try { fs.unlinkSync(tempPath); } catch {}
  
  return {
    id: clipId,
    success: true,
    timing: cutResult.timing,
    crop: cropResult
  };
}

async function processAllClips(options = {}) {
  const { verbose = false, clips = null } = options;
  
  // Create temp directory
  fs.mkdirSync(CONFIG.tempDir, { recursive: true });
  fs.mkdirSync(CONFIG.outputDir, { recursive: true });
  
  // Get list of raw clips
  const rawFiles = fs.readdirSync(CONFIG.rawDir)
    .filter(f => f.endsWith('-raw.mp4'))
    .map(f => f.replace('-raw.mp4', ''))
    .filter(id => clips === null || clips.includes(id))
    .sort();
  
  console.log(`\n🎬 Processing ${rawFiles.length} clips with V2 pipeline`);
  console.log(`   Duration: ${CONFIG.duration}s, Lead: ${CONFIG.leadTime}s`);
  
  const results = [];
  
  for (const clipId of rawFiles) {
    try {
      const result = await processClip(clipId, { verbose });
      results.push(result);
    } catch (err) {
      console.log(`❌ ${clipId}: ${err.message}`);
      results.push({ id: clipId, success: false, error: err.message });
    }
  }
  
  // Summary
  console.log(`\n${'='.repeat(50)}`);
  console.log('📊 RESULTS SUMMARY');
  console.log(`${'='.repeat(50)}`);
  
  const success = results.filter(r => r.success);
  const failed = results.filter(r => !r.success);
  
  console.log(`✅ Success: ${success.length}/${results.length}`);
  
  if (success.length > 0) {
    console.log('\nClip Details:');
    for (const r of success) {
      const t = r.timing;
      console.log(`  ${r.id}: ${t.startTime.toFixed(1)}s → ${t.endTime.toFixed(1)}s (${t.duration.toFixed(1)}s) | cut ${t.leadTime}s before impact`);
    }
  }
  
  if (failed.length > 0) {
    console.log('\n❌ Failed:');
    for (const r of failed) {
      console.log(`  ${r.id}: ${r.error}`);
    }
  }
  
  // Clean up temp dir
  try { fs.rmdirSync(CONFIG.tempDir); } catch {}
  
  return results;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  
  if (args.includes('--help')) {
    console.log(`
🎬 Process Clips V2 - Full Pipeline

Usage:
  node process-clips-v2.js [options] [clip-ids...]

Options:
  --verbose, -v    Show detailed output
  --help           Show this help

Examples:
  # Process all clips
  node process-clips-v2.js

  # Process specific clips
  node process-clips-v2.js afv-001 afv-002 afv-003

  # Verbose mode
  node process-clips-v2.js --verbose
`);
    process.exit(0);
  }
  
  // Filter for specific clips if provided
  const clipIds = args.filter(a => !a.startsWith('-'));
  const clips = clipIds.length > 0 ? clipIds : null;
  
  processAllClips({ verbose, clips })
    .then(results => {
      const success = results.filter(r => r.success).length;
      process.exit(success === results.length ? 0 : 1);
    })
    .catch(err => {
      console.error(`❌ Fatal error: ${err.message}`);
      process.exit(1);
    });
}

module.exports = { processClip, processAllClips, CONFIG };
