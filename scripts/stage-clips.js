#!/usr/bin/env node
/**
 * Batch Clip Staging System for @dailydealfeed
 * Scans all clips, evaluates them, and stages approved ones for the video pipeline
 */

const { evaluateClip } = require('./evaluate-clip.js');
const fs = require('fs');
const path = require('path');

const CLIPS_ROOT = '/root/dailydealfeed/clips';
const STAGING_ROOT = '/root/dailydealfeed/staging/clips';

async function stageClips() {
  console.log('🎬 CLIP STAGING SYSTEM');
  console.log('='.repeat(50));
  
  // Ensure directories exist
  const dirs = ['pending', 'approved', 'rejected'];
  dirs.forEach(dir => {
    const fullPath = path.join(STAGING_ROOT, dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }
  });
  
  // Gather all clips from various sources
  const clipSources = [
    { dir: path.join(CLIPS_ROOT, 'processed'), label: 'AFV/Processed' },
    { dir: path.join(CLIPS_ROOT, 'shorts'), label: 'YouTube/TikTok Shorts' }
  ];
  
  const allClips = [];
  
  for (const source of clipSources) {
    if (!fs.existsSync(source.dir)) {
      console.log(`⚠️  Source not found: ${source.dir}`);
      continue;
    }
    
    const files = fs.readdirSync(source.dir)
      .filter(f => f.endsWith('.mp4') && !f.includes('.part'))
      .map(f => ({
        path: path.join(source.dir, f),
        source: source.label
      }));
    
    console.log(`📂 Found ${files.length} clips in ${source.label}`);
    allClips.push(...files);
  }
  
  console.log(`\n📊 Total clips to evaluate: ${allClips.length}\n`);
  
  // Evaluate all clips
  const results = [];
  let processed = 0;
  
  for (const clip of allClips) {
    processed++;
    process.stdout.write(`\r⏳ Evaluating ${processed}/${allClips.length}: ${path.basename(clip.path)}`.padEnd(80));
    
    try {
      const result = await evaluateClip(clip.path);
      result.source = clip.source;
      results.push(result);
    } catch (err) {
      results.push({
        file: clip.path,
        filename: path.basename(clip.path),
        source: clip.source,
        approved: false,
        total_score: 0,
        issues: [`Evaluation failed: ${err.message}`]
      });
    }
  }
  
  console.log('\n');
  
  // Separate approved and rejected
  const approved = results.filter(r => r.approved);
  const rejected = results.filter(r => !r.approved);
  
  // Sort by score
  approved.sort((a, b) => b.total_score - a.total_score);
  rejected.sort((a, b) => b.total_score - a.total_score);
  
  // Copy approved clips to staging
  console.log('📦 Staging approved clips...');
  const approvedManifest = [];
  
  for (const clip of approved) {
    const destPath = path.join(STAGING_ROOT, 'approved', clip.filename);
    
    // Only copy if not already there
    if (!fs.existsSync(destPath)) {
      fs.copyFileSync(clip.file, destPath);
    }
    
    approvedManifest.push({
      filename: clip.filename,
      path: destPath,
      original_path: clip.file,
      source: clip.source,
      score: clip.total_score,
      metadata: clip.metadata,
      scores: clip.scores,
      staged_at: new Date().toISOString()
    });
  }
  
  // Write approved manifest
  const manifestPath = path.join(STAGING_ROOT, 'approved-manifest.json');
  fs.writeFileSync(manifestPath, JSON.stringify({
    version: 1,
    generated: new Date().toISOString(),
    total_evaluated: results.length,
    approved_count: approved.length,
    rejected_count: rejected.length,
    average_score: approved.length > 0 
      ? (approved.reduce((sum, r) => sum + r.total_score, 0) / approved.length).toFixed(2)
      : 0,
    clips: approvedManifest
  }, null, 2));
  
  // Write rejected log
  const rejectedLogPath = path.join(STAGING_ROOT, 'rejected', 'rejection-log.json');
  fs.writeFileSync(rejectedLogPath, JSON.stringify({
    version: 1,
    generated: new Date().toISOString(),
    rejected_count: rejected.length,
    clips: rejected.map(r => ({
      filename: r.filename,
      path: r.file,
      source: r.source,
      score: r.total_score,
      issues: r.issues,
      scores: r.scores
    }))
  }, null, 2));
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('=== CLIP EVALUATION SYSTEM COMPLETE ===');
  console.log('='.repeat(50));
  
  console.log(`\n🧪 Test results:`);
  console.log(`   - Evaluated: ${results.length} clips`);
  console.log(`   - Approved: ${approved.length} clips (avg score: ${approvedManifest.length > 0 ? (approved.reduce((s, r) => s + r.total_score, 0) / approved.length).toFixed(1) : 0}/10)`);
  console.log(`   - Rejected: ${rejected.length} clips`);
  
  console.log(`\n📊 Top 5 clips by score:`);
  const top5 = [...approved, ...rejected].sort((a, b) => b.total_score - a.total_score).slice(0, 5);
  top5.forEach((clip, i) => {
    const status = clip.approved ? '✅' : '❌';
    console.log(`   ${i + 1}. ${status} ${clip.filename} - ${clip.total_score}/10`);
  });
  
  if (rejected.length > 0) {
    console.log(`\n⚠️  Common rejection reasons:`);
    const issueCount = {};
    rejected.forEach(r => {
      r.issues.forEach(issue => {
        const key = issue.split(':')[0];
        issueCount[key] = (issueCount[key] || 0) + 1;
      });
    });
    Object.entries(issueCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .forEach(([issue, count]) => {
        console.log(`   - ${issue}: ${count} clips`);
      });
  }
  
  console.log(`\n📁 Output files:`);
  console.log(`   - ${manifestPath}`);
  console.log(`   - ${rejectedLogPath}`);
  
  return {
    total: results.length,
    approved: approved.length,
    rejected: rejected.length,
    manifest: manifestPath
  };
}

// CLI
if (require.main === module) {
  stageClips().catch(console.error);
}

module.exports = { stageClips };
