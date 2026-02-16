#!/usr/bin/env node
/**
 * Production Queue Manager for @dailydealfeed
 * 
 * Pairs approved products with approved clips and generates videos.
 * 
 * Features:
 *   - Loads validated products from staging/products/approved/
 *   - Loads evaluated clips from staging/clips/approved-manifest.json
 *   - Matches products to clips by category/vibe
 *   - Creates production queue with best clip for each product
 *   - Generates videos using editor.js
 *   - Runs output QA on generated videos
 * 
 * Usage:
 *   node queue-manager.js                    # Build queue and show status
 *   node queue-manager.js --build            # Build production queue
 *   node queue-manager.js --process          # Process entire queue
 *   node queue-manager.js --process --limit 3  # Process first N items
 *   node queue-manager.js --status           # Show queue status
 *   node queue-manager.js --qa               # Run QA on completed videos
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

// ============================================
// CONFIGURATION
// ============================================

const PROJECT_DIR = path.join(__dirname, '..');
const STAGING_DIR = path.join(PROJECT_DIR, 'staging');
const PRODUCTION_DIR = path.join(PROJECT_DIR, 'production');
const OUTPUT_DIR = path.join(PROJECT_DIR, 'output');

const PATHS = {
  approvedProducts: path.join(STAGING_DIR, 'products', 'approved'),
  approvedClipsManifest: path.join(STAGING_DIR, 'clips', 'approved-manifest.json'),
  queue: path.join(PRODUCTION_DIR, 'queue'),
  inProgress: path.join(PRODUCTION_DIR, 'in-progress'),
  completed: path.join(PRODUCTION_DIR, 'completed'),
  outputApproved: path.join(OUTPUT_DIR, 'approved'),
  outputRejected: path.join(OUTPUT_DIR, 'rejected'),
  queueManifest: path.join(PRODUCTION_DIR, 'queue', 'manifest.json'),
};

// Category to Vibe mapping
// Products in these categories match best with clips of these vibes
const VIBE_MAPPING = {
  skincare: ['satisfying', 'wholesome', 'calm', 'cozy'],
  beauty: ['satisfying', 'wholesome', 'aesthetic', 'calm'],
  cleaning: ['funny', 'satisfying', 'quirky', 'fun'],
  drinkware: ['satisfying', 'wholesome', 'cozy', 'lifestyle'],
  footwear: ['funny', 'satisfying', 'quirky', 'fun'],
  home: ['satisfying', 'cozy', 'wholesome', 'lifestyle'],
  kitchen: ['funny', 'satisfying', 'fun', 'quirky'],
  tech: ['satisfying', 'modern', 'sleek', 'cool'],
  default: ['funny', 'satisfying', 'wholesome']
};

// Clip vibe classification based on source
// Note: Since clips don't have explicit vibes, we'll classify by source/quality
const SOURCE_VIBE_MAP = {
  'AFV/Processed': ['funny', 'satisfying', 'quirky'],  // AFV clips are typically funny
  'YouTube/TikTok Shorts': ['satisfying', 'wholesome', 'funny'],
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function ensureDirs() {
  Object.values(PATHS).forEach(p => {
    if (!p.endsWith('.json')) {
      if (!fs.existsSync(p)) {
        fs.mkdirSync(p, { recursive: true });
      }
    }
  });
}

function log(message, emoji = '📋') {
  console.log(`${emoji} ${message}`);
}

function loadJSON(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function saveJSON(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

// ============================================
// DATA LOADING
// ============================================

/**
 * Load all approved products from individual JSON files
 */
function loadApprovedProducts() {
  const products = [];
  
  if (!fs.existsSync(PATHS.approvedProducts)) {
    log('No approved products directory found', '⚠️');
    return products;
  }
  
  const files = fs.readdirSync(PATHS.approvedProducts)
    .filter(f => f.endsWith('.json') && !f.includes('manifest'));
  
  for (const file of files) {
    const filePath = path.join(PATHS.approvedProducts, file);
    const product = loadJSON(filePath);
    if (product && product.validation && product.validation.valid) {
      products.push(product);
    }
  }
  
  log(`Loaded ${products.length} approved products`, '📦');
  return products;
}

/**
 * Load approved clips from manifest
 */
function loadApprovedClips() {
  const manifest = loadJSON(PATHS.approvedClipsManifest);
  
  if (!manifest || !manifest.clips) {
    log('No approved clips manifest found', '⚠️');
    return [];
  }
  
  // Sort by score (highest first) for quality prioritization
  const clips = manifest.clips.sort((a, b) => b.score - a.score);
  
  log(`Loaded ${clips.length} approved clips (avg score: ${manifest.average_score})`, '🎬');
  return clips;
}

// ============================================
// VIBE MATCHING
// ============================================

/**
 * Classify a clip's vibe based on its source and characteristics
 */
function classifyClipVibe(clip) {
  // Start with source-based classification
  const vibes = SOURCE_VIBE_MAP[clip.source] || ['satisfying'];
  
  // High-quality clips (score > 9) tend to be more "satisfying"
  if (clip.score >= 9.5) {
    return ['satisfying', ...vibes];
  }
  
  // AFV clips with medium quality are funnier
  if (clip.source.includes('AFV') && clip.score >= 8.5) {
    return ['funny', 'satisfying', ...vibes];
  }
  
  // TikTok clips are versatile
  if (clip.filename.includes('tt_') || clip.filename.includes('short_')) {
    return ['funny', 'wholesome', 'satisfying'];
  }
  
  // YouTube segments tend to be higher production value
  if (clip.filename.includes('yt_seg')) {
    return ['satisfying', 'aesthetic', 'wholesome'];
  }
  
  return vibes;
}

/**
 * Score how well a clip matches a product's category
 */
function calculateVibeMatch(product, clip) {
  const productVibes = VIBE_MAPPING[product.category] || VIBE_MAPPING.default;
  const clipVibes = classifyClipVibe(clip);
  
  // Count matching vibes
  let matchScore = 0;
  for (const vibe of productVibes) {
    if (clipVibes.includes(vibe)) {
      matchScore += 10;
    }
  }
  
  // Bonus for high-quality clips
  matchScore += clip.score;
  
  // Bonus for clips with audio (better engagement)
  if (clip.metadata && clip.metadata.has_audio) {
    matchScore += 5;
  }
  
  // Bonus for 1080p resolution
  if (clip.metadata && clip.metadata.width === 1080) {
    matchScore += 3;
  }
  
  // Ideal duration bonus (4-6 seconds is perfect for hooks)
  if (clip.metadata && clip.metadata.duration >= 4 && clip.metadata.duration <= 6) {
    matchScore += 5;
  }
  
  return matchScore;
}

// ============================================
// QUEUE BUILDING
// ============================================

/**
 * Build production queue by matching products to clips
 */
function buildQueue(options = {}) {
  const { forceRebuild = false } = options;
  
  // Check for existing queue
  if (!forceRebuild && fs.existsSync(PATHS.queueManifest)) {
    const existing = loadJSON(PATHS.queueManifest);
    if (existing && existing.items && existing.items.length > 0) {
      log(`Queue already exists with ${existing.items.length} items. Use --force to rebuild.`, '📋');
      return existing;
    }
  }
  
  const products = loadApprovedProducts();
  const clips = loadApprovedClips();
  
  if (products.length === 0) {
    log('No approved products to process', '⚠️');
    return null;
  }
  
  if (clips.length === 0) {
    log('No approved clips available', '⚠️');
    return null;
  }
  
  // Track which clips have been used
  const usedClips = new Set();
  const queue = [];
  
  log('Matching products to clips...', '🔄');
  
  for (const product of products) {
    // Find best matching unused clip
    let bestClip = null;
    let bestScore = -1;
    
    for (const clip of clips) {
      if (usedClips.has(clip.filename)) continue;
      
      const matchScore = calculateVibeMatch(product, clip);
      if (matchScore > bestScore) {
        bestScore = matchScore;
        bestClip = clip;
      }
    }
    
    if (bestClip) {
      usedClips.add(bestClip.filename);
      
      const queueItem = {
        id: `item_${Date.now()}_${product.asin}`,
        product: {
          id: product.id,
          asin: product.asin,
          name: product.name,
          price: product.validation?.liveData?.price || product.price,
          category: product.category,
          image_url: product.image_url,
          affiliate_link: product.affiliate_link,
          best_stat: product.best_stat
        },
        clip: {
          filename: bestClip.filename,
          path: bestClip.path,
          score: bestClip.score,
          source: bestClip.source,
          duration: bestClip.metadata?.duration,
          has_audio: bestClip.metadata?.has_audio
        },
        matchScore: bestScore,
        status: 'pending',
        createdAt: new Date().toISOString(),
        outputPath: null,
        qaScore: null
      };
      
      queue.push(queueItem);
      
      log(`  ${product.name} → ${bestClip.filename} (match: ${bestScore.toFixed(1)})`, '✅');
    } else {
      log(`  ${product.name} → No suitable clip found`, '⚠️');
    }
  }
  
  // Save queue manifest
  const manifest = {
    version: 1,
    createdAt: new Date().toISOString(),
    totalItems: queue.length,
    pendingItems: queue.length,
    completedItems: 0,
    items: queue
  };
  
  saveJSON(PATHS.queueManifest, manifest);
  
  log(`Queue built with ${queue.length} items`, '✅');
  return manifest;
}

// ============================================
// VIDEO GENERATION
// ============================================

/**
 * Generate video for a queue item
 */
async function generateVideo(item) {
  log(`Generating video for: ${item.product.name}`, '🎬');
  
  const editorPath = path.join(__dirname, 'editor.js');
  const tempDir = path.join(PROJECT_DIR, 'temp');
  
  if (!fs.existsSync(tempDir)) {
    fs.mkdirSync(tempDir, { recursive: true });
  }
  
  // Create input JSON for editor
  const editorInput = {
    product_id: item.product.id,
    product_name: item.product.name,
    product_image: item.product.image_url,
    product_price: item.product.price,
    meme_url: item.clip.path,  // Use clip as the hook video
    clip_local_path: item.clip.path,  // Set for proper extension detection
    hook_angle: `Check this out: ${item.product.name}`,
    category: item.product.category,
    best_stat: item.product.best_stat,
    affiliate_link: item.product.affiliate_link
  };
  
  const inputPath = path.join(tempDir, `editor_input_${item.id}.json`);
  fs.writeFileSync(inputPath, JSON.stringify(editorInput, null, 2));
  
  try {
    // Run editor.js
    const result = spawnSync('node', [editorPath, '--input', inputPath], {
      cwd: PROJECT_DIR,
      encoding: 'utf8',
      timeout: 120000,  // 2 minute timeout
      stdio: 'pipe'
    });
    
    if (result.error) {
      throw new Error(result.error.message);
    }
    
    if (result.status !== 0) {
      console.error('Editor stderr:', result.stderr);
      throw new Error(`Editor exited with code ${result.status}`);
    }
    
    // Parse output to find video path
    const output = result.stdout;
    const videoMatch = output.match(/✅ Video saved: (.+\.mp4)/);
    
    if (videoMatch) {
      const videoPath = videoMatch[1];
      log(`Video created: ${path.basename(videoPath)}`, '✅');
      return videoPath;
    } else {
      // Look for any mp4 in output directory
      const outputFiles = fs.readdirSync(OUTPUT_DIR)
        .filter(f => f.includes(item.product.asin) && f.endsWith('.mp4'))
        .sort((a, b) => {
          const statA = fs.statSync(path.join(OUTPUT_DIR, a));
          const statB = fs.statSync(path.join(OUTPUT_DIR, b));
          return statB.mtime - statA.mtime;
        });
      
      if (outputFiles.length > 0) {
        return path.join(OUTPUT_DIR, outputFiles[0]);
      }
      
      throw new Error('Could not find generated video');
    }
  } catch (err) {
    log(`Video generation failed: ${err.message}`, '❌');
    return null;
  } finally {
    // Cleanup temp input file
    if (fs.existsSync(inputPath)) {
      fs.unlinkSync(inputPath);
    }
  }
}

/**
 * Run QA evaluation on a generated video
 */
function evaluateVideo(videoPath) {
  if (!videoPath || !fs.existsSync(videoPath)) {
    return { score: 0, issues: ['Video file not found'] };
  }
  
  const issues = [];
  let score = 10;
  
  try {
    // Get video metadata with ffprobe
    const probeResult = execSync(
      `ffprobe -v quiet -print_format json -show_format -show_streams "${videoPath}"`,
      { encoding: 'utf8' }
    );
    const metadata = JSON.parse(probeResult);
    
    // Check duration
    const duration = parseFloat(metadata.format?.duration || 0);
    if (duration < 8) {
      score -= 2;
      issues.push(`Short duration: ${duration.toFixed(1)}s (expected 10-15s)`);
    } else if (duration > 20) {
      score -= 1;
      issues.push(`Long duration: ${duration.toFixed(1)}s (expected 10-15s)`);
    }
    
    // Check video stream
    const videoStream = metadata.streams?.find(s => s.codec_type === 'video');
    if (!videoStream) {
      score -= 5;
      issues.push('No video stream found');
    } else {
      // Check resolution
      if (videoStream.width !== 1080 || videoStream.height !== 1920) {
        score -= 1;
        issues.push(`Non-standard resolution: ${videoStream.width}x${videoStream.height}`);
      }
      
      // Check framerate
      const fps = eval(videoStream.r_frame_rate || '0');
      if (fps < 24) {
        score -= 1;
        issues.push(`Low framerate: ${fps} fps`);
      }
    }
    
    // Check audio stream
    const audioStream = metadata.streams?.find(s => s.codec_type === 'audio');
    if (!audioStream) {
      score -= 2;
      issues.push('No audio track');
    }
    
    // Check file size
    const fileSize = parseInt(metadata.format?.size || 0);
    const fileSizeMB = fileSize / (1024 * 1024);
    if (fileSizeMB < 0.5) {
      score -= 2;
      issues.push(`Very small file: ${fileSizeMB.toFixed(2)} MB`);
    } else if (fileSizeMB > 50) {
      score -= 1;
      issues.push(`Large file: ${fileSizeMB.toFixed(2)} MB`);
    }
    
  } catch (err) {
    score -= 3;
    issues.push(`Probe error: ${err.message}`);
  }
  
  return {
    score: Math.max(0, score),
    issues,
    passed: score >= 7
  };
}

// ============================================
// QUEUE PROCESSING
// ============================================

/**
 * Process queue items
 */
async function processQueue(options = {}) {
  const { limit = Infinity, dryRun = false } = options;
  
  const manifest = loadJSON(PATHS.queueManifest);
  
  if (!manifest || !manifest.items) {
    log('No queue found. Run --build first.', '⚠️');
    return;
  }
  
  const pendingItems = manifest.items.filter(i => i.status === 'pending');
  
  if (pendingItems.length === 0) {
    log('No pending items in queue', '✅');
    return;
  }
  
  const toProcess = pendingItems.slice(0, limit);
  log(`Processing ${toProcess.length} of ${pendingItems.length} pending items...`, '🔄');
  
  if (dryRun) {
    log('DRY RUN - no videos will be generated', '🏃');
    for (const item of toProcess) {
      log(`  Would process: ${item.product.name} + ${item.clip.filename}`, '📋');
    }
    return;
  }
  
  const results = [];
  
  for (let i = 0; i < toProcess.length; i++) {
    const item = toProcess[i];
    log(`\n[${i + 1}/${toProcess.length}] Processing: ${item.product.name}`, '🎬');
    
    // Update status to in-progress
    item.status = 'in-progress';
    item.startedAt = new Date().toISOString();
    saveJSON(PATHS.queueManifest, manifest);
    
    try {
      // Generate video
      const videoPath = await generateVideo(item);
      
      if (videoPath) {
        // Run QA
        const qa = evaluateVideo(videoPath);
        
        item.outputPath = videoPath;
        item.qaScore = qa.score;
        item.qaIssues = qa.issues;
        item.status = qa.passed ? 'completed' : 'needs-review';
        item.completedAt = new Date().toISOString();
        
        // Move to appropriate output folder
        const destDir = qa.passed ? PATHS.outputApproved : PATHS.outputRejected;
        const destPath = path.join(destDir, path.basename(videoPath));
        
        if (fs.existsSync(videoPath) && videoPath !== destPath) {
          fs.copyFileSync(videoPath, destPath);
          item.finalPath = destPath;
        }
        
        results.push({
          product: item.product.name,
          clip: item.clip.filename,
          qaScore: qa.score,
          passed: qa.passed,
          issues: qa.issues,
          path: destPath
        });
        
        log(`  QA Score: ${qa.score}/10 ${qa.passed ? '✅' : '⚠️'}`, qa.passed ? '✅' : '⚠️');
        if (qa.issues.length > 0) {
          qa.issues.forEach(issue => log(`    - ${issue}`, '📝'));
        }
      } else {
        item.status = 'failed';
        item.error = 'Video generation failed';
        results.push({
          product: item.product.name,
          clip: item.clip.filename,
          qaScore: 0,
          passed: false,
          issues: ['Generation failed']
        });
      }
    } catch (err) {
      item.status = 'failed';
      item.error = err.message;
      log(`  Error: ${err.message}`, '❌');
    }
    
    // Update manifest
    manifest.completedItems = manifest.items.filter(i => i.status === 'completed').length;
    manifest.pendingItems = manifest.items.filter(i => i.status === 'pending').length;
    saveJSON(PATHS.queueManifest, manifest);
  }
  
  // Summary
  console.log('\n' + '='.repeat(50));
  log('PROCESSING COMPLETE', '🎬');
  console.log('='.repeat(50));
  
  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  
  console.log(`  Generated: ${results.length} videos`);
  console.log(`  Passed QA: ${passed}`);
  console.log(`  Needs Review: ${failed}`);
  console.log(`  Avg Score: ${(results.reduce((a, r) => a + r.qaScore, 0) / results.length).toFixed(1)}/10`);
  
  if (passed > 0) {
    console.log(`\n📁 Ready for review:`);
    results.filter(r => r.passed).forEach(r => {
      console.log(`   - ${r.path}`);
    });
  }
  
  return results;
}

/**
 * Show queue status
 */
function showStatus() {
  const manifest = loadJSON(PATHS.queueManifest);
  
  if (!manifest) {
    log('No queue found. Run --build first.', '⚠️');
    return;
  }
  
  console.log('\n' + '='.repeat(50));
  console.log('PRODUCTION QUEUE STATUS');
  console.log('='.repeat(50));
  
  const statusCounts = {
    pending: 0,
    'in-progress': 0,
    completed: 0,
    'needs-review': 0,
    failed: 0
  };
  
  for (const item of manifest.items) {
    statusCounts[item.status] = (statusCounts[item.status] || 0) + 1;
  }
  
  console.log(`\nTotal Items: ${manifest.totalItems}`);
  console.log(`  📋 Pending:      ${statusCounts.pending}`);
  console.log(`  🔄 In Progress:  ${statusCounts['in-progress']}`);
  console.log(`  ✅ Completed:    ${statusCounts.completed}`);
  console.log(`  ⚠️  Needs Review: ${statusCounts['needs-review']}`);
  console.log(`  ❌ Failed:       ${statusCounts.failed}`);
  
  if (manifest.items.length > 0) {
    console.log('\nQueue Items:');
    for (const item of manifest.items) {
      const statusIcon = {
        pending: '📋',
        'in-progress': '🔄',
        completed: '✅',
        'needs-review': '⚠️',
        failed: '❌'
      }[item.status] || '❓';
      
      const qaInfo = item.qaScore !== null ? ` (QA: ${item.qaScore}/10)` : '';
      console.log(`  ${statusIcon} ${item.product.name} + ${item.clip.filename}${qaInfo}`);
    }
  }
}

// ============================================
// CLI
// ============================================

async function main() {
  const args = process.argv.slice(2);
  
  ensureDirs();
  
  console.log('\n' + '='.repeat(50));
  console.log('🎬 DAILYDEALFEED PRODUCTION QUEUE MANAGER');
  console.log('='.repeat(50) + '\n');
  
  if (args.includes('--build') || args.includes('-b')) {
    const forceRebuild = args.includes('--force') || args.includes('-f');
    buildQueue({ forceRebuild });
  } else if (args.includes('--process') || args.includes('-p')) {
    const limitIdx = args.indexOf('--limit');
    const limit = limitIdx !== -1 ? parseInt(args[limitIdx + 1]) : Infinity;
    const dryRun = args.includes('--dry-run');
    await processQueue({ limit, dryRun });
  } else if (args.includes('--status') || args.includes('-s')) {
    showStatus();
  } else if (args.includes('--qa')) {
    // Run QA on all videos in output directory
    const videos = fs.readdirSync(OUTPUT_DIR)
      .filter(f => f.endsWith('.mp4'))
      .map(f => path.join(OUTPUT_DIR, f));
    
    console.log(`Running QA on ${videos.length} videos...\n`);
    
    for (const video of videos) {
      const qa = evaluateVideo(video);
      console.log(`${path.basename(video)}: ${qa.score}/10 ${qa.passed ? '✅' : '⚠️'}`);
      if (qa.issues.length > 0) {
        qa.issues.forEach(i => console.log(`  - ${i}`));
      }
    }
  } else {
    // Default: show status and build queue if needed
    const manifest = loadJSON(PATHS.queueManifest);
    if (!manifest) {
      buildQueue();
    }
    showStatus();
    
    console.log('\nCommands:');
    console.log('  --build, -b       Build production queue');
    console.log('  --build --force   Rebuild queue from scratch');
    console.log('  --process, -p     Process pending queue items');
    console.log('  --process --limit N  Process first N items');
    console.log('  --status, -s      Show queue status');
    console.log('  --qa              Run QA on output videos');
  }
}

// ============================================
// EXPORTS
// ============================================

module.exports = {
  buildQueue,
  processQueue,
  showStatus,
  evaluateVideo,
  loadApprovedProducts,
  loadApprovedClips
};

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}
