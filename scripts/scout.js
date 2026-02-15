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
const AFV_CLIPS_FILE = path.join(PROJECT_DIR, 'clips', 'processed-manifest.json');
const SHORTS_CLIPS_FILE = path.join(PROJECT_DIR, 'clips', 'shorts-manifest.json');
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
 * Transforms curated.json array format to the expected vibe-keyed format
 */
function loadClipsLibrary() {
  if (!fs.existsSync(CLIPS_FILE)) {
    console.error(`Clips library not found at ${CLIPS_FILE}`);
    process.exit(1);
  }
  const library = JSON.parse(fs.readFileSync(CLIPS_FILE, 'utf8'));
  
  // If clips is an array (new curated.json format), transform to vibe-keyed object
  if (Array.isArray(library.clips)) {
    const clipsByVibe = {};
    for (const clip of library.clips) {
      const vibe = clip.vibe;
      if (!clipsByVibe[vibe]) {
        clipsByVibe[vibe] = [];
      }
      clipsByVibe[vibe].push(clip);
    }
    library.clips = clipsByVibe;
  }
  
  return library;
}

/**
 * Load AFV (America's Funniest Videos) processed clips
 * These are pre-cropped 9:16 cliffhanger-cut clips ready for use
 */
function loadAFVClips() {
  if (!fs.existsSync(AFV_CLIPS_FILE)) {
    return null;
  }
  
  const manifest = JSON.parse(fs.readFileSync(AFV_CLIPS_FILE, 'utf8'));
  
  // Transform to vibe-keyed format
  const clipsByVibe = {};
  for (const clip of manifest.clips) {
    const vibe = clip.vibe;
    if (!clipsByVibe[vibe]) {
      clipsByVibe[vibe] = [];
    }
    // Add source info and ensure file path is absolute
    clipsByVibe[vibe].push({
      ...clip,
      source: 'afv',
      url: path.join(PROJECT_DIR, clip.file),
      localPath: path.join(PROJECT_DIR, clip.file),
      hookStyle: 'cliffhanger'
    });
  }
  
  return {
    clips: clipsByVibe,
    metadata: manifest.metadata
  };
}

// AFV vibe mapping - maps product vibes to AFV content vibes
const AFV_VIBE_MAPPING = {
  shocked: ['fail', 'unexpected', 'construction'],
  transformation: ['fail', 'outdoor'],
  reveal: ['unexpected', 'doorbell', 'indoor'],
  reaction: ['fail', 'kids', 'water'],
  cozy: ['kids', 'indoor'],
  twist: ['unexpected', 'ice-slip', 'fail']
};

/**
 * Load YouTube Shorts clips (pre-downloaded 9:16 vertical clips)
 * These are already in the correct format for reels
 */
function loadShortsClips() {
  if (!fs.existsSync(SHORTS_CLIPS_FILE)) {
    return null;
  }
  
  const manifest = JSON.parse(fs.readFileSync(SHORTS_CLIPS_FILE, 'utf8'));
  
  // Transform to vibe-keyed format
  const clipsByVibe = {};
  for (const clip of manifest.clips) {
    const vibe = clip.vibe;
    if (!clipsByVibe[vibe]) {
      clipsByVibe[vibe] = [];
    }
    // Add source info and ensure file path is absolute
    clipsByVibe[vibe].push({
      ...clip,
      source: 'youtube_shorts',
      url: path.join(PROJECT_DIR, clip.file),
      localPath: path.join(PROJECT_DIR, clip.file),
      hookStyle: 'viral',
      isVertical: true
    });
  }
  
  return {
    clips: clipsByVibe,
    total: manifest.total
  };
}

// Shorts vibe mapping - maps product vibes to shorts content vibes
const SHORTS_VIBE_MAPPING = {
  shocked: ['funny', 'fail'],
  transformation: ['funny'],
  reveal: ['funny'],
  reaction: ['funny', 'fail'],
  cozy: ['funny'],
  twist: ['funny', 'fail']
};

/**
 * Get local path for a clip (check cache or return null)
 * For manual caching, use: yt-dlp -o "clips/cache/%(id)s.mp4" URL
 */
function getClipLocalPath(clip) {
  // AFV clips are already local - they're pre-processed
  if (clip.source === 'afv' && clip.localPath) {
    if (fs.existsSync(clip.localPath)) {
      return clip.localPath;
    }
  }
  
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
  
  // Construct source page URL for yt-dlp
  let pageUrl;
  if (clip.source === 'mixkit') {
    pageUrl = `https://mixkit.co/free-stock-video/${clip.sourceId}/`;
  } else if (clip.source === 'pexels') {
    pageUrl = `https://www.pexels.com/video/${clip.sourceId}/`;
  } else {
    pageUrl = clip.url;
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
 */
async function cacheAllClips() {
  const library = loadClipsLibrary();
  const clips = library.clips;
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
    console.log('Visit each URL in clips.json and download manually to clips/cache/\n');
    
    // Print URLs for manual download
    for (const vibe of Object.keys(clips)) {
      console.log(`\n=== ${vibe.toUpperCase()} ===`);
      for (const clip of clips[vibe]) {
        const cacheFile = path.join(CLIPS_CACHE_DIR, `${clip.id}.mp4`);
        if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 10000) {
          console.log(`✓ ${clip.id} (cached)`);
        } else {
          let pageUrl;
          if (clip.source === 'mixkit') {
            pageUrl = `https://mixkit.co/free-stock-video/${clip.sourceId}/`;
          } else {
            pageUrl = clip.url;
          }
          console.log(`  ${clip.id}: ${pageUrl}`);
        }
      }
    }
    return;
  }
  
  for (const vibe of Object.keys(clips)) {
    for (const clip of clips[vibe]) {
      const cacheFile = path.join(CLIPS_CACHE_DIR, `${clip.id}.mp4`);
      
      if (fs.existsSync(cacheFile) && fs.statSync(cacheFile).size > 10000) {
        console.log(`✓ Already cached: ${clip.id}`);
        skipped++;
        continue;
      }
      
      console.log(`Downloading ${clip.id}: ${clip.name}...`);
      
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
  }
  
  console.log(`\nCache complete: ${downloaded} downloaded, ${skipped} already cached, ${failed} failed`);
}

/**
 * Show clip library statistics
 */
function showClipStats() {
  const library = loadClipsLibrary();
  const clips = library.clips;
  
  console.log('\n📊 Clip Library Stats\n');
  console.log(`Version: ${library._meta.version}`);
  console.log(`Updated: ${library._meta.updated}`);
  console.log('\nClips by vibe:');
  
  let total = 0;
  let cached = 0;
  
  for (const vibe of Object.keys(clips)) {
    const count = clips[vibe].length;
    total += count;
    
    const cachedCount = clips[vibe].filter(c => 
      fs.existsSync(path.join(CLIPS_CACHE_DIR, `${c.id}.mp4`))
    ).length;
    cached += cachedCount;
    
    console.log(`  ${vibe.padEnd(15)} ${count} clips (${cachedCount} cached)`);
  }
  
  console.log(`\nTotal: ${total} clips (${cached} cached locally)`);
  console.log(`\nSources used:`);
  for (const [source, desc] of Object.entries(library._meta.sources)) {
    console.log(`  ${source}: ${desc}`);
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
 * Prioritizes: AFV cliffhanger clips > YouTube Shorts (vertical) > curated clips
 */
function findClip(product, state) {
  const library = loadClipsLibrary();
  const afvLibrary = loadAFVClips();
  const shortsLibrary = loadShortsClips();
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
    // Fallback to category-based vibes
    targetVibes = CATEGORY_VIBES[productCategory] || ["shocked", "reveal"];
  }
  
  // Get hooks
  const hookTemplates = vibeConfig?.hookTemplates || [
    "You need to see this",
    "This changed everything"
  ];
  
  // Check for product-specific preferences in clips library
  const productSpecific = library.productSpecific?.[productName];
  if (productSpecific?.preferredVibes) {
    targetVibes = productSpecific.preferredVibes;
  }
  
  const recentClipIds = state.usedClipIds?.slice(-10) || [];
  let candidateClips = [];
  
  // PRIORITY 1: Try AFV clips first (cliffhanger style = max engagement)
  if (afvLibrary) {
    // Map product vibes to AFV vibes
    let afvVibes = [];
    for (const vibe of targetVibes) {
      const mapped = AFV_VIBE_MAPPING[vibe] || [vibe];
      afvVibes.push(...mapped);
    }
    afvVibes = [...new Set(afvVibes)]; // Deduplicate
    
    for (const vibe of afvVibes) {
      const vibeClips = afvLibrary.clips[vibe] || [];
      const available = vibeClips.filter(c => !recentClipIds.includes(c.id));
      candidateClips.push(...available.map(c => ({ ...c, matchedVibe: vibe, isAFV: true })));
    }
  }
  
  // PRIORITY 2: Fall back to curated clips if no AFV match
  if (candidateClips.length === 0) {
    for (const vibe of targetVibes) {
      const vibeClips = library.clips[vibe] || [];
      const available = vibeClips.filter(c => !recentClipIds.includes(c.id));
      candidateClips.push(...available.map(c => ({ ...c, matchedVibe: vibe })));
    }
  }
  
  // If all candidates are recently used, reset and include all AFV clips first
  if (candidateClips.length === 0 && afvLibrary) {
    const allAfvClips = Object.values(afvLibrary.clips).flat();
    candidateClips.push(...allAfvClips.map(c => ({ ...c, matchedVibe: c.vibe, isAFV: true })));
  }
  
  // Still empty? Fall back to all curated clips
  if (candidateClips.length === 0) {
    for (const vibe of targetVibes) {
      const vibeClips = library.clips[vibe] || [];
      candidateClips.push(...vibeClips.map(c => ({ ...c, matchedVibe: vibe })));
    }
  }
  
  // Select a clip
  if (candidateClips.length === 0) {
    // Ultimate fallback - any clip from curated library
    const allClips = Object.values(library.clips).flat();
    const clip = randomChoice(allClips);
    return {
      clip,
      vibe: Object.keys(library.clips).find(v => 
        library.clips[v].some(c => c.id === clip.id)
      ),
      hook: randomChoice(hookTemplates)
    };
  }
  
  const selectedClip = randomChoice(candidateClips);
  
  return {
    clip: selectedClip,
    vibe: selectedClip.matchedVibe,
    hook: randomChoice(hookTemplates),
    isAFV: selectedClip.isAFV || false
  };
}

function scout(productId = null) {
  const products = loadProducts();
  const state = loadState();

  // Select product
  const product = selectProduct(products, state, productId);

  // Find clip
  const { clip, vibe, hook, isAFV } = findClip(product, state);
  
  // Get local path (if cached or AFV)
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
  return {
    product_id: product.id,
    product_name: product.name,
    product_category: product.category,
    product_price: product.price,
    product_link: product.link,
    product_image: product.image,
    product_tagline: product.tagline,
    product_featured: product.featured || false,
    // Clip info (V2 upgrade)
    clip_id: clip.id,
    clip_name: clip.name || clip.description,
    clip_url: clip.url,
    clip_local_path: localPath,
    clip_source: clip.source,
    clip_vibe: vibe,
    clip_duration: clip.duration,
    clip_hook_style: clip.hookStyle || (isAFV ? 'cliffhanger' : 'reaction'),
    clip_is_afv: isAFV || false,
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
