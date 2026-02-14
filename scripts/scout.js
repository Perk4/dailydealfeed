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
const https = require('https');
const http = require('http');

// Paths
const SCRIPT_DIR = __dirname;
const PROJECT_DIR = path.join(SCRIPT_DIR, '..');
const PRODUCTS_FILE = path.join(PROJECT_DIR, 'products.json');
const STATE_FILE = path.join(SCRIPT_DIR, 'scout_state.json');
const CLIPS_FILE = path.join(PROJECT_DIR, 'clips', 'clips.json');
const CLIPS_CACHE_DIR = path.join(PROJECT_DIR, 'clips', 'cache');

// Ensure cache directory exists
if (!fs.existsSync(CLIPS_CACHE_DIR)) {
  fs.mkdirSync(CLIPS_CACHE_DIR, { recursive: true });
}

// Product vibe mappings based on taglines and categories
const PRODUCT_VIBES = {
  "LED Moon Night Light": {
    vibes: ["cozy", "transformation"],
    hookTemplates: [
      "POV: Your room transformation at 3am",
      "When the vibes finally hit different",
    ]
  },
  "Mini Bluetooth Pocket Printer": {
    vibes: ["shocked", "reaction"],
    hookTemplates: [
      "Wait this actually works?!",
      "The gadget that changed my photo game",
    ]
  },
  "Multi-Device Charging Stand": {
    vibes: ["reveal", "reaction"],
    hookTemplates: [
      "Finally found the nightstand solution",
      "Cord chaos? Never heard of it",
    ]
  },
  "Light Therapy Lamp": {
    vibes: ["transformation", "reaction"],
    hookTemplates: [
      "My seasonal depression hack nobody talks about",
      "The $50 that saved my winter",
    ]
  },
  "Self-Stirring Mug": {
    vibes: ["twist", "cozy"],
    hookTemplates: [
      "For my fellow lazy people who get it",
      "When you're too tired to stir your coffee",
    ]
  },
  "The Pink Stuff": {
    vibes: ["transformation", "shocked", "reveal"],
    hookTemplates: [
      "This $10 paste vs my disgusting stove",
      "The before/after that broke me",
    ]
  },
  "Bissell Little Green": {
    vibes: ["shocked", "transformation", "reveal"],
    hookTemplates: [
      "What came out of my couch... I'm disturbed",
      "Don't watch this while eating (but you will)",
    ]
  },
  "Cloud Key Holder": {
    vibes: ["cozy", "twist"],
    hookTemplates: [
      "The cutest solution to my lost keys problem",
      "This little cloud fixed my life",
    ]
  },
  "Ribbed Glass Cups": {
    vibes: ["reveal", "transformation"],
    hookTemplates: [
      "How I made my kitchen look expensive for $25",
      "The aesthetic glow-up nobody asked for",
    ]
  },
  "Dash Mini Waffle Maker": {
    vibes: ["cozy", "reaction"],
    hookTemplates: [
      "The TikTok waffle maker - is it actually worth it?",
      "Mini waffles that changed my mornings",
    ]
  },
  "Starface Pimple Patches": {
    vibes: ["twist", "reaction"],
    hookTemplates: [
      "Making acne kinda cute somehow?",
      "The patch that made me stop caring about breakouts",
    ]
  },
  "Ice Roller for Face": {
    vibes: ["transformation", "reaction"],
    hookTemplates: [
      "My face at 7am vs after this thing",
      "The $12 morning routine game changer",
    ]
  },
  "Foot Peel Mask": {
    vibes: ["shocked", "transformation"],
    hookTemplates: [
      "Warning: this is disturbing (but satisfying)",
      "DO NOT watch this while eating",
    ]
  },
  "Cloud Slides": {
    vibes: ["cozy", "reaction"],
    hookTemplates: [
      "I refused to believe the hype... until now",
      "Why everyone and their mom has these",
    ]
  },
  "Loop Earplugs": {
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
 * Download a clip to local cache
 */
function downloadClip(clip) {
  return new Promise((resolve, reject) => {
    const cacheFile = path.join(CLIPS_CACHE_DIR, `${clip.id}.mp4`);
    
    // Check if already cached and valid (> 10KB)
    if (fs.existsSync(cacheFile)) {
      const stats = fs.statSync(cacheFile);
      if (stats.size > 10000) {
        resolve(cacheFile);
        return;
      }
      // Invalid cache, remove it
      fs.unlinkSync(cacheFile);
    }

    const url = clip.url;
    const parsedUrl = new URL(url);
    const protocol = url.startsWith('https') ? https : http;
    
    console.log(`Downloading ${clip.id}: ${clip.name}...`);
    
    const options = {
      hostname: parsedUrl.hostname,
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'video/mp4,video/*;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Referer': 'https://mixkit.co/',
      }
    };
    
    const file = fs.createWriteStream(cacheFile);
    
    const handleResponse = (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302 || response.statusCode === 307) {
        const redirectUrl = response.headers.location;
        const fullUrl = redirectUrl.startsWith('http') ? redirectUrl : `https://${parsedUrl.hostname}${redirectUrl}`;
        const redirectParsed = new URL(fullUrl);
        const redirectProtocol = fullUrl.startsWith('https') ? https : http;
        
        const redirectOptions = {
          hostname: redirectParsed.hostname,
          path: redirectParsed.pathname + redirectParsed.search,
          method: 'GET',
          headers: options.headers
        };
        
        redirectProtocol.get(redirectOptions, handleResponse).on('error', (err) => {
          fs.unlink(cacheFile, () => {});
          reject(err);
        });
        return;
      }
      
      if (response.statusCode !== 200) {
        fs.unlink(cacheFile, () => {});
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        // Verify file size
        const stats = fs.statSync(cacheFile);
        if (stats.size < 10000) {
          fs.unlink(cacheFile, () => {});
          reject(new Error('Downloaded file too small, likely error page'));
          return;
        }
        resolve(cacheFile);
      });
    };
    
    const request = protocol.get(options, handleResponse);
    
    request.on('error', (err) => {
      fs.unlink(cacheFile, () => {});
      reject(err);
    });
    
    request.setTimeout(60000, () => {
      request.destroy();
      fs.unlink(cacheFile, () => {});
      reject(new Error('Download timeout'));
    });
  });
}

/**
 * Get local path for a clip (download if needed)
 */
async function getClipLocalPath(clip) {
  const cacheFile = path.join(CLIPS_CACHE_DIR, `${clip.id}.mp4`);
  
  if (fs.existsSync(cacheFile)) {
    return cacheFile;
  }
  
  try {
    return await downloadClip(clip);
  } catch (err) {
    console.warn(`Failed to download ${clip.id}: ${err.message}`);
    return null;
  }
}

/**
 * Pre-cache all clips
 */
async function cacheAllClips() {
  const library = loadClipsLibrary();
  const clips = library.clips;
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  
  for (const vibe of Object.keys(clips)) {
    for (const clip of clips[vibe]) {
      const cacheFile = path.join(CLIPS_CACHE_DIR, `${clip.id}.mp4`);
      
      if (fs.existsSync(cacheFile)) {
        console.log(`✓ Already cached: ${clip.id}`);
        skipped++;
        continue;
      }
      
      try {
        await downloadClip(clip);
        console.log(`✓ Downloaded: ${clip.id}`);
        downloaded++;
      } catch (err) {
        console.log(`✗ Failed: ${clip.id} - ${err.message}`);
        failed++;
      }
      
      // Small delay between downloads to be respectful
      await new Promise(r => setTimeout(r, 500));
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
 */
function findClip(product, state) {
  const library = loadClipsLibrary();
  const productName = product.name;
  const productCategory = product.category;
  
  // Get vibes for this product
  const vibeConfig = PRODUCT_VIBES[productName] || null;
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
  
  // Get clips from preferred vibes, avoiding recently used
  const recentClipIds = state.usedClipIds?.slice(-10) || [];
  let candidateClips = [];
  
  for (const vibe of targetVibes) {
    const vibeClips = library.clips[vibe] || [];
    const available = vibeClips.filter(c => !recentClipIds.includes(c.id));
    candidateClips.push(...available.map(c => ({ ...c, matchedVibe: vibe })));
  }
  
  // If all candidates are recently used, reset and include all
  if (candidateClips.length === 0) {
    for (const vibe of targetVibes) {
      const vibeClips = library.clips[vibe] || [];
      candidateClips.push(...vibeClips.map(c => ({ ...c, matchedVibe: vibe })));
    }
  }
  
  // Select a clip
  if (candidateClips.length === 0) {
    // Ultimate fallback - any clip
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
    hook: randomChoice(hookTemplates)
  };
}

async function scout(productId = null) {
  const products = loadProducts();
  const state = loadState();

  // Select product
  const product = selectProduct(products, state, productId);

  // Find clip
  const { clip, vibe, hook } = findClip(product, state);
  
  // Get local path (download if needed)
  const localPath = await getClipLocalPath(clip);

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
    clip_name: clip.name,
    clip_url: clip.url,
    clip_local_path: localPath,
    clip_source: clip.source,
    clip_vibe: vibe,
    clip_duration: clip.duration,
    clip_hook_style: clip.hookStyle,
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

  const result = await scout(productId);
  
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
