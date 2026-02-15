#!/usr/bin/env node
/**
 * Vibe Alignment Test
 * Tests product-clip matching by generating a video with proper clip selection
 * 
 * This test:
 * 1. Uses scout.js to select product and matching clip
 * 2. Passes the local cached clip to editor.js
 * 3. Generates video with proper vibe alignment
 * 4. Outputs QA scoring
 */

const fs = require('fs');
const path = require('path');
const { scout, loadClipsLibrary } = require('./scout.js');
const { editVideo } = require('./editor.js');

const OUTPUT_DIR = path.join(__dirname, '..', 'output');
const SCRIPT_MAP_FILE = path.join(__dirname, 'script-map.json');

// Load script map for conversational scripts
function loadScriptMap() {
  return JSON.parse(fs.readFileSync(SCRIPT_MAP_FILE, 'utf8'));
}

// Generate vibe alignment report
function generateVibeReport(scoutResult, scriptMap) {
  const productId = scoutResult.product_id;
  const script = scriptMap.scripts[productId];
  
  console.log('\n' + '='.repeat(60));
  console.log('📊 VIBE ALIGNMENT ANALYSIS');
  console.log('='.repeat(60));
  
  console.log(`\nProduct: ${scoutResult.product_name} (ID: ${productId})`);
  console.log(`Category: ${scoutResult.product_category}`);
  console.log(`Price: ${scoutResult.product_price}`);
  
  console.log('\n--- Clip Selection ---');
  console.log(`Clip ID: ${scoutResult.clip_id}`);
  console.log(`Clip Vibe: ${scoutResult.clip_vibe}`);
  console.log(`Local Path: ${scoutResult.clip_local_path || 'Not cached'}`);
  
  console.log('\n--- Script ---');
  if (script) {
    console.log(`Hook: "${script.hook}"`);
    console.log(`Product Line: "${script.product_line}"`);
    console.log(`Full Script: "${script.full_script}"`);
    console.log(`Est. Duration: ${script.estimated_duration}s`);
  } else {
    console.log(`Hook (generated): "${scoutResult.hook_angle}"`);
  }
  
  console.log('\n--- Vibe Match Score ---');
  const vibeMatchScore = scoreVibeMatch(script, scoutResult);
  console.log(`Score: ${vibeMatchScore}/10`);
  
  return {
    product_id: productId,
    product_name: scoutResult.product_name,
    clip_id: scoutResult.clip_id,
    clip_vibe: scoutResult.clip_vibe,
    hook: script?.hook || scoutResult.hook_angle,
    vibe_match_score: vibeMatchScore
  };
}

// Score vibe alignment
function scoreVibeMatch(script, scoutResult) {
  const vibe = scoutResult.clip_vibe;
  const hook = script?.hook || scoutResult.hook_angle || '';
  
  // Vibe-hook matching rules
  const vibeKeywords = {
    'shocked': ['disturbed', 'disgusting', 'wtf', 'shocked', 'warning', 'eating'],
    'reveal': ['transformation', 'versus', 'vs', 'before', 'after', 'watch this', 'paste'],
    'reaction': ['changed', 'finally', 'vibes', 'worth', 'different', 'game changer'],
    'fail': ['hate', 'annoying', 'problem', 'chaos', 'mess'],
    'cozy': ['vibes', 'room', 'aesthetic', 'morning', 'cute']
  };
  
  const keywords = vibeKeywords[vibe] || [];
  const hookLower = hook.toLowerCase();
  
  let matchCount = 0;
  for (const keyword of keywords) {
    if (hookLower.includes(keyword)) {
      matchCount++;
    }
  }
  
  // Base score on keyword matches
  let score = Math.min(10, 5 + matchCount * 2);
  
  // Specific good matches
  if (vibe === 'reveal' && hookLower.includes('transform')) score = 9;
  if (vibe === 'shocked' && hookLower.includes('disturb')) score = 9;
  if (vibe === 'reaction' && hookLower.includes('changed')) score = 8;
  
  return score;
}

async function runTest(productId = null) {
  console.log('🧪 Vibe Alignment Test Starting...\n');
  
  // Run scout to get product + clip
  console.log('🔍 Running scout...');
  const scoutResult = scout(productId);
  
  // Load script map
  const scriptMap = loadScriptMap();
  
  // Generate vibe report
  const vibeReport = generateVibeReport(scoutResult, scriptMap);
  
  // Check if clip is cached locally
  if (!scoutResult.clip_local_path) {
    console.log('\n⚠️  Clip not cached locally! Using remote URL.');
  }
  
  // Prepare input for editor using local clip path
  const script = scriptMap.scripts[scoutResult.product_id];
  const editorInput = {
    product_id: scoutResult.product_id,
    product_name: scoutResult.product_name,
    product_image: scoutResult.product_image,
    product_price: scoutResult.product_price,
    meme_url: scoutResult.clip_local_path || scoutResult.clip_url,
    hook_angle: script?.hook || scoutResult.hook_angle,
    clip_vibe: scoutResult.clip_vibe
  };
  
  console.log('\n🎬 Generating test video...');
  console.log(`Input: ${JSON.stringify(editorInput, null, 2)}`);
  
  try {
    const result = await editVideo(editorInput);
    
    console.log('\n' + '='.repeat(60));
    console.log('✅ VIDEO GENERATED SUCCESSFULLY');
    console.log('='.repeat(60));
    console.log(`Video: ${result.video_path}`);
    console.log(`Duration: ${result.duration_seconds}s`);
    console.log(`Voiceover: ${result.has_voiceover ? 'Yes' : 'No'}`);
    console.log(`Music: ${result.has_background_music ? 'Yes' : 'No'}`);
    
    // QA Framework scoring
    console.log('\n' + '='.repeat(60));
    console.log('📝 QA FRAMEWORK SCORING');
    console.log('='.repeat(60));
    console.log(`
| Dimension          | Score | Notes |
|--------------------|-------|-------|
| Hook impact        | ${vibeReport.vibe_match_score}/10 | Vibe: ${scoutResult.clip_vibe}, Hook: "${script?.hook?.slice(0, 30) || scoutResult.hook_angle?.slice(0, 30)}..." |
| Voice naturalness  | TBD   | Check voiceover quality manually |
| Script authenticity| ${script ? '9' : '6'}/10 | ${script ? 'Using conversational script' : 'Using generated script'} |
| Edit flow          | 7/10  | Standard dynamic timing |
| Overall vibe       | ${vibeReport.vibe_match_score >= 7 ? '8' : '6'}/10 | ${vibeReport.vibe_match_score >= 7 ? 'Good vibe match' : 'Vibe could be better aligned'} |
`);
    
    return {
      success: true,
      vibeReport,
      videoResult: result
    };
    
  } catch (err) {
    console.error('\n❌ Video generation failed:', err.message);
    return {
      success: false,
      vibeReport,
      error: err.message
    };
  }
}

// CLI
async function main() {
  const args = process.argv.slice(2);
  
  let productId = null;
  const pidIdx = args.findIndex(a => a === '--product-id' || a === '-p');
  if (pidIdx !== -1 && args[pidIdx + 1]) {
    productId = parseInt(args[pidIdx + 1], 10);
  }
  
  const result = await runTest(productId);
  
  console.log('\n📄 Test complete.');
  console.log(JSON.stringify(result.vibeReport, null, 2));
}

main().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});
