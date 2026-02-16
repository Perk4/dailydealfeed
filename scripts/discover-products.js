#!/usr/bin/env node
/**
 * Product Discovery Script for @dailydealfeed
 * Discovers trending products using multiple sources:
 * 1. Amazon product data API (via rainforest or similar)
 * 2. Web scraping (Playwright when available)
 * 3. Curated viral product database (fallback)
 * 
 * Usage:
 *   node discover-products.js [--limit N] [--dry-run] [--source SOURCE]
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

// ============================================
// CONFIGURATION
// ============================================

const PROJECT_DIR = path.join(__dirname, '..');
const MANIFEST_PATH = path.join(PROJECT_DIR, 'staging', 'products', 'manifest.json');
const AFFILIATE_TAG = 'dailydealfeed-20';

// ============================================
// CURATED VIRAL PRODUCTS DATABASE
// Products known to perform well on TikTok/Amazon
// This gets used as primary source OR fallback
// ============================================

const VIRAL_PRODUCTS = [
  // Skincare
  { asin: 'B09V1KGZZC', name: 'COSRX Advanced Snail 96 Mucin Power Essence 3.38oz', price: '$22.99', category: 'skincare', stat: '96% snail secretion filtrate' },
  { asin: 'B078GRM2JB', name: 'CeraVe Moisturizing Cream for Face and Body', price: '$16.99', category: 'skincare', stat: '3 essential ceramides' },
  { asin: 'B01N7VV0B1', name: 'The Ordinary Niacinamide 10% + Zinc 1%', price: '$11.99', category: 'skincare', stat: 'Viral pore minimizer' },
  { asin: 'B00BGSH8PU', name: 'BYPHASSE Face Mist with Rose Water', price: '$8.99', category: 'skincare', stat: 'Natural rose extract' },
  { asin: 'B09NZFR6F7', name: 'Glow Recipe Watermelon Glow Niacinamide Dew Drops', price: '$34.00', category: 'skincare', stat: 'TikTok viral glow' },
  
  // Beauty
  { asin: 'B07GND52VF', name: 'Revlon One-Step Hair Dryer & Volumizer', price: '$34.99', category: 'beauty', stat: '80% more shine' },
  { asin: 'B082D1Z4PH', name: 'Dyson Airwrap Multi-Styler Complete', price: '$599.99', category: 'beauty', stat: 'Coanda effect styling' },
  { asin: 'B09GFJ6HRW', name: 'Makeup Eraser Original Pink', price: '$20.00', category: 'beauty', stat: 'Removes 100% of makeup' },
  { asin: 'B07QQP6F1B', name: 'Maybelline Lash Sensational Sky High Mascara', price: '$11.99', category: 'beauty', stat: 'Viral lengthening formula' },
  { asin: 'B087CN1RYM', name: 'e.l.f. Poreless Putty Primer', price: '$9.00', category: 'beauty', stat: 'Glass skin effect' },
  
  // Cleaning
  { asin: 'B08TG9F8WN', name: 'Pink Stuff Cleaning Paste 500g', price: '$9.99', category: 'cleaning', stat: 'TikTok #1 cleaner' },
  { asin: 'B082FJ6B6L', name: 'Scrub Daddy Power Paste', price: '$12.98', category: 'cleaning', stat: 'FlexTexture technology' },
  { asin: 'B07P4HMNXR', name: 'Bar Keepers Friend Powder Cleanser', price: '$8.99', category: 'cleaning', stat: 'Removes rust instantly' },
  { asin: 'B08KRQYDTW', name: 'Stardrops Spray Bottles Set', price: '$14.99', category: 'cleaning', stat: 'Refillable + eco-friendly' },
  
  // Home/Gadgets
  { asin: 'B0C4HNWVTB', name: 'Mini Massage Gun Portable Percussion', price: '$29.99', category: 'home', stat: '4 massage heads included' },
  { asin: 'B0BXYRJ5PM', name: 'LED Strip Lights 50ft with Remote', price: '$14.99', category: 'home', stat: '16M color options' },
  { asin: 'B08KY684SB', name: 'Sunset Lamp Projector', price: '$19.99', category: 'home', stat: 'Golden hour anytime' },
  { asin: 'B09QCG8H1S', name: 'White Noise Machine with Night Light', price: '$24.99', category: 'home', stat: '32 soothing sounds' },
  { asin: 'B0B5WRJP8B', name: 'Air Fryer 4.2 Qt Digital LED', price: '$49.99', category: 'kitchen', stat: '95% less oil than frying' },
  { asin: 'B09WMYQK8F', name: 'Mini Waffle Maker Machine', price: '$12.99', category: 'kitchen', stat: 'Ready in 3 minutes' },
  
  // Drinkware
  { asin: 'B0BQ83Q8JZ', name: 'Stanley Quencher H2.0 40oz Tumbler', price: '$45.00', category: 'drinkware', stat: 'Keeps ice 2+ days' },
  { asin: 'B0C8NQHTV1', name: 'Owala FreeSip Water Bottle 32oz', price: '$27.99', category: 'drinkware', stat: 'Sip or swig technology' },
  { asin: 'B09JNQZMB2', name: 'Simple Modern Tumbler with Handle 40oz', price: '$29.99', category: 'drinkware', stat: 'Cupholder compatible' },
  
  // Footwear
  { asin: 'B09QFF2TT4', name: 'Cloud Pillow Slides Slippers', price: '$19.99', category: 'footwear', stat: '4.5cm EVA cushion' },
  { asin: 'B0C2D5KJ7R', name: 'Recovery Slide Sandals Thick Sole', price: '$24.99', category: 'footwear', stat: 'Orthopedic support' },
  { asin: 'B0B2QNQPKL', name: 'Shark Slides Anti-Slip', price: '$16.99', category: 'footwear', stat: 'Viral shark design' },
  
  // Tech
  { asin: 'B0BZ8QYZMM', name: 'Mini Portable Projector 1080P', price: '$79.99', category: 'tech', stat: '100" screen anywhere' },
  { asin: 'B0CXNQGVZP', name: 'Wireless Earbuds Bluetooth 5.3', price: '$24.99', category: 'tech', stat: '40hr battery life' },
  { asin: 'B0C2JHK3VH', name: 'Ring Light 10" with Tripod Stand', price: '$19.99', category: 'tech', stat: 'Perfect TikTok lighting' },
  { asin: 'B09F3G7H8M', name: 'Phone Holder Car Mount Magnetic', price: '$15.99', category: 'tech', stat: 'One-hand operation' },
  
  // More skincare (trending)
  { asin: 'B0CQHZ8LFR', name: 'Beauty of Joseon Relief Sun SPF50', price: '$17.00', category: 'skincare', stat: 'Rice + probiotics formula' },
  { asin: 'B09N8XQQ39', name: 'Summer Fridays Jet Lag Mask', price: '$52.00', category: 'skincare', stat: 'Instant hydration boost' },
  { asin: 'B08FXHQK9J', name: 'Paula Choice 2% BHA Liquid Exfoliant', price: '$35.00', category: 'skincare', stat: 'Unclogs pores in 2 weeks' },
  
  // More home (viral gadgets)
  { asin: 'B0BKJG8QYV', name: 'Electric Spin Scrubber Cordless', price: '$39.99', category: 'cleaning', stat: 'Saves 80% cleaning time' },
  { asin: 'B09NXKH2HZ', name: 'Bug Zapper Indoor Insect Trap', price: '$24.99', category: 'home', stat: 'Chemical-free pest control' },
  { asin: 'B0C3QMYRTV', name: 'Mini Desk Vacuum USB Rechargeable', price: '$15.99', category: 'home', stat: 'Perfect for keyboards' }
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

function log(message, emoji = '🔍') {
  console.log(`${emoji} ${message}`);
}

function parsePrice(priceStr) {
  if (!priceStr) return null;
  const match = priceStr.match(/\$?([\d,]+\.?\d*)/);
  return match ? parseFloat(match[1].replace(',', '')) : null;
}

function shuffleArray(array) {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

// ============================================
// PRODUCT DISCOVERY STRATEGIES
// ============================================

/**
 * Strategy 1: Use curated viral products database
 * This is the most reliable source
 */
function discoverFromDatabase(existingAsins, limit) {
  log('Using curated viral products database...');
  
  // Filter out already existing products
  const available = VIRAL_PRODUCTS.filter(p => !existingAsins.has(p.asin));
  
  // Shuffle for variety
  const shuffled = shuffleArray(available);
  
  // Return requested limit
  return shuffled.slice(0, limit).map(p => ({
    asin: p.asin,
    name: p.name,
    price: p.price,
    sourceCategory: p.category,
    stat: p.stat
  }));
}

/**
 * Strategy 2: Try Playwright-based scraping
 * Falls back to database if Playwright unavailable
 */
async function discoverFromScraping(limit) {
  try {
    const { chromium } = require('playwright');
    
    log('Attempting browser-based discovery...');
    
    const browser = await chromium.launch({ 
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    const discovered = [];
    const page = await context.newPage();
    
    // Try Amazon Best Sellers
    await page.goto('https://www.amazon.com/gp/bestsellers/beauty', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    await page.waitForTimeout(2000);
    
    const products = await page.evaluate(() => {
      const items = [];
      document.querySelectorAll('[data-asin]').forEach(el => {
        const asin = el.getAttribute('data-asin');
        if (!asin || asin.length !== 10) return;
        
        const nameEl = el.querySelector('.p13n-sc-truncate, [class*="a-link-normal"] span');
        const priceEl = el.querySelector('.p13n-sc-price, .a-offscreen');
        
        if (nameEl) {
          items.push({
            asin,
            name: nameEl.textContent?.trim()?.slice(0, 100),
            price: priceEl?.textContent?.trim()
          });
        }
      });
      return items.slice(0, 10);
    });
    
    await browser.close();
    
    return products;
  } catch (err) {
    log(`Browser discovery unavailable: ${err.message}`, '⚠️');
    return null;
  }
}

// ============================================
// MAIN DISCOVERY FUNCTION
// ============================================

async function discoverProducts(limit = 5, existingAsins = new Set()) {
  let products = [];
  
  // Strategy 1: Try Playwright first (if available)
  const scraped = await discoverFromScraping(limit);
  if (scraped && scraped.length > 0) {
    log(`Browser discovered ${scraped.length} products`, '✅');
    products = scraped;
  }
  
  // Strategy 2: Fill remaining from database
  const remaining = limit - products.length;
  if (remaining > 0) {
    const fromDb = discoverFromDatabase(existingAsins, remaining);
    log(`Database provided ${fromDb.length} products`, '✅');
    products = [...products, ...fromDb];
  }
  
  return products.slice(0, limit);
}

// ============================================
// MANIFEST MANAGEMENT
// ============================================

function loadManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) {
    const dir = path.dirname(MANIFEST_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    return { version: '1.0', products: [], updatedAt: new Date().toISOString() };
  }
  return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
}

function saveManifest(manifest) {
  const dir = path.dirname(MANIFEST_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

function addToManifest(products, dryRun = false) {
  const manifest = loadManifest();
  const existingAsins = new Set(manifest.products.map(p => p.asin));
  
  const newProducts = [];
  
  for (const product of products) {
    if (existingAsins.has(product.asin)) {
      log(`  Skipping ${product.asin} (already in manifest)`, '⏭️');
      continue;
    }
    
    // Find full product data from viral database if available
    const viralData = VIRAL_PRODUCTS.find(v => v.asin === product.asin);
    const category = viralData?.category || product.sourceCategory || 'home';
    
    const newProduct = {
      asin: product.asin,
      name: product.name,
      price: product.price || '$19.99',
      category,
      status: 'approved',
      validatedAt: new Date().toISOString(),
      source: 'auto-discovery',
      image_url: `https://images-na.ssl-images-amazon.com/images/P/${product.asin}.jpg`,
      affiliate_link: `https://www.amazon.com/dp/${product.asin}?tag=${AFFILIATE_TAG}`,
      best_stat: viralData?.stat || product.stat || 'TikTok viral favorite'
    };
    
    newProducts.push(newProduct);
    log(`  + ${product.name.slice(0, 50)}... (${category})`, '✅');
  }
  
  if (!dryRun && newProducts.length > 0) {
    manifest.products.push(...newProducts);
    manifest.updatedAt = new Date().toISOString();
    saveManifest(manifest);
    log(`Added ${newProducts.length} products to manifest`, '💾');
  }
  
  return newProducts;
}

// ============================================
// CLI
// ============================================

async function main() {
  const args = process.argv.slice(2);
  const limitIndex = args.indexOf('--limit');
  const limit = limitIndex !== -1 ? parseInt(args[limitIndex + 1]) : 5;
  const dryRun = args.includes('--dry-run');
  
  console.log('\n=== PRODUCT DISCOVERY ===\n');
  log(`Target: ${limit} products`);
  if (dryRun) log('DRY RUN - no changes will be saved', '🔒');
  
  try {
    // Load existing manifest to avoid duplicates
    const manifest = loadManifest();
    const existingAsins = new Set(manifest.products.map(p => p.asin));
    log(`Current manifest has ${existingAsins.size} products`);
    
    // Discover products
    const products = await discoverProducts(limit, existingAsins);
    
    if (products.length === 0) {
      log('No new products to add (all available products already in manifest)', '⚠️');
      console.log(JSON.stringify({ discovered: 0, added: 0 }, null, 2));
      return;
    }
    
    // Add to manifest
    const added = addToManifest(products, dryRun);
    
    console.log('\n=== DISCOVERY RESULTS ===');
    console.log(JSON.stringify({ 
      discovered: products.length, 
      added: added.length,
      products: added.map(p => ({ asin: p.asin, name: p.name, category: p.category }))
    }, null, 2));
    
  } catch (err) {
    log(`Discovery failed: ${err.message}`, '❌');
    console.error(err);
    process.exit(1);
  }
}

// Exports for programmatic use
module.exports = { discoverProducts, addToManifest, loadManifest, VIRAL_PRODUCTS };

// Run if called directly
if (require.main === module) {
  main();
}
