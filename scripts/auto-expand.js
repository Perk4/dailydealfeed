#!/usr/bin/env node
/**
 * Auto-Expand Script for @dailydealfeed
 * Orchestrates the full autonomous pipeline:
 * 1. Discover new products (if queue is low)
 * 2. Validate and add to manifest
 * 3. Rebuild production queue
 * 4. Generate videos from queue
 * 
 * Usage:
 *   node auto-expand.js                Run full auto-expand cycle
 *   node auto-expand.js --discover     Only discover products
 *   node auto-expand.js --rebuild      Only rebuild queue
 *   node auto-expand.js --generate     Only generate one video
 *   node auto-expand.js --status       Show pipeline status
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ============================================
// CONFIGURATION
// ============================================

const PROJECT_DIR = path.join(__dirname, '..');
const SCRIPTS_DIR = __dirname;

const PATHS = {
  manifest: path.join(PROJECT_DIR, 'staging', 'products', 'manifest.json'),
  clipsManifest: path.join(PROJECT_DIR, 'staging', 'clips', 'manifest.json'),
  queue: path.join(PROJECT_DIR, 'production', 'queue', 'queue.json'),
  expandLog: path.join(PROJECT_DIR, 'production', 'auto-expand.log')
};

// Thresholds
const MIN_QUEUE_ITEMS = 3;        // Trigger discovery when queue falls below this
const DISCOVERY_BATCH_SIZE = 5;   // How many products to discover at once

// ============================================
// UTILITY FUNCTIONS
// ============================================

function log(message, emoji = '🚀') {
  const timestamp = new Date().toISOString();
  const line = `${emoji} [${timestamp}] ${message}`;
  console.log(line);
  
  // Also write to log file
  try {
    const logDir = path.dirname(PATHS.expandLog);
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }
    fs.appendFileSync(PATHS.expandLog, line + '\n');
  } catch (e) {
    // Ignore log write errors
  }
}

function loadJSON(filepath) {
  if (!fs.existsSync(filepath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filepath, 'utf8'));
  } catch (e) {
    return null;
  }
}

function runScript(scriptName, args = []) {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  log(`Running: node ${scriptName} ${args.join(' ')}`, '⚡');
  
  try {
    const result = spawnSync('node', [scriptPath, ...args], {
      cwd: PROJECT_DIR,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: 180000 // 3 minute timeout
    });
    
    if (result.stdout) console.log(result.stdout);
    if (result.stderr && result.status !== 0) console.error(result.stderr);
    
    return {
      success: result.status === 0,
      stdout: result.stdout,
      stderr: result.stderr
    };
  } catch (err) {
    log(`Script failed: ${err.message}`, '❌');
    return { success: false, error: err.message };
  }
}

// ============================================
// STATUS CHECKING
// ============================================

function getQueueStatus() {
  const queue = loadJSON(PATHS.queue);
  if (!queue || !queue.items) {
    return { total: 0, pending: 0, completed: 0, failed: 0 };
  }
  
  return {
    total: queue.items.length,
    pending: queue.items.filter(i => i.status === 'pending').length,
    completed: queue.items.filter(i => i.status === 'completed').length,
    failed: queue.items.filter(i => i.status === 'failed').length,
    needsReview: queue.items.filter(i => i.status === 'needs-review').length
  };
}

function getManifestStatus() {
  const manifest = loadJSON(PATHS.manifest);
  if (!manifest || !manifest.products) {
    return { total: 0, approved: 0 };
  }
  
  return {
    total: manifest.products.length,
    approved: manifest.products.filter(p => p.status === 'approved').length,
    autoDiscovered: manifest.products.filter(p => p.source === 'auto-discovery').length
  };
}

function getClipsStatus() {
  const manifest = loadJSON(PATHS.clipsManifest);
  if (!manifest || !manifest.clips) {
    return { total: 0, approved: 0 };
  }
  
  return {
    total: manifest.clips.length,
    approved: manifest.clips.filter(c => c.status === 'approved').length
  };
}

function showStatus() {
  const queue = getQueueStatus();
  const products = getManifestStatus();
  const clips = getClipsStatus();
  
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║       DAILYDEALFEED PIPELINE STATUS      ║');
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║ Products: ${String(products.total).padStart(3)} total │ ${String(products.approved).padStart(3)} approved       ║`);
  console.log(`║           ${String(products.autoDiscovered).padStart(3)} auto-discovered            ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║ Clips:    ${String(clips.total).padStart(3)} total │ ${String(clips.approved).padStart(3)} approved       ║`);
  console.log('╠══════════════════════════════════════════╣');
  console.log(`║ Queue:    ${String(queue.total).padStart(3)} total │ ${String(queue.pending).padStart(3)} pending        ║`);
  console.log(`║           ${String(queue.completed).padStart(3)} completed │ ${String(queue.failed).padStart(3)} failed   ║`);
  console.log('╠══════════════════════════════════════════╣');
  
  if (queue.pending < MIN_QUEUE_ITEMS) {
    console.log('║ ⚠️  Queue low - discovery recommended     ║');
  } else {
    console.log('║ ✅ Queue healthy - ready to generate     ║');
  }
  
  console.log('╚══════════════════════════════════════════╝\n');
  
  return { queue, products, clips };
}

// ============================================
// AUTO-EXPAND OPERATIONS
// ============================================

async function discoverNewProducts() {
  log('Discovering new products...', '🔍');
  return runScript('discover-products.js', ['--limit', String(DISCOVERY_BATCH_SIZE)]);
}

function rebuildQueue() {
  log('Rebuilding production queue...', '🔄');
  return runScript('queue-manager.js', ['--build-queue']);
}

function generateOneVideo() {
  log('Generating next video from queue...', '🎬');
  return runScript('queue-manager.js', ['--generate-one']);
}

// ============================================
// FULL AUTO-EXPAND CYCLE
// ============================================

async function autoExpand() {
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║         AUTO-EXPAND CYCLE START          ║');
  console.log('╚══════════════════════════════════════════╝\n');
  
  const startTime = Date.now();
  let status = showStatus();
  
  // Step 1: Check if we need to discover new products
  if (status.queue.pending < MIN_QUEUE_ITEMS) {
    log(`Queue has ${status.queue.pending} pending items (threshold: ${MIN_QUEUE_ITEMS})`, '⚠️');
    log('Triggering product discovery...', '🔍');
    
    const discoverResult = await discoverNewProducts();
    
    if (discoverResult.success) {
      log('Product discovery completed!', '✅');
    } else {
      log('Product discovery had issues, continuing anyway...', '⚠️');
    }
    
    // Step 2: Rebuild queue with new products
    log('Rebuilding queue with new products...', '🔄');
    rebuildQueue();
    
    // Refresh status
    status = { queue: getQueueStatus(), products: getManifestStatus(), clips: getClipsStatus() };
  }
  
  // Step 3: Generate video if we have pending items
  if (status.queue.pending > 0) {
    log(`Queue has ${status.queue.pending} pending items, generating...`, '🎬');
    const genResult = generateOneVideo();
    
    if (genResult.success) {
      log('Video generation completed!', '✅');
    } else {
      log('Video generation failed', '❌');
    }
  } else {
    log('No pending items to generate', '⏸️');
    
    // Last resort: try to discover and rebuild
    log('Attempting emergency discovery...', '🆘');
    await discoverNewProducts();
    rebuildQueue();
  }
  
  // Final status
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  
  console.log('\n╔══════════════════════════════════════════╗');
  console.log('║          AUTO-EXPAND COMPLETE            ║');
  console.log('╚══════════════════════════════════════════╝\n');
  
  const finalStatus = showStatus();
  
  console.log(`⏱️  Completed in ${elapsed}s\n`);
  
  return {
    success: true,
    elapsed,
    queue: finalStatus.queue,
    products: finalStatus.products
  };
}

// ============================================
// CLI
// ============================================

async function main() {
  const args = process.argv.slice(2);
  
  try {
    if (args.includes('--status')) {
      showStatus();
      
    } else if (args.includes('--discover')) {
      await discoverNewProducts();
      
    } else if (args.includes('--rebuild')) {
      rebuildQueue();
      
    } else if (args.includes('--generate')) {
      generateOneVideo();
      
    } else if (args.includes('--help')) {
      console.log(`
Auto-Expand Script for @dailydealfeed

Usage:
  node auto-expand.js              Run full auto-expand cycle
  node auto-expand.js --discover   Only discover products
  node auto-expand.js --rebuild    Only rebuild queue
  node auto-expand.js --generate   Only generate one video
  node auto-expand.js --status     Show pipeline status
  node auto-expand.js --help       Show this help

The full cycle will:
1. Check if queue is running low (< ${MIN_QUEUE_ITEMS} items)
2. Discover ${DISCOVERY_BATCH_SIZE} new products if needed
3. Rebuild the production queue
4. Generate one video from the queue
`);
      
    } else {
      // Default: run full auto-expand cycle
      const result = await autoExpand();
      console.log(JSON.stringify(result, null, 2));
    }
  } catch (err) {
    log(`Fatal error: ${err.message}`, '💀');
    console.error(err);
    process.exit(1);
  }
}

// Exports
module.exports = { autoExpand, showStatus, getQueueStatus, getManifestStatus };

// Run if called directly
if (require.main === module) {
  main();
}
