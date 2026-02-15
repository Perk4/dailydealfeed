#!/usr/bin/env node
/**
 * Scout Agent V2 - Product Selection & Viral Clip Sourcing
 * For DailyDealFeed Reels Pipeline
 *
 * UPGRADED: Now uses curated viral-style clips instead of generic Giphy GIFs
 * Sources: Mixkit, Pexels, Coverr (all royalty-free, commercial use)
 *
 * Usage:
 *   node scout.js                    # Select next product + find clip
 *   node scout.js --product-id 5     # Scout for specific product
 *   node scout.js --list             # List all products
 *   node scout.js --featured         # Show featured products only
 *   node scout.js --cache-all        # Pre-download all clips
 *   node scout.js --clip-stats       # Show clip library stats
 */

const fs = require('fs');
const path = require('path');

// Paths
const SCRIPT_DIR = __dirname;
const PROJECT_DIR = path.join(SCRIPT_DIR, '..');
const PRODUCTS_FILE = path.join(PROJECT_DIR, 'products.json');
const STATE_FILE = path.join(SCRIPT_DIR, 'scout_state.json');
const CLIPS_FILE = path.join(PROJECT_DIR, 'clips', 'curated.json');
const CLIPS_CACHE_DIR = path.join(PROJECT_DIR, 'clips', 'cache');

// Ensure cache directory exists
if (!fs.existsSync(CLIPS_CACHE_DIR)) {
  fs.mkdirSync(CLIPS_CACHE_DIR, { recursive: true });
}

// Product vibe mappings based on taglines and categories
// Keys support partial matching (searched as substring in product name)
const PRODUCT_VIBES = {
  "Moon Lamp": {
    vibes: ["cozy", "transformation"],
    hookTemplates: [
      "POV: Your room transformation at 3am",
      "When the vibes finally hit different",
    ]
  },
  "Pocket Printer": {
    vibes: ["shocked", "reaction"],
    hookTemplates: [
      "Wait this actually works?!",
      "The gadget that changed my photo game",
    ]
  },
  "Charging Station": {
    vibes: ["reveal", "reaction"],
    hookTemplates: [
      "Finally found the nightstand solution",
      "Cord chaos? Never heard of it",
    ]
  },
  "Light Therapy": {
    vibes: ["transformation", "reaction"],
    hookTemplates: [
      "My seasonal depression hack nobody talks about",
      "The $50 that saved my winter",
    ]
  },
  "Self Stirring": {
    vibes: ["twist", "cozy"],
    hookTemplates: [
      "For my fellow lazy people who get it",
      "When you're too tired to stir your coffee",
    ]
  },
  "Pink Stuff": {
    vibes: ["transformation", "shocked", "reveal"],
    hookTemplates: [
      "This $10 paste vs my disgusting stove",
      "The before/after that broke me",
    ]
  },
  "Little Green": {
    vibes: ["shocked", "transformation", "reveal"],
    hookTemplates: [
      "What came out of my couch... I'm disturbed",
      "Don't watch this while eating (but you will)",
    ]
  },
  "Key Holder": {
    vibes: ["cozy", "twist"],
    hookTemplates: [
      "The cutest solution to my lost keys problem",
      "This little cloud fixed my life",
    ]
  },
  "Glass Cups": {
    vibes: ["reveal", "transformation"],
    hookTemplates: [
      "How I made my kitchen look expensive for $25",
      "The aesthetic glow-up nobody asked for",
    ]
  },
  "Waffle Maker": {
    vibes: ["cozy", "reaction"],
    hookTemplates: [
      "The TikTok waffle maker - is it actually worth it?",
      "Mini waffles that changed my mornings",
    ]
  },
  "Pimple Patches": {
    vibes: ["twist", "reaction"],
    hookTemplates: [
      "Making acne kinda cute somehow?",
      "The patch that made me stop caring about breakouts",
    ]
  },
  "Ice Roller": {
    vibes: ["transformation", "reaction"],
    hookTemplates: [
      "My face at 7am vs after this thing",
      "The $12 morning routine game changer",
    ]
  },
  "Foot Peel": {
    vibes: ["shocked", "transformation"],
    hookTemplates: [
      "Warning: this is disturbing (but satisfying)",
      "DO NOT watch this while eating",
    ]
  },
  "Cloud Pillow": {
    vibes: ["cozy", "reaction"],
    hookTemplates: [
      "I refused to believe the hype... until now",
      "Why everyone and their mom has these",
    ]
  },
  "Loop": {
    vibes: ["reaction", "reveal"],
    hookTemplates: [
      "How I protect my hearing without missing the music",
      "The earplug that doesn't make you look weird",
    ]
  },
};

// Category to vibe fallback mapping
const CATEGORY_VIBES = {
  tech: ["shocked", "reveal", "reaction"],
  home: ["reveal", "cozy", "transformation"],
  wellness: ["transformation", "cozy", "reaction"],
  cleaning: ["transformation", "shocked", "reveal"],
  kitchen: ["cozy", "reveal", "twist"],
  lifestyle: ["cozy", "twist", "reaction"],
  beauty: ["transformation", "reveal", "reaction"],
};

/**
 * Load clips library from JSON
 */
function loadClipsLibrary() {
  if (!fs.existsSync(CLIPS_FILE)) {
    console.error(`Clips library not found at ${CLIPS_FILE}`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(CLIPS_FILE, 'utf8'));
}

/**
 * Get local path for a clip (check cache or return null)
 * For manual caching, use: yt-dlp -o "clips/cache/%(id)s.mp4" URL
 */
function getClipLocalPath(clip) {
  const cacheFile = path.join(CLIPS_CACHE_DIR, `${clip.id}.mp4`);
  
  if (fs.existsSync(cacheFile)) {
    const stats = fs.statSync(cacheFile);
    if (stats.size > 10000) {
      return cacheFile;
    }
  }
  
  return null; // Use clip.url for streaming
}

/**
 * Try to download a clip using yt-dlp (best method for protected video sites)
 * V3 UPGRADE: Uses clip.url directly, with sourceId fallback for pexels
 */
async function downloadClipYtdlp(clip) {
  const cacheFile = path.join(CLIPS_CACHE_DIR, `${clip.id}.mp4`);
  
  // Check if already cached and valid
  if (fs.existsSync(cacheFile)) {
    const stats = fs.statSync(cacheFile);
    if (stats.size > 10000) {
      return cacheFile;
    }
    fs.unlinkSync(cacheFile);
  }
  
  // Use the clip URL directly (curated.json has full URLs)
  let pageUrl = clip.url;
  
  // Fallback: construct URL from sourceId if needed
  if (!pageUrl && clip.sourceId) {
    if (clip.source === 'pexels') {
      pageUrl = `https://www.pexels.com/video/${clip.sourceId}/`;
    } else if (clip.source === 'mixkit') {
      pageUrl = `https://mixkit.co/free-stock-video/${clip.sourceId}/`;
    } else if (clip.source === 'pixabay') {
      pageUrl = `https://pixabay.com/videos/id-${clip.sourceId}/`;
    }
  }
  
  if (!pageUrl) {
    throw new Error('No valid URL found for clip');
  }
  
  return new Promise((resolve, reject) => {
    const { spawn } = require('child_process');
    const ytdlp = spawn('yt-dlp', [
      '-f', 'best[height<=720]',
      '-o', cacheFile,
      '--no-playlist',
      pageUrl
    ]);
    
    let stderr = '';
    ytdlp.stderr.on('data', (data) => { stderr += data; });
    
    ytdlp.on('close', (code) => {
      if (code === 0 && fs.existsSync(cacheFile)) {
        resolve(cacheFile);
      } else {
        reject(new Error(`yt-dlp failed: ${stderr || 'unknown error'}`));
      }
    });
    
    ytdlp.on('error', (err) => {
      reject(new Error(`yt-dlp not found: ${err.message}`));
    });
  });
}

/**
 * Pre-cache all clips using yt-dlp
 * V3 UPGRADE: Works with flat clips array
 */
async function cacheAllClips() {
  const library = loadClipsLibrary();
  const clips = library.clips || [];
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  
  // Check if yt-dlp is available
  const { execSync } = require('child_process');
  try {
    execSync('which yt-dlp', { stdio: 'ignore' });
  } catch {
    console.log('⚠️  yt-dlp not found. Install with: pip install yt-dlp');
    console.log('\nManual download alternative:');
    console.log('Visit each URL in curated.json and download manually to clips/cache/\n');
    
    // Group by vibe for display
    const vibeGroups = {};
    for (const clip of clips) {
      const vibe = clip.vibe || 'unknown';
      if (!vibeGroups[vibe]) vibeGroups[vibe] = [];
      vibeGroups[vibe].push(clip);
    }
    
    // Print URLs for manual download
    for (const [vibe, vibeClips] of Object.entries(vibeGroups)) {
      console.log(`\n=== ${vibe.toUpperCase()} ===`);
      for (const clip of vibeClips) {
        const cacheFile = path.join(CLIPS_CACHE_DIR, `${clip.id}.mp4`);
        if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 10000) {
          console.log(`✓ ${clip.id} (cached)`);
        } else {
          console.log(`  ${clip.id}: ${clip.url}`);
        }
      }
    }
    return;
  }
  
  for (const clip of clips) {
    const cacheFile = path.join(CLIPS_CACHE_DIR, `${clip.id}.mp4`);
    
    if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 10000) {
      console.log(`✓ Already cached: ${clip.id}`);
      skipped++;
      continue;
    }
    
    console.log(`Downloading ${clip.id}: ${clip.description || clip.id}...`);
    
    try {
      await downloadClipYtdlp(clip);
      console.log(`✓ Downloaded: ${clip.id}`);
      downloaded++;
    } catch (err) {
      console.log(`✗ Failed: ${clip.id} - ${err.message}`);
      failed++;
    }
    
    // Delay between downloads to be respectful
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`\nCache complete: ${downloaded} downloaded, ${skipped} already cached, ${failed} failed`);
}

/**
 * Show clip library statistics
 * V3 UPGRADE: Works with flat clips array
 */
function showClipStats() {
  const library = loadClipsLibrary();
  const clips = library.clips || [];
  
  console.log('\n📊 Clip Library Stats\n');
  console.log(`Version: ${library._meta?.version || 'unknown'}`);
  console.log(`Updated: ${library._meta?.updated || 'unknown'}`);
  console.log(`Curator: ${library._meta?.curator || 'unknown'}`);
  console.log('\nClips by vibe:');
  
  // Group clips by vibe
  const vibeGroups = {};
  for (const clip of clips) {
    const vibe = clip.vibe || 'unknown';
    if (!vibeGroups[vibe]) vibeGroups[vibe] = [];
    vibeGroups[vibe].push(clip);
  }
  
  let total = clips.length;
  let cached = 0;
  
  for (const [vibe, vibeClips] of Object.entries(vibeGroups)) {
    const cachedCount = vibeClips.filter(c => 
      fs.existsSync(path.join(CLIPS_CACHE_DIR, `${c.id}.mp4`))
    ).length;
    cached += cachedCount;
    
    console.log(`  ${vibe.padEnd(15)} ${vibeClips.length} clips (${cachedCount} cached)`);
  }
  
  console.log(`\nTotal: ${total} clips (${cached} cached locally)`);
  
  if (library._meta?.sources) {
    console.log(`\nSources used:`);
    for (const [source, desc] of Object.entries(library._meta.sources)) {
      console.log(`  ${source}: ${desc}`);
    }
  }
  
  if (library._meta?.notes) {
    console.log(`\nNotes: ${library._meta.notes}`);
  }
}

function loadProducts() {
  const data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
  return data.products;
}

function loadState() {
  if (fs.existsSync(STATE_FILE)) {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  }
  return {
    lastProductId: null,
    lastCategory: null,
    usedProductIds: [],
    usedClipIds: [],
    categoryRotationIndex: 0,
    lastRun: null
  };
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
}

function randomChoice(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function selectProduct(products, state, productId = null) {
  // If specific product requested
  if (productId) {
    const product = products.find(p => p.id === String(productId));
    if (!product) throw new Error(`Product ${productId} not found`);
    return product;
  }

  // Get featured products not recently used (last 5)
  const recentIds = state.usedProductIds.slice(-5);
  const featured = products.filter(p => p.featured && !recentIds.includes(p.id));

  if (featured.length > 0) {
    // Rotate categories among featured
    const categories = ['tech', 'home', 'wellness'];
    const catIdx = state.categoryRotationIndex % categories.length;
    const targetCat = categories[catIdx];

    // Try to find featured in target category
    const catFeatured = featured.filter(p => p.category === targetCat);
    if (catFeatured.length > 0) {
      return catFeatured[0];
    }

    // Otherwise pick any featured
    return featured[0];
  }

  // No featured available, rotate through all by category
  const categories = ['tech', 'home', 'wellness'];
  const catIdx = state.categoryRotationIndex % categories.length;
  const targetCat = categories[catIdx];

  const recentIds10 = state.usedProductIds.slice(-10);
  let available = products.filter(p => p.category === targetCat && !recentIds10.includes(p.id));
  if (available.length > 0) {
    return available[0];
  }

  // Fallback: any product not recently used
  available = products.filter(p => !recentIds.includes(p.id));
  if (available.length > 0) {
    return available[0];
  }

  // Last resort: random
  return randomChoice(products);
}

/**
 * Find the best viral clip for a product
 * V3 UPGRADE: Uses curated.json with flat clips array + vibeMap
 */
function findClip(product, state) {
  const library = loadClipsLibrary();
  const productName = product.name;
  const productCategory = product.category;
  
  // Get vibes for this product (partial match on product name)
  let vibeConfig = null;
  for (const [key, config] of Object.entries(PRODUCT_VIBES)) {
    if (productName.toLowerCase().includes(key.toLowerCase())) {
      vibeConfig = config;
      break;
    }
  }
  
  let targetVibes;
  if (vibeConfig) {
    targetVibes = vibeConfig.vibes;
  } else {
    // Use curated.json productVibeMapping or fallback to CATEGORY_VIBES
    const productVibeMapping = library.productVibeMapping || {};
    targetVibes = productVibeMapping[productCategory] || CATEGORY_VIBES[productCategory] || ["shocked", "reaction"];
  }
  
  // Get hooks
  const hookTemplates = vibeConfig?.hookTemplates || [
    "You need to see this",
    "This changed everything"
  ];
  
  // V3: Clips are in flat array with 'vibe' property
  const allClips = library.clips || [];
  
  // Get clips from preferred vibes, avoiding recently used
  const recentClipIds = state.usedClipIds?.slice(-10) || [];
  let candidateClips = [];
  
  for (const vibe of targetVibes) {
    // Filter clips matching this vibe
    const vibeClips = allClips.filter(c => c.vibe === vibe);
    const available = vibeClips.filter(c => !recentClipIds.includes(c.id));
    candidateClips.push(...available.map(c => ({ ...c, matchedVibe: vibe })));
  }
  
  // If all candidates are recently used, reset and include all matching vibes
  if (candidateClips.length === 0) {
    for (const vibe of targetVibes) {
      const vibeClips = allClips.filter(c => c.vibe === vibe);
      candidateClips.push(...vibeClips.map(c => ({ ...c, matchedVibe: vibe })));
    }
  }
  
  // Select a clip
  if (candidateClips.length === 0) {
    // Ultimate fallback - any clip from the library
    const clip = randomChoice(allClips);
    return {
      clip,
      vibe: clip?.vibe || 'shocked',
      hook: randomChoice(hookTemplates)
    };
  }
  
  const selectedClip = randomChoice(candidateClips);
  
  return {
    clip: selectedClip,
    vibe: selectedClip.matchedVibe,
    hook: randomChoice(hookTemplates)
  };
}

function scout(productId = null) {
  const products = loadProducts();
  const state = loadState();

  // Select product
  const product = selectProduct(products, state, productId);

  // Find clip
  const { clip, vibe, hook } = findClip(product, state);
  
  // Get local path (if cached)
  const localPath = getClipLocalPath(clip);

  // Update state
  state.lastProductId = product.id;
  state.lastCategory = product.category;
  if (!state.usedProductIds.includes(product.id)) {
    state.usedProductIds.push(product.id);
  }
  if (!state.usedClipIds) {
    state.usedClipIds = [];
  }
  if (!state.usedClipIds.includes(clip.id)) {
    state.usedClipIds.push(clip.id);
  }
  // Keep usedClipIds from growing too large
  if (state.usedClipIds.length > 50) {
    state.usedClipIds = state.usedClipIds.slice(-30);
  }
  state.categoryRotationIndex = (state.categoryRotationIndex + 1) % 3;
  state.lastRun = new Date().toISOString();
  saveState(state);

  // Build output (snake_case for JSON output as specified)
  // V3 UPGRADE: Uses description instead of name, vibe as hookStyle
  return {
    product_id: product.id,
    product_name: product.name,
    product_category: product.category,
    product_price: product.price,
    product_link: product.link,
    product_image: product.image,
    product_tagline: product.tagline,
    product_featured: product.featured || false,
    // Clip info (V3 curated clips)
    clip_id: clip.id,
    clip_name: clip.description || clip.name || clip.id,
    clip_url: clip.url,
    clip_local_path: localPath,
    clip_source: clip.source,
    clip_source_id: clip.sourceId,
    clip_vibe: vibe,
    clip_duration: clip.duration,
    clip_hook_style: vibe, // vibe IS the hook style in V3
    clip_description: clip.description,
    // Hook
    hook_angle: hook,
    // Legacy compatibility
    meme_url: clip.url,
    meme_source: clip.source,
    meme_vibe: vibe
  };
}

function listProducts(featuredOnly = false) {
  let products = loadProducts();
  if (featuredOnly) {
    products = products.filter(p => p.featured);
  }

  products.forEach(p => {
    const feat = p.featured ? '⭐' : '  ';
    console.log(`${feat} [${p.id.padStart(2)}] ${p.category.padEnd(8)} | ${p.name.padEnd(30)} | ${p.price}`);
  });
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--list') || args.includes('-l')) {
    listProducts(false);
    return;
  }

  if (args.includes('--featured') || args.includes('-f')) {
    listProducts(true);
    return;
  }
  
  if (args.includes('--cache-all')) {
    await cacheAllClips();
    return;
  }
  
  if (args.includes('--clip-stats')) {
    showClipStats();
    return;
  }

  let productId = null;
  const pidIdx = args.findIndex(a => a === '--product-id' || a === '-p');
  if (pidIdx !== -1 && args[pidIdx + 1]) {
    productId = parseInt(args[pidIdx + 1], 10);
  }

  const result = scout(productId);
  
  if (args.includes('--pretty')) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(JSON.stringify(result));
  }
}

// Export for module use
module.exports = { scout, listProducts, loadProducts, findClip, selectProduct, cacheAllClips, loadClipsLibrary };

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Scout error:', err.message);
    process.exit(1);
  });
}
