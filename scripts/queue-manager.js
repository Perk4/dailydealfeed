#!/usr/bin/env node
/**
 * Production Queue Manager for @dailydealfeed
 * Phase 3: Queue building and video generation
 * 
 * Pairs approved products with approved clips and generates videos.
 * 
 * Usage:
 *   node queue-manager.js --build-queue     Build queue from manifests
 *   node queue-manager.js --generate-one    Generate first video
 *   node queue-manager.js --generate-all    Generate all videos
 *   node queue-manager.js --status          Show queue status
 *   node queue-manager.js --qa              Run QA on completed videos
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');
const logger = require('./lib/logger');

// ============================================
// CONFIGURATION
// ============================================

const PROJECT_DIR = path.join(__dirname, '..');
const STAGING_DIR = path.join(PROJECT_DIR, 'staging');
const PRODUCTION_DIR = path.join(PROJECT_DIR, 'production');
const OUTPUT_DIR = path.join(PROJECT_DIR, 'output');

const PATHS = {
  // Phase 1-2 manifest structure
  productsManifest: path.join(STAGING_DIR, 'products', 'manifest.json'),
  clipsManifest: path.join(STAGING_DIR, 'clips', 'manifest.json'),
  // Legacy path for approved clips
  approvedClipsManifest: path.join(STAGING_DIR, 'clips', 'approved-manifest.json'),
  // Production paths
  queue: path.join(PRODUCTION_DIR, 'queue'),
  inProgress: path.join(PRODUCTION_DIR, 'in-progress'),
  completed: path.join(PRODUCTION_DIR, 'completed'),
  outputApproved: path.join(OUTPUT_DIR, 'approved'),
  outputRejected: path.join(OUTPUT_DIR, 'rejected'),
  queueFile: path.join(PRODUCTION_DIR, 'queue', 'queue.json'),
};

// Category to Vibe mapping
const VIBE_MAPPING = {
  skincare: ['satisfying', 'wholesome', 'calm', 'cozy'],
  beauty: ['satisfying', 'wholesome', 'aesthetic', 'calm'],
  cleaning: ['funny', 'satisfying', 'quirky', 'fun'],
  drinkware: ['satisfying', 'wholesome', 'cozy', 'lifestyle'],
  footwear: ['funny', 'satisfying', 'quirky', 'fun'],
  home: ['satisfying', 'cozy', 'wholesome', 'lifestyle', 'funny'],
  kitchen: ['funny', 'satisfying', 'fun', 'quirky'],
  tech: ['satisfying', 'modern', 'sleek', 'cool'],
  default: ['funny', 'satisfying', 'wholesome']
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function ensureDirs() {
  [PATHS.queue, PATHS.inProgress, PATHS.completed, PATHS.outputApproved, PATHS.outputRejected]
    .forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
}

function log(message, emoji = '📋') {
  console.log(`${emoji} ${message}`);
}

function loadManifest(filepath) {
  if (!fs.existsSync(filepath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filepath, 'utf8'));
}

function saveJSON(filePath, data) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ============================================
// DATA LOADING (Phase 1-2 manifest structure)
// ============================================

/**
 * Load approved products from staging/products/manifest.json
 */
function loadApprovedProducts() {
  // Try Phase 1-2 manifest first
  const manifest = loadManifest(PATHS.productsManifest);
  
  if (manifest && manifest.products) {
    const approved = manifest.products.filter(p => p.status === 'approved');
    log(`Loaded ${approved.length} approved products from manifest`, '📦');
    return approved;
  }
  
  log('No products manifest found', '⚠️');
  return [];
}

/**
 * Load approved clips from staging/clips/manifest.json
 */
function loadApprovedClips() {
  // Try Phase 1-2 manifest first
  const manifest = loadManifest(PATHS.clipsManifest);
  
  if (manifest && manifest.clips) {
    const approved = manifest.clips.filter(c => c.status === 'approved');
    // Sort by score (highest first)
    approved.sort((a, b) => b.score - a.score);
    log(`Loaded ${approved.length} approved clips from manifest`, '🎬');
    return approved;
  }
  
  // Fallback to legacy approved-manifest.json
  const legacyManifest = loadManifest(PATHS.approvedClipsManifest);
  if (legacyManifest && legacyManifest.clips) {
    const clips = legacyManifest.clips.sort((a, b) => b.score - a.score);
    log(`Loaded ${clips.length} clips from legacy manifest`, '🎬');
    return clips;
  }
  
  log('No clips manifest found', '⚠️');
  return [];
}

// ============================================
// QUEUE BUILDING
// ============================================

/**
 * Build production queue by matching products to clips
 */
function buildQueue() {
  const products = loadApprovedProducts();
  const clips = loadApprovedClips();
  
  if (products.length === 0) {
    log('No approved products to process', '⚠️');
    return [];
  }
  
  if (clips.length === 0) {
    log('No approved clips available', '⚠️');
    return [];
  }
  
  const usedClips = new Set();
  const queue = [];
  
  log('Matching products to clips by category/vibe...', '🔄');
  
  for (const product of products) {
    // Find matching vibes for this product category
    const vibes = VIBE_MAPPING[product.category] || VIBE_MAPPING.default;
    
    // Find best unused clip with matching vibe
    const matchingClips = clips
      .filter(c => vibes.includes(c.vibe) && !usedClips.has(c.file))
      .sort((a, b) => b.score - a.score);
    
    if (matchingClips.length > 0) {
      const clip = matchingClips[0];
      usedClips.add(clip.file);
      
      queue.push({
        id: queue.length + 1,
        product: {
          asin: product.asin,
          name: product.name,
          price: product.price,
          category: product.category,
          image_url: product.image_url,
          affiliate_link: product.affiliate_link,
          best_stat: product.best_stat
        },
        clip: {
          file: clip.file,
          path: clip.path,
          vibe: clip.vibe,
          score: clip.score
        },
        status: 'pending',
        createdAt: new Date().toISOString()
      });
      
      log(`  ${product.name} → ${clip.file} (vibe: ${clip.vibe}, score: ${clip.score})`, '✅');
    } else {
      log(`  ${product.name} → No matching clip found for vibes: ${vibes.join(', ')}`, '⚠️');
    }
  }
  
  return queue;
}

/**
 * Save queue to production/queue/queue.json
 */
function saveQueue(queue) {
  const queueData = {
    version: '1.0',
    createdAt: new Date().toISOString(),
    totalItems: queue.length,
    items: queue
  };
  
  saveJSON(PATHS.queueFile, queueData);
  log(`Queue saved: ${queue.length} items → ${PATHS.queueFile}`, '💾');
}

// ============================================
// VIDEO GENERATION
// ============================================

/**
 * Generate video for a queue item
 */
async function generateVideo(queueItem) {
  const startTime = Date.now();
  const asin = queueItem.product.asin;
  const itemId = queueItem.id;
  
  logger.queue('INFO', `Picked item from queue: ${queueItem.product.name}`, {
    itemId,
    asin,
    clipFile: queueItem.clip.file,
    clipVibe: queueItem.clip.vibe
  });
  
  log(`Generating video for: ${queueItem.product.name}`, '🎬');
  
  const editorPath = path.join(__dirname, 'editor.js');
  const tempDir = path.join(PROJECT_DIR, 'temp');
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Build input for editor.js
  const editorInput = {
    product_id: queueItem.id,
    product_name: queueItem.product.name,
    product_image: queueItem.product.image_url,
    product_price: queueItem.product.price,
    product_asin: queueItem.product.asin,
    meme_url: queueItem.clip.path,
    clip_local_path: queueItem.clip.path,
    hook_angle: `Check this out: ${queueItem.product.name}`,
    category: queueItem.product.category,
    best_stat: queueItem.product.best_stat,
    affiliate_link: queueItem.product.affiliate_link
  };
  
  const inputPath = path.join(tempDir, `editor_input_${queueItem.id}.json`);
  
  try {
    fs.writeFileSync(inputPath, JSON.stringify(editorInput, null, 2));
    logger.queue('DEBUG', `Editor input written`, { inputPath, asin });
  } catch (writeErr) {
    logger.queue('ERROR', `Failed to write editor input`, {
      inputPath,
      error: writeErr.message,
      asin
    });
    return null;
  }
  
  try {
    logger.queue('INFO', `Starting editor process`, { itemId, asin, timeout: '5m' });
    
    const result = spawnSync('node', [editorPath, '--input', inputPath], {
      cwd: PROJECT_DIR,
      encoding: 'utf8',
      timeout: 300000, // 5 minute timeout
      stdio: 'pipe'
    });
    
    if (result.error) {
      // Check for timeout
      if (result.error.code === 'ETIMEDOUT' || result.signal === 'SIGTERM') {
        logger.queue('ERROR', `Editor process TIMEOUT after 5 minutes`, {
          itemId,
          asin,
          signal: result.signal,
          stderrTail: result.stderr?.slice(-500)
        });
        throw new Error('Editor timeout - process killed after 5 minutes');
      }
      logger.queue('ERROR', `Editor process error`, {
        itemId,
        asin,
        error: result.error.message,
        code: result.error.code
      });
      throw new Error(result.error.message);
    }
    
    if (result.status !== 0) {
      logger.queue('ERROR', `Editor exited with non-zero status`, {
        itemId,
        asin,
        exitCode: result.status,
        stderr: result.stderr?.slice(-1000),
        stdoutTail: result.stdout?.slice(-500)
      });
      console.error('Editor stderr:', result.stderr);
      throw new Error(`Editor exited with code ${result.status}`);
    }
    
    // Find the output video
    const output = result.stdout;
    const videoMatch = output.match(/✅ Video saved: (.+\.mp4)/);
    
    if (videoMatch) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      logger.queue('INFO', `Video generated successfully in ${elapsed}s`, {
        itemId,
        asin,
        videoPath: videoMatch[1],
        elapsedSeconds: elapsed
      });
      log(`Video created: ${path.basename(videoMatch[1])}`, '✅');
      return videoMatch[1];
    }
    
    // Fallback: look for recent mp4 files
    logger.queue('WARN', `Video path not found in output, searching output directory`, { itemId, asin });
    
    const outputFiles = fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.endsWith('.mp4'))
      .map(f => ({ name: f, mtime: fs.statSync(path.join(OUTPUT_DIR, f)).mtime }))
      .sort((a, b) => b.mtime - a.mtime);
    
    if (outputFiles.length > 0) {
      const foundPath = path.join(OUTPUT_DIR, outputFiles[0].name);
      logger.queue('INFO', `Found video via fallback search`, { itemId, asin, videoPath: foundPath });
      return foundPath;
    }
    
    logger.queue('ERROR', `No video file found after successful editor run`, {
      itemId,
      asin,
      outputDir: OUTPUT_DIR,
      stdoutTail: output?.slice(-500)
    });
    throw new Error('Could not find generated video');
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.queue('ERROR', `Video generation failed after ${elapsed}s: ${err.message}`, {
      itemId,
      asin,
      elapsedSeconds: elapsed,
      stack: err.stack
    });
    log(`Video generation failed: ${err.message}`, '❌');
    return null;
  } finally {
    if (fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath);
    }
  }
}

// ============================================
// QA EVALUATION
// ============================================

/**
 * Run STRICT QA on a video file
 * Uses video-qa.js for consistent, enforced thresholds
 * ALL checks must pass - no exceptions
 */
function runQA(videoPath) {
  const filename = videoPath ? path.basename(videoPath) : 'unknown';
  
  if (!videoPath || !fs.existsSync(videoPath)) {
    logger.queue('ERROR', `QA failed: video file not found`, { videoPath, filename });
    return { score: 0, error: 'Video file not found', passed: false };
  }
  
  logger.queue('INFO', `Running QA evaluation`, { filename, videoPath });
  
  // Import strict QA module
  const { evaluateVideo } = require('./video-qa.js');
  let result;
  
  try {
    result = evaluateVideo(videoPath);
  } catch (qaErr) {
    logger.queue('ERROR', `QA evaluation threw exception`, {
      filename,
      error: qaErr.message,
      stack: qaErr.stack
    });
    return { score: 0, error: qaErr.message, passed: false };
  }
  
  // Log QA results
  if (result.passed) {
    logger.queue('INFO', `QA PASSED`, {
      filename,
      score: result.score,
      duration: result.metadata?.duration,
      bitrate: result.metadata?.bitrate,
      fileSize: result.metadata?.fileSize
    });
  } else {
    logger.queue('WARN', `QA FAILED: ${result.issues.join(', ')}`, {
      filename,
      score: result.score,
      issues: result.issues,
      checks: result.checks,
      metadata: result.metadata
    });
  }
  
  // Handle failed videos - move to rejected folder
  if (!result.passed) {
    const rejectedDir = PATHS.outputRejected;
    if (!fs.existsSync(rejectedDir)) {
      fs.mkdirSync(rejectedDir, { recursive: true });
    }
    
    const destPath = path.join(rejectedDir, filename);
    
    // Write rejection reason
    const reasonFile = path.join(rejectedDir, filename.replace('.mp4', '.rejection.json'));
    try {
      fs.writeFileSync(reasonFile, JSON.stringify({
        file: filename,
        rejectedAt: new Date().toISOString(),
        issues: result.issues,
        checks: result.checks,
        metadata: result.metadata
      }, null, 2));
    } catch (writeErr) {
      logger.queue('ERROR', `Failed to write rejection reason file`, {
        reasonFile,
        error: writeErr.message
      });
    }
    
    // Move to rejected
    if (videoPath !== destPath) {
      try {
        fs.renameSync(videoPath, destPath);
        logger.queue('INFO', `Moved rejected video to rejected folder`, { filename, destPath });
      } catch (moveErr) {
        logger.queue('ERROR', `Failed to move rejected video`, {
          filename,
          destPath,
          error: moveErr.message
        });
      }
      log(`Rejected: ${filename} → ${result.issues.join(', ')}`, '❌');
    }
  } else {
    // Move passed videos to approved folder
    const approvedDir = PATHS.outputApproved;
    if (!fs.existsSync(approvedDir)) {
      fs.mkdirSync(approvedDir, { recursive: true });
    }
    
    const destPath = path.join(approvedDir, filename);
    
    if (videoPath !== destPath && !videoPath.includes('/approved/')) {
      try {
        fs.renameSync(videoPath, destPath);
        logger.queue('INFO', `Moved approved video to approved folder`, { filename, destPath });
      } catch (moveErr) {
        logger.queue('ERROR', `Failed to move approved video`, {
          filename,
          destPath,
          error: moveErr.message
        });
      }
    }
  }
  
  return {
    score: result.score,
    checks: result.checks,
    duration: result.metadata?.duration,
    size: result.metadata?.fileSize,
    issues: result.issues,
    passed: result.passed
  };
}

// ============================================
// CLI
// ============================================

async function main() {
  const args = process.argv.slice(2);
  
  ensureDirs();
  
  if (args.includes('--build-queue')) {
    // Build queue from manifests
    const queue = buildQueue();
    saveQueue(queue);
    console.log(JSON.stringify({ queue }, null, 2));
    
  } else if (args.includes('--generate-one')) {
    // Load queue and generate first pending item
    const queueData = loadManifest(PATHS.queueFile);
    if (!queueData || !queueData.items || queueData.items.length === 0) {
      log('No queue found. Run --build-queue first.', '⚠️');
      return;
    }
    
    const pending = queueData.items.filter(i => i.status === 'pending');
    if (pending.length === 0) {
      log('No pending items in queue', '✅');
      return;
    }
    
    const item = pending[0];
    const videoPath = await generateVideo(item);
    
    if (videoPath) {
      const qa = runQA(videoPath);
      log(`QA Score: ${qa.score}/10 ${qa.passed ? '✅ PASS' : '⚠️ NEEDS REVIEW'}`, '📊');
      
      // Update queue item status
      item.status = qa.passed ? 'completed' : 'needs-review';
      item.outputPath = videoPath;
      item.qaScore = qa.score;
      saveJSON(PATHS.queueFile, queueData);
    }
    
  } else if (args.includes('--generate-all')) {
    // Generate all pending items
    const queueData = loadManifest(PATHS.queueFile);
    if (!queueData || !queueData.items) {
      logger.queue('WARN', 'No queue found. Run --build-queue first.');
      log('No queue found. Run --build-queue first.', '⚠️');
      return;
    }
    
    const pending = queueData.items.filter(i => i.status === 'pending');
    const batchStartTime = Date.now();
    
    logger.queue('INFO', `Starting batch generation`, {
      totalItems: queueData.items.length,
      pendingItems: pending.length,
      batchStartTime: new Date().toISOString()
    });
    
    log(`Generating ${pending.length} videos...`, '🎬');
    
    let successCount = 0;
    let failCount = 0;
    
    for (let i = 0; i < pending.length; i++) {
      const item = pending[i];
      const itemStartTime = Date.now();
      
      log(`\n[${i + 1}/${pending.length}] ${item.product.name}`, '🔄');
      
      // Mark as in-progress
      item.status = 'in-progress';
      item.startedAt = new Date().toISOString();
      saveJSON(PATHS.queueFile, queueData);
      
      const videoPath = await generateVideo(item);
      
      if (videoPath) {
        const qa = runQA(videoPath);
        item.status = qa.passed ? 'completed' : 'needs-review';
        item.outputPath = videoPath;
        item.qaScore = qa.score;
        item.completedAt = new Date().toISOString();
        successCount++;
        log(`QA: ${qa.score}/10 ${qa.passed ? '✅' : '⚠️'}`, '📊');
      } else {
        item.status = 'failed';
        item.failedAt = new Date().toISOString();
        failCount++;
        
        // Check if stuck (took too long without producing output)
        const elapsedMin = (Date.now() - itemStartTime) / 60000;
        if (elapsedMin > 3) {
          logger.queue('WARN', `Item ${item.id} may have been stuck (${elapsedMin.toFixed(1)}m elapsed)`, {
            itemId: item.id,
            asin: item.product.asin,
            elapsedMinutes: elapsedMin.toFixed(1)
          });
        }
      }
      
      saveJSON(PATHS.queueFile, queueData);
    }
    
    // Summary
    const batchElapsed = ((Date.now() - batchStartTime) / 1000).toFixed(1);
    const completed = queueData.items.filter(i => i.status === 'completed').length;
    const failed = queueData.items.filter(i => i.status === 'failed').length;
    
    logger.queue('INFO', `Batch generation complete`, {
      totalProcessed: pending.length,
      success: successCount,
      failed: failCount,
      totalCompleted: completed,
      totalFailed: failed,
      elapsedSeconds: batchElapsed
    });
    
    log(`\nComplete: ${completed}/${pending.length}, Failed: ${failed}`, '📊');
    
  } else if (args.includes('--status')) {
    const queueData = loadManifest(PATHS.queueFile);
    if (!queueData) {
      log('No queue found', '⚠️');
      return;
    }
    
    const counts = {
      pending: queueData.items.filter(i => i.status === 'pending').length,
      completed: queueData.items.filter(i => i.status === 'completed').length,
      failed: queueData.items.filter(i => i.status === 'failed').length
    };
    
    console.log('\n=== QUEUE STATUS ===');
    console.log(`Total: ${queueData.items.length}`);
    console.log(`  Pending: ${counts.pending}`);
    console.log(`  Completed: ${counts.completed}`);
    console.log(`  Failed: ${counts.failed}`);
    
  } else if (args.includes('--qa')) {
    // Run QA on output videos
    const videos = fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.endsWith('.mp4'))
      .map(f => path.join(OUTPUT_DIR, f));
    
    log(`Running QA on ${videos.length} videos...`, '📊');
    
    for (const video of videos) {
      const qa = runQA(video);
      console.log(`${path.basename(video)}: ${qa.score}/10 ${qa.passed ? '✅' : '⚠️'}`);
    }
    
  } else {
    console.log('Usage:');
    console.log('  node queue-manager.js --build-queue    Build queue from manifests');
    console.log('  node queue-manager.js --generate-one   Generate first video');
    console.log('  node queue-manager.js --generate-all   Generate all videos');
    console.log('  node queue-manager.js --status         Show queue status');
    console.log('  node queue-manager.js --qa             Run QA on output videos');
  }
}

// Exports
module.exports = { buildQueue, saveQueue, generateVideo, runQA };

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
