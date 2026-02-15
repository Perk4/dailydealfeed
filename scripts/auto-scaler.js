#!/usr/bin/env node
/**
 * Auto-Scaler — On-Demand Video Generation System
 * DailyDealFeed Pipeline
 * 
 * Features:
 * - Monitors posting queue inventory levels
 * - Auto-generates videos when below threshold
 * - On-demand single video generation
 * - Batch generation with configurable concurrency
 * - Daily quota management
 * - Integration with scout, producer, editor
 * 
 * Usage:
 *   node auto-scaler.js status              # Check inventory levels
 *   node auto-scaler.js generate <product-id>  # Generate single video
 *   node auto-scaler.js fill [--count N]    # Fill queue to threshold
 *   node auto-scaler.js batch [--products 1,2,3]  # Batch generate
 *   node auto-scaler.js monitor             # Continuous monitoring mode
 *   node auto-scaler.js quota               # Check/reset daily quotas
 *   node auto-scaler.js config              # Show/update settings
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Paths
const SCRIPT_DIR = __dirname;
const ROOT_DIR = path.join(SCRIPT_DIR, '..');
const CONFIG_PATH = path.join(ROOT_DIR, 'auto-scaler-config.json');
const QUEUE_PATH = path.join(ROOT_DIR, 'posting-queue.json');
const PRODUCTS_PATH = path.join(ROOT_DIR, 'products.json');
const OUTPUT_DIR = path.join(ROOT_DIR, 'output');
const SCRIPT_MAP_PATH = path.join(SCRIPT_DIR, 'script-map.json');

// Default configuration
const DEFAULT_CONFIG = {
  version: '1.0',
  created: new Date().toISOString(),
  thresholds: {
    minPendingVideos: 5,      // Generate when below this
    targetPendingVideos: 10,  // Fill up to this level
    maxDailyGeneration: 20,   // Max videos per day
    cooldownMinutes: 30       // Wait between auto-fill cycles
  },
  generation: {
    concurrency: 1,           // Parallel video generations (keep low for stability)
    retryAttempts: 2,
    retryDelayMs: 5000,
    timeoutMs: 120000         // 2 minutes per video
  },
  monitoring: {
    checkIntervalMinutes: 60,
    enableAutoFill: true,
    notifyOnGeneration: true,
    notifyOnError: true
  },
  quotas: {
    date: null,
    generated: 0,
    failed: 0
  }
};

// ============================================================================
// Configuration Management
// ============================================================================

function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) {
    saveConfig(DEFAULT_CONFIG);
    return DEFAULT_CONFIG;
  }
  const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  // Reset daily quota if it's a new day
  const today = new Date().toISOString().split('T')[0];
  if (config.quotas.date !== today) {
    config.quotas = { date: today, generated: 0, failed: 0 };
    saveConfig(config);
  }
  return config;
}

function saveConfig(config) {
  config.updated = new Date().toISOString();
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// ============================================================================
// Queue & Product Management
// ============================================================================

function loadQueue() {
  if (!fs.existsSync(QUEUE_PATH)) {
    return { queue: [], history: [] };
  }
  return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
}

function loadProducts() {
  const data = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));
  return data.products;
}

function loadScriptMap() {
  if (!fs.existsSync(SCRIPT_MAP_PATH)) {
    return {};
  }
  const data = JSON.parse(fs.readFileSync(SCRIPT_MAP_PATH, 'utf8'));
  // Handle nested structure: { scripts: { "1": {...}, "2": {...} } }
  return data.scripts || data;
}

function getInventoryStatus() {
  const queue = loadQueue();
  const pending = queue.queue.filter(v => v.status === 'pending').length;
  const scheduled = queue.queue.filter(v => v.status === 'scheduled').length;
  const posted = queue.history ? queue.history.length : 0;
  
  return {
    pending,
    scheduled,
    posted,
    total: queue.queue.length,
    available: pending + scheduled
  };
}

function getProductsNeedingVideos() {
  const products = loadProducts();
  const queue = loadQueue();
  const scriptMap = loadScriptMap();
  
  // Count videos per product in queue
  const videoCounts = {};
  for (const item of queue.queue) {
    const pid = item.productId || item.product_id;
    if (pid) {
      videoCounts[pid] = (videoCounts[pid] || 0) + 1;
    }
  }
  
  // Find products that could use more videos
  const candidates = [];
  for (const product of products) {
    const count = videoCounts[product.id] || 0;
    const hasScript = scriptMap[product.id] !== undefined;
    candidates.push({
      id: product.id,
      name: product.name,
      category: product.category,
      price: product.price,
      videoCount: count,
      hasScript,
      priority: hasScript ? (3 - count) : 0  // Higher priority for fewer videos
    });
  }
  
  // Sort by priority (most needed first)
  return candidates.sort((a, b) => b.priority - a.priority);
}

// ============================================================================
// Video Generation
// ============================================================================

async function generateVideo(productId) {
  const config = loadConfig();
  
  // Check daily quota
  if (config.quotas.generated >= config.thresholds.maxDailyGeneration) {
    throw new Error(`Daily quota reached (${config.quotas.generated}/${config.thresholds.maxDailyGeneration})`);
  }
  
  console.log(`🎬 Generating video for product ${productId}...`);
  
  return new Promise((resolve, reject) => {
    const editorPath = path.join(SCRIPT_DIR, 'editor.js');
    const child = spawn('node', [editorPath, '--product-id', productId], {
      cwd: ROOT_DIR,
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: config.generation.timeoutMs
    });
    
    let stdout = '';
    let stderr = '';
    
    child.stdout.on('data', (data) => {
      stdout += data.toString();
      process.stdout.write(data);
    });
    
    child.stderr.on('data', (data) => {
      stderr += data.toString();
      process.stderr.write(data);
    });
    
    child.on('close', (code) => {
      if (code === 0) {
        // Parse output to find generated video path
        const videoMatch = stdout.match(/video_\d+_\d+\.mp4/);
        const videoFile = videoMatch ? videoMatch[0] : null;
        
        // Update quota
        config.quotas.generated++;
        saveConfig(config);
        
        resolve({
          success: true,
          productId,
          videoFile,
          output: stdout
        });
      } else {
        // Update failed count
        config.quotas.failed++;
        saveConfig(config);
        
        reject(new Error(`Generation failed with code ${code}: ${stderr}`));
      }
    });
    
    child.on('error', (err) => {
      config.quotas.failed++;
      saveConfig(config);
      reject(err);
    });
  });
}

async function generateWithRetry(productId, attempts = 2) {
  const config = loadConfig();
  
  for (let i = 0; i < attempts; i++) {
    try {
      return await generateVideo(productId);
    } catch (err) {
      console.error(`⚠️ Attempt ${i + 1} failed: ${err.message}`);
      if (i < attempts - 1) {
        console.log(`⏳ Retrying in ${config.generation.retryDelayMs / 1000}s...`);
        await sleep(config.generation.retryDelayMs);
      } else {
        throw err;
      }
    }
  }
}

// ============================================================================
// Auto-Fill Logic
// ============================================================================

async function fillQueue(targetCount = null) {
  const config = loadConfig();
  const inventory = getInventoryStatus();
  const target = targetCount || config.thresholds.targetPendingVideos;
  
  const needed = Math.max(0, target - inventory.available);
  
  if (needed === 0) {
    console.log(`✅ Queue is full (${inventory.available} videos available)`);
    return { generated: 0, errors: [] };
  }
  
  console.log(`📊 Current inventory: ${inventory.available} | Target: ${target}`);
  console.log(`🎯 Need to generate ${needed} videos`);
  
  const candidates = getProductsNeedingVideos();
  const results = { generated: 0, errors: [] };
  
  for (let i = 0; i < needed && i < candidates.length; i++) {
    const product = candidates[i];
    
    // Skip products without scripts
    if (!product.hasScript) {
      console.log(`⏭️ Skipping ${product.id} (no script)`);
      continue;
    }
    
    // Check quota
    const currentConfig = loadConfig();
    if (currentConfig.quotas.generated >= config.thresholds.maxDailyGeneration) {
      console.log(`🛑 Daily quota reached, stopping fill`);
      break;
    }
    
    try {
      console.log(`\n${'─'.repeat(50)}`);
      console.log(`📦 [${i + 1}/${needed}] ${product.name}`);
      
      await generateWithRetry(product.id, config.generation.retryAttempts);
      results.generated++;
      
      // Add to posting queue
      await addToPostingQueue(product.id);
      
    } catch (err) {
      console.error(`❌ Failed: ${err.message}`);
      results.errors.push({ productId: product.id, error: err.message });
    }
  }
  
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 Fill Complete: ${results.generated} generated, ${results.errors.length} errors`);
  
  return results;
}

async function addToPostingQueue(productId) {
  // Find the most recent video for this product
  const files = fs.readdirSync(OUTPUT_DIR);
  const videoPattern = new RegExp(`video_${productId}_\\d+\\.mp4`);
  const videos = files.filter(f => videoPattern.test(f))
    .sort((a, b) => {
      const tsA = parseInt(a.match(/(\d+)\.mp4/)[1]);
      const tsB = parseInt(b.match(/(\d+)\.mp4/)[1]);
      return tsB - tsA;
    });
  
  if (videos.length > 0) {
    const latestVideo = path.join(OUTPUT_DIR, videos[0]);
    // Use posting-queue.js to add
    return new Promise((resolve, reject) => {
      const child = spawn('node', ['posting-queue.js', 'add', latestVideo, '--product-id', productId], {
        cwd: SCRIPT_DIR,
        stdio: 'pipe'
      });
      child.on('close', (code) => {
        if (code === 0) resolve();
        else reject(new Error(`Failed to add to queue`));
      });
    });
  }
}

// ============================================================================
// Commands
// ============================================================================

function cmdStatus() {
  const config = loadConfig();
  const inventory = getInventoryStatus();
  const candidates = getProductsNeedingVideos();
  
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║          AUTO-SCALER STATUS                              ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║ 📦 Pending Videos:     ${String(inventory.pending).padEnd(5)} (min: ${config.thresholds.minPendingVideos})${' '.repeat(18)}║`);
  console.log(`║ 📅 Scheduled Videos:   ${String(inventory.scheduled).padEnd(34)}║`);
  console.log(`║ ✅ Posted (history):   ${String(inventory.posted).padEnd(34)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║ 🎯 Target Level:       ${String(config.thresholds.targetPendingVideos).padEnd(34)}║`);
  console.log(`║ 📊 Need to Generate:   ${String(Math.max(0, config.thresholds.targetPendingVideos - inventory.available)).padEnd(34)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║ 📈 Today's Generated:  ${String(config.quotas.generated).padEnd(5)} / ${config.thresholds.maxDailyGeneration}${' '.repeat(24)}║`);
  console.log(`║ ❌ Today's Failed:     ${String(config.quotas.failed).padEnd(34)}║`);
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log('║ 🎬 Products by Priority:                                 ║');
  
  for (const p of candidates.slice(0, 6)) {
    const status = p.hasScript ? '✓' : '✗';
    const name = p.name.substring(0, 35).padEnd(35);
    console.log(`║   ${status} ${p.id}. ${name} (${p.videoCount} vids)   ║`);
  }
  
  console.log('╚══════════════════════════════════════════════════════════╝');
  
  // Auto-fill recommendation
  if (inventory.available < config.thresholds.minPendingVideos) {
    console.log('\n⚠️  LOW INVENTORY - Run: node auto-scaler.js fill');
  }
}

async function cmdGenerate(productId) {
  if (!productId) {
    console.error('❌ Usage: node auto-scaler.js generate <product-id>');
    process.exit(1);
  }
  
  const products = loadProducts();
  const product = products.find(p => p.id === productId);
  
  if (!product) {
    console.error(`❌ Product ${productId} not found`);
    process.exit(1);
  }
  
  console.log(`🎬 Generating video for: ${product.name}`);
  
  try {
    const result = await generateWithRetry(productId);
    console.log(`\n✅ Video generated successfully!`);
    if (result.videoFile) {
      console.log(`📹 File: ${result.videoFile}`);
    }
    
    // Auto-add to posting queue
    await addToPostingQueue(productId);
    console.log(`📬 Added to posting queue`);
    
  } catch (err) {
    console.error(`\n❌ Generation failed: ${err.message}`);
    process.exit(1);
  }
}

async function cmdFill(count = null) {
  console.log('🔄 Starting queue fill operation...\n');
  const results = await fillQueue(count);
  
  return results;
}

async function cmdBatch(productIds) {
  if (!productIds || productIds.length === 0) {
    // Default: all products with scripts
    const scriptMap = loadScriptMap();
    productIds = Object.keys(scriptMap);
  }
  
  console.log(`🎬 Batch generating ${productIds.length} videos...\n`);
  
  const results = { success: [], failed: [] };
  
  for (const pid of productIds) {
    try {
      console.log(`\n${'─'.repeat(50)}`);
      await generateWithRetry(pid);
      await addToPostingQueue(pid);
      results.success.push(pid);
    } catch (err) {
      console.error(`❌ Product ${pid} failed: ${err.message}`);
      results.failed.push({ id: pid, error: err.message });
    }
  }
  
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`📊 Batch Complete:`);
  console.log(`   ✅ Success: ${results.success.length}`);
  console.log(`   ❌ Failed: ${results.failed.length}`);
  
  return results;
}

function cmdQuota() {
  const config = loadConfig();
  const today = new Date().toISOString().split('T')[0];
  
  console.log('╔══════════════════════════════════════════════════════════╗');
  console.log('║              DAILY QUOTA STATUS                          ║');
  console.log('╠══════════════════════════════════════════════════════════╣');
  console.log(`║ 📅 Date:          ${today}                          ║`);
  console.log(`║ 📈 Generated:     ${String(config.quotas.generated).padEnd(5)} / ${config.thresholds.maxDailyGeneration}${' '.repeat(27)}║`);
  console.log(`║ ❌ Failed:        ${String(config.quotas.failed).padEnd(38)}║`);
  console.log(`║ 📊 Remaining:     ${String(config.thresholds.maxDailyGeneration - config.quotas.generated).padEnd(38)}║`);
  console.log('╚══════════════════════════════════════════════════════════╝');
}

function cmdConfig() {
  const config = loadConfig();
  console.log('\n📋 Auto-Scaler Configuration:\n');
  console.log(JSON.stringify(config, null, 2));
}

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ============================================================================
// Main CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'status';
  
  switch (command) {
    case 'status':
      cmdStatus();
      break;
      
    case 'generate':
      await cmdGenerate(args[1]);
      break;
      
    case 'fill':
      const countIdx = args.indexOf('--count');
      const count = countIdx !== -1 ? parseInt(args[countIdx + 1]) : null;
      await cmdFill(count);
      break;
      
    case 'batch':
      const productsIdx = args.indexOf('--products');
      const productIds = productsIdx !== -1 
        ? args[productsIdx + 1].split(',') 
        : null;
      await cmdBatch(productIds);
      break;
      
    case 'quota':
      cmdQuota();
      break;
      
    case 'config':
      cmdConfig();
      break;
      
    case 'monitor':
      console.log('🔄 Monitor mode not yet implemented');
      console.log('Use cron jobs or heartbeats for periodic checks');
      break;
      
    default:
      console.log(`
Auto-Scaler — On-Demand Video Generation

Usage:
  node auto-scaler.js status              Show inventory levels
  node auto-scaler.js generate <id>       Generate single video
  node auto-scaler.js fill [--count N]    Fill queue to threshold
  node auto-scaler.js batch [--products 1,2,3]  Batch generate
  node auto-scaler.js quota               Check daily quotas
  node auto-scaler.js config              Show configuration
      `);
  }
}

// Export for programmatic use
module.exports = {
  loadConfig,
  getInventoryStatus,
  getProductsNeedingVideos,
  generateVideo,
  fillQueue
};

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
