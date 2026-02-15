#!/usr/bin/env node
/**
 * V5.0 Batch Generator
 * Generates all 6 videos with improvements:
 * - Conversational scripts from script-map.json
 * - Dynamic pacing (10-18s)
 * - Background music
 * - TTS fallback chain
 */

const fs = require('fs');
const path = require('path');
const { editVideo } = require('./editor.js');

const BATCH_FILE = path.join(__dirname, '..', 'temp', 'batch_inputs.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

async function runBatch() {
  console.log('🚀 V5.0 Batch Generator Starting...\n');
  
  const batchData = JSON.parse(fs.readFileSync(BATCH_FILE, 'utf8'));
  const products = batchData.products;
  
  const results = [];
  const failures = [];
  
  for (const product of products) {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`📦 Processing Product ${product.product_id}: ${product.product_name}`);
    console.log('='.repeat(60));
    
    try {
      const result = await editVideo(product);
      results.push({
        product_id: product.product_id,
        product_name: product.product_name,
        status: 'success',
        duration: result.duration_seconds,
        has_voiceover: result.has_voiceover,
        has_music: result.has_background_music,
        video_path: result.video_path
      });
      console.log(`✅ Product ${product.product_id} completed successfully!`);
    } catch (err) {
      console.error(`❌ Product ${product.product_id} failed: ${err.message}`);
      failures.push({
        product_id: product.product_id,
        product_name: product.product_name,
        error: err.message
      });
    }
  }
  
  console.log(`\n${'='.repeat(60)}`);
  console.log('📊 BATCH SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Successful: ${results.length}`);
  console.log(`❌ Failed: ${failures.length}`);
  
  if (results.length > 0) {
    console.log('\n📹 Generated Videos:');
    for (const r of results) {
      console.log(`   ${r.product_id}. ${r.product_name}`);
      console.log(`      Duration: ${r.duration}s | Voice: ${r.has_voiceover ? 'Yes' : 'No'} | Music: ${r.has_music ? 'Yes' : 'No'}`);
    }
  }
  
  if (failures.length > 0) {
    console.log('\n❌ Failures:');
    for (const f of failures) {
      console.log(`   ${f.product_id}. ${f.product_name}: ${f.error}`);
    }
  }
  
  // Save batch report
  const report = {
    version: '5.0',
    generated_at: new Date().toISOString(),
    successful: results.length,
    failed: failures.length,
    results,
    failures
  };
  
  const reportPath = path.join(OUTPUT_DIR, 'batch_report_v5.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`\n📄 Batch report saved: ${reportPath}`);
  
  return report;
}

runBatch().catch(err => {
  console.error('Fatal batch error:', err);
  process.exit(1);
});
