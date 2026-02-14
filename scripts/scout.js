#!/usr/bin/env node
/**
 * Scout Agent - Product Selection & Meme Hunting Module
 * For DailyDealFeed Reels Pipeline
 *
 * Usage:
 *   node scout.js                    # Select next product + find meme
 *   node scout.js --product-id 5     # Scout for specific product
 *   node scout.js --list             # List all products
 *   node scout.js --featured         # Show featured products only
 */

const fs = require('fs');
const path = require('path');

// Paths
const SCRIPT_DIR = __dirname;
const PRODUCTS_FILE = path.join(SCRIPT_DIR, '..', 'products.json');
const STATE_FILE = path.join(SCRIPT_DIR, 'scout_state.json');

// Meme/GIF mappings by vibe category
// Curated, reliable Giphy GIFs for different product vibes
const MEME_LIBRARY = {
  shocked: [
    { url: "https://media.giphy.com/media/oYtVHSxngR3lC/giphy.gif", source: "giphy", desc: "surprised pikachu style" },
    { url: "https://media.giphy.com/media/5VKbvrjxpVJCM/giphy.gif", source: "giphy", desc: "jaw drop reaction" },
    { url: "https://media.giphy.com/media/dAVLtOPb0JeIE/giphy.gif", source: "giphy", desc: "community shocked" },
  ],
  satisfied: [
    { url: "https://media.giphy.com/media/3o7TKF1fSIs1R19B8k/giphy.gif", source: "giphy", desc: "chef kiss" },
    { url: "https://media.giphy.com/media/l0MYGb1LuZ3n7dRnO/giphy.gif", source: "giphy", desc: "perfection" },
    { url: "https://media.giphy.com/media/3ohzdIuqJoo8QdKlnW/giphy.gif", source: "giphy", desc: "oprah approval" },
  ],
  lazy: [
    { url: "https://media.giphy.com/media/JIX9t2j0ZTN9S/giphy.gif", source: "giphy", desc: "cat lazy" },
    { url: "https://media.giphy.com/media/13e1UmAEwdj7vG/giphy.gif", source: "giphy", desc: "sloth slow" },
    { url: "https://media.giphy.com/media/xT9DPJVjlYHwWsZRxm/giphy.gif", source: "giphy", desc: "minimal effort win" },
  ],
  transformation: [
    { url: "https://media.giphy.com/media/xUPGcl3ijl0vBvMJO0/giphy.gif", source: "giphy", desc: "before after" },
    { url: "https://media.giphy.com/media/l46CyJmS9KUbokzsI/giphy.gif", source: "giphy", desc: "glow up" },
    { url: "https://media.giphy.com/media/3oKIPf1BaBDILVxbYA/giphy.gif", source: "giphy", desc: "magic transformation" },
  ],
  gross: [
    { url: "https://media.giphy.com/media/DsdVe5jhHWNC8/giphy.gif", source: "giphy", desc: "ew but can't look away" },
    { url: "https://media.giphy.com/media/l0HlvtIPzPdt2usKs/giphy.gif", source: "giphy", desc: "disturbed interest" },
    { url: "https://media.giphy.com/media/4baoNZ5Qo8dX2/giphy.gif", source: "giphy", desc: "horrified fascination" },
  ],
  cozy: [
    { url: "https://media.giphy.com/media/xUOwGmG2pRfFZUmdVe/giphy.gif", source: "giphy", desc: "comfy vibes" },
    { url: "https://media.giphy.com/media/U4DswrBiaz0p67ZweH/giphy.gif", source: "giphy", desc: "relaxed happiness" },
    { url: "https://media.giphy.com/media/3oEjI5VtIhHvK37WYo/giphy.gif", source: "giphy", desc: "pure comfort" },
  ],
  hack: [
    { url: "https://media.giphy.com/media/3o7btPCcdNniyf0ArS/giphy.gif", source: "giphy", desc: "mind blown" },
    { url: "https://media.giphy.com/media/xT0xeJpnrWC4XWblEk/giphy.gif", source: "giphy", desc: "why didn't I think of this" },
    { url: "https://media.giphy.com/media/26ufdipQqU2lhNA4g/giphy.gif", source: "giphy", desc: "galaxy brain" },
  ],
  cute: [
    { url: "https://media.giphy.com/media/3oEjHV0z8S7WM4MwnK/giphy.gif", source: "giphy", desc: "adorable moment" },
    { url: "https://media.giphy.com/media/l1ughbsd9qXz2s9SE/giphy.gif", source: "giphy", desc: "heart eyes" },
    { url: "https://media.giphy.com/media/3oz8xIsloV7zOmt81G/giphy.gif", source: "giphy", desc: "so precious" },
  ],
};

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
    vibes: ["shocked", "hack"],
    hookTemplates: [
      "Wait this actually works?!",
      "The gadget that changed my photo game",
    ]
  },
  "Multi-Device Charging Stand": {
    vibes: ["satisfied", "hack"],
    hookTemplates: [
      "Finally found the nightstand solution",
      "Cord chaos? Never heard of it",
    ]
  },
  "Light Therapy Lamp": {
    vibes: ["transformation", "hack"],
    hookTemplates: [
      "My seasonal depression hack nobody talks about",
      "The $50 that saved my winter",
    ]
  },
  "Self-Stirring Mug": {
    vibes: ["lazy", "hack"],
    hookTemplates: [
      "For my fellow lazy people who get it",
      "When you're too tired to stir your coffee",
    ]
  },
  "The Pink Stuff": {
    vibes: ["transformation", "gross", "shocked"],
    hookTemplates: [
      "This $10 paste vs my disgusting stove",
      "The before/after that broke me",
    ]
  },
  "Bissell Little Green": {
    vibes: ["gross", "transformation", "shocked"],
    hookTemplates: [
      "What came out of my couch... I'm disturbed",
      "Don't watch this while eating (but you will)",
    ]
  },
  "Cloud Key Holder": {
    vibes: ["cute", "cozy"],
    hookTemplates: [
      "The cutest solution to my lost keys problem",
      "This little cloud fixed my life",
    ]
  },
  "Ribbed Glass Cups": {
    vibes: ["satisfied", "transformation"],
    hookTemplates: [
      "How I made my kitchen look expensive for $25",
      "The aesthetic glow-up nobody asked for",
    ]
  },
  "Dash Mini Waffle Maker": {
    vibes: ["satisfied", "cute"],
    hookTemplates: [
      "The TikTok waffle maker - is it actually worth it?",
      "Mini waffles that changed my mornings",
    ]
  },
  "Starface Pimple Patches": {
    vibes: ["cute", "hack"],
    hookTemplates: [
      "Making acne kinda cute somehow?",
      "The patch that made me stop caring about breakouts",
    ]
  },
  "Ice Roller for Face": {
    vibes: ["transformation", "hack"],
    hookTemplates: [
      "My face at 7am vs after this thing",
      "The $12 morning routine game changer",
    ]
  },
  "Foot Peel Mask": {
    vibes: ["gross", "shocked"],
    hookTemplates: [
      "Warning: this is disturbing (but satisfying)",
      "DO NOT watch this while eating",
    ]
  },
  "Cloud Slides": {
    vibes: ["cozy", "satisfied"],
    hookTemplates: [
      "I refused to believe the hype... until now",
      "Why everyone and their mom has these",
    ]
  },
  "Loop Earplugs": {
    vibes: ["hack", "satisfied"],
    hookTemplates: [
      "How I protect my hearing without missing the music",
      "The earplug that doesn't make you look weird",
    ]
  },
};

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

function findMeme(product) {
  const productName = product.name;

  // Get product vibe config
  const vibeConfig = PRODUCT_VIBES[productName] || {
    vibes: ["shocked", "satisfied"],
    hookTemplates: ["You need to see this", "This changed everything"]
  };

  // Select primary vibe
  const primaryVibe = vibeConfig.vibes[0];

  // Get meme options for this vibe
  const memeOptions = MEME_LIBRARY[primaryVibe] || MEME_LIBRARY.shocked;

  // Select a meme
  const meme = randomChoice(memeOptions);

  // Select a hook angle
  const hook = randomChoice(vibeConfig.hookTemplates);

  return {
    memeUrl: meme.url,
    memeSource: meme.source,
    memeDesc: meme.desc,
    vibe: primaryVibe,
    hookAngle: hook
  };
}

function scout(productId = null) {
  const products = loadProducts();
  const state = loadState();

  // Select product
  const product = selectProduct(products, state, productId);

  // Find meme
  const memeData = findMeme(product);

  // Update state
  state.lastProductId = product.id;
  state.lastCategory = product.category;
  if (!state.usedProductIds.includes(product.id)) {
    state.usedProductIds.push(product.id);
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
    meme_url: memeData.memeUrl,
    meme_source: memeData.memeSource,
    meme_vibe: memeData.vibe,
    hook_angle: memeData.hookAngle
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
function main() {
  const args = process.argv.slice(2);
  
  if (args.includes('--list') || args.includes('-l')) {
    listProducts(false);
    return;
  }

  if (args.includes('--featured') || args.includes('-f')) {
    listProducts(true);
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
module.exports = { scout, listProducts, loadProducts, findMeme, selectProduct };

// Run if called directly
if (require.main === module) {
  main();
}
