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

// Retry configuration
const RETRY_CONFIG = {
  maxAttempts: 3,
  baseDelayMs: 5000,      // 5 seconds
  maxDelayMs: 60000,      // 1 minute max
  backoffMultiplier: 2    // Exponential backoff
};

// Stuck item threshold (5 minutes)
const STUCK_THRESHOLD_MS = 5 * 60 * 1000;

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

/**
 * Sleep for specified milliseconds
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Calculate backoff delay for retry attempt
 */
function getBackoffDelay(attempt) {
  const delay = RETRY_CONFIG.baseDelayMs * Math.pow(RETRY_CONFIG.backoffMultiplier, attempt - 1);
  return Math.min(delay, RETRY_CONFIG.maxDelayMs);
}

/**
 * Recover stuck items (in-progress > 5 minutes)
 * Resets them to pending status for retry
 */
function recoverStuckItems() {
  const queueData = loadManifest(PATHS.queueFile);
  if (!queueData || !queueData.items) {
    log('No queue found', '⚠️');
    return { recovered: 0, items: [] };
  }
  
  const now = Date.now();
  const recoveredItems = [];
  
  for (const item of queueData.items) {
    if (item.status === 'in-progress' && item.startedAt) {
      const startTime = new Date(item.startedAt).getTime();
      const elapsed = now - startTime;
      
      if (elapsed > STUCK_THRESHOLD_MS) {
        const elapsedMin = (elapsed / 60000).toFixed(1);
        
        logger.queue('WARN', `Recovering stuck item ${item.id} (stuck for ${elapsedMin}m)`, {
          itemId: item.id,
          asin: item.product?.asin,
          stuckMinutes: elapsedMin,
          startedAt: item.startedAt
        });
        
        // Reset to pending with retry metadata
        item.status = 'pending';
        item.retryCount = (item.retryCount || 0) + 1;
        item.lastStuckRecovery = new Date().toISOString();
        item.stuckDuration = elapsedMin + 'm';
        delete item.startedAt;
        
        recoveredItems.push({
          id: item.id,
          asin: item.product?.asin,
          name: item.product?.name,
          stuckMinutes: elapsedMin
        });
        
        log(`Recovered stuck item ${item.id}: ${item.product?.name} (was stuck ${elapsedMin}m)`, '🔄');
      }
    }
  }
  
  if (recoveredItems.length > 0) {
    saveJSON(PATHS.queueFile, queueData);
    logger.queue('INFO', `Recovered ${recoveredItems.length} stuck items`, { items: recoveredItems });
  }
  
  return { recovered: recoveredItems.length, items: recoveredItems };
}

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

/**
 * Generate video with retry logic
 * Retries up to maxAttempts times with exponential backoff
 */
async function generateVideoWithRetry(queueItem, enableRetry = false) {
  const maxAttempts = enableRetry ? RETRY_CONFIG.maxAttempts : 1;
  let lastError = null;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (attempt > 1) {
      const delay = getBackoffDelay(attempt);
      logger.queue('INFO', `Retry attempt ${attempt}/${maxAttempts} for item ${queueItem.id} after ${delay}ms`, {
        itemId: queueItem.id,
        asin: queueItem.product?.asin,
        attempt,
        maxAttempts,
        delayMs: delay
      });
      log(`Retry ${attempt}/${maxAttempts} for ${queueItem.product?.name} (waiting ${delay}ms)...`, '🔄');
      await sleep(delay);
    }
    
    try {
      const videoPath = await generateVideo(queueItem);
      
      if (videoPath) {
        if (attempt > 1) {
          logger.queue('INFO', `Item ${queueItem.id} succeeded on attempt ${attempt}`, {
            itemId: queueItem.id,
            asin: queueItem.product?.asin,
            attempt
          });
        }
        return videoPath;
      }
      
      lastError = new Error('Video generation returned null');
    } catch (err) {
      lastError = err;
      logger.queue('WARN', `Attempt ${attempt}/${maxAttempts} failed for item ${queueItem.id}: ${err.message}`, {
        itemId: queueItem.id,
        asin: queueItem.product?.asin,
        attempt,
        error: err.message
      });
    }
    
    // Track retry count on item
    queueItem.retryCount = attempt;
  }
  
  // All retries exhausted
  logger.queue('ERROR', `All ${maxAttempts} attempts failed for item ${queueItem.id}`, {
    itemId: queueItem.id,
    asin: queueItem.product?.asin,
    lastError: lastError?.message
  });
  
  return null;
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
  const enableRetry = args.includes('--retry');
  
  ensureDirs();
  
  // Check for stuck items on any generate command
  if (args.includes('--generate-one') || args.includes('--generate-all')) {
    const recovery = recoverStuckItems();
    if (recovery.recovered > 0) {
      log(`Auto-recovered ${recovery.recovered} stuck items`, '🔄');
    }
  }
  
  if (args.includes('--recover-stuck')) {
    // Manual stuck item recovery
    const recovery = recoverStuckItems();
    console.log(JSON.stringify(recovery, null, 2));
    return;
    
  } else if (args.includes('--build-queue')) {
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
    
    // Mark as in-progress
    item.status = 'in-progress';
    item.startedAt = new Date().toISOString();
    saveJSON(PATHS.queueFile, queueData);
    
    // Generate with retry if flag is set
    const videoPath = enableRetry 
      ? await generateVideoWithRetry(item, true)
      : await generateVideo(item);
    
    if (videoPath) {
      const qa = runQA(videoPath);
      log(`QA Score: ${qa.score}/10 ${qa.passed ? '✅ PASS' : '⚠️ NEEDS REVIEW'}`, '📊');
      
      // Update queue item status
      item.status = qa.passed ? 'completed' : 'needs-review';
      item.outputPath = videoPath;
      item.qaScore = qa.score;
      item.completedAt = new Date().toISOString();
      if (enableRetry && item.retryCount > 1) {
        log(`Succeeded after ${item.retryCount} attempts`, '🔄');
      }
      saveJSON(PATHS.queueFile, queueData);
    } else {
      item.status = 'failed';
      item.failedAt = new Date().toISOString();
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
      
      const retryInfo = enableRetry ? ` (retry enabled, max ${RETRY_CONFIG.maxAttempts} attempts)` : '';
      log(`\n[${i + 1}/${pending.length}] ${item.product.name}${retryInfo}`, '🔄');
      
      // Mark as in-progress
      item.status = 'in-progress';
      item.startedAt = new Date().toISOString();
      saveJSON(PATHS.queueFile, queueData);
      
      // Generate with retry if flag is set
      const videoPath = enableRetry 
        ? await generateVideoWithRetry(item, true)
        : await generateVideo(item);
      
      if (videoPath) {
        const qa = runQA(videoPath);
        item.status = qa.passed ? 'completed' : 'needs-review';
        item.outputPath = videoPath;
        item.qaScore = qa.score;
        item.completedAt = new Date().toISOString();
        successCount++;
        
        const retryNote = (enableRetry && item.retryCount > 1) 
          ? ` (after ${item.retryCount} attempts)` 
          : '';
        log(`QA: ${qa.score}/10 ${qa.passed ? '✅' : '⚠️'}${retryNote}`, '📊');
      } else {
        item.status = 'failed';
        item.failedAt = new Date().toISOString();
        failCount++;
        
        // Log retry exhaustion if retries were enabled
        if (enableRetry) {
          logger.queue('ERROR', `Item ${item.id} failed after ${RETRY_CONFIG.maxAttempts} retry attempts`, {
            itemId: item.id,
            asin: item.product.asin,
            retryCount: item.retryCount || 1
          });
        }
        
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
    console.log('  node queue-manager.js --build-queue      Build queue from manifests');
    console.log('  node queue-manager.js --generate-one     Generate first video');
    console.log('  node queue-manager.js --generate-all     Generate all videos');
    console.log('  node queue-manager.js --status           Show queue status');
    console.log('  node queue-manager.js --qa               Run QA on output videos');
    console.log('  node queue-manager.js --recover-stuck    Reset stuck items to pending');
    console.log('');
    console.log('Options:');
    console.log('  --retry                                  Enable retry (3 attempts with backoff)');
    console.log('');
    console.log('Examples:');
    console.log('  node queue-manager.js --generate-all --retry    Generate with auto-retry');
  }
}

// Exports
module.exports = { 
  buildQueue, 
  saveQueue, 
  generateVideo, 
  generateVideoWithRetry,
  runQA,
  recoverStuckItems,
  RETRY_CONFIG,
  STUCK_THRESHOLD_MS
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
