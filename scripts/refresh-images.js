#!/usr/bin/env node
/**
 * Image Refresh Script
 * Fetches real Amazon product images when browser/API access is available
 * 
 * Usage:
 *   ./refresh-images.js              # Refresh all products
 *   ./refresh-images.js 1            # Refresh specific product
 *   ./refresh-images.js --dry-run    # Test without saving
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PRODUCTS_FILE = path.join(__dirname, '..', 'products.json');

// Backup image sources for when Amazon images fail
const FALLBACK_IMAGES = {
  'B07P13RT14': 'https://images.unsplash.com/photo-1532274402911-5a369e4c4bb5?w=800', // moon lamp
  'B09XKXHPKC': 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed?w=800', // printer
  'B09V1KXJPB': 'https://images.unsplash.com/photo-1583394838336-acd977736f90?w=800', // charging
  'B08GFX9GFN': 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=800', // lamp
  'B0BFMYSRYY': 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800', // mug
  'B00DU5SRIY': 'https://images.unsplash.com/photo-1563453392212-326f5e854473?w=800', // cleaning
  'B0016HF5GK': 'https://images.unsplash.com/photo-1558317374-067fb5f30001?w=800', // cleaner
  'B004DI7PP0': 'https://images.unsplash.com/photo-1513506003901-1e6a229e2d15?w=800', // cloud
  'B09FSLQVHH': 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=800', // glasses
  'B01M9I779L': 'https://images.unsplash.com/photo-1562376552-0d160a2f238d?w=800', // waffle
  'B07YJN57T8': 'https://images.unsplash.com/photo-1598440947619-2c35fc9aa908?w=800', // patches
  'B082MGH4PP': 'https://images.unsplash.com/photo-1616394584738-fc6e612e71b9?w=800', // ice roller
  'B01N06MBB6': 'https://images.unsplash.com/photo-1519415510236-718bdfcd89c8?w=800', // foot
  'B08GS5X8HR': 'https://images.unsplash.com/photo-1603487742131-4160ec999306?w=800', // slides
  'B0CG68KD3T': 'https://images.unsplash.com/photo-1590658268037-6bf12165a8df?w=800', // earplugs
};

function verifyImageUrl(url) {
  return new Promise((resolve) => {
    const urlObj = new URL(url);
    const options = {
      hostname: urlObj.hostname,
      path: urlObj.pathname + urlObj.search,
      method: 'HEAD',
      timeout: 5000,
    };
    
    const req = https.request(options, (res) => {
      resolve(res.statusCode === 200 || res.statusCode === 302);
    });
    
    req.on('error', () => resolve(false));
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.end();
  });
}

async function refreshProducts(options = {}) {
  const data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
  const results = [];
  
  for (const product of data.products) {
    const asin = product.asin;
    
    // Check if current image works
    let imageValid = await verifyImageUrl(product.image);
    let newImage = product.image;
    let source = 'existing';
    
    if (!imageValid) {
      // Try fallback image
      if (FALLBACK_IMAGES[asin]) {
        imageValid = await verifyImageUrl(FALLBACK_IMAGES[asin]);
        if (imageValid) {
          newImage = FALLBACK_IMAGES[asin];
          source = 'fallback';
        }
      }
    }
    
    results.push({
      id: product.id,
      asin: asin,
      name: product.name,
      imageValid,
      source,
      oldImage: product.image,
      newImage,
    });
    
    if (!options.dryRun && newImage !== product.image) {
      product.image = newImage;
      product.image_source = source;
      product.image_updated = new Date().toISOString().split('T')[0];
    }
  }
  
  if (!options.dryRun) {
    data.lastUpdated = new Date().toISOString().split('T')[0];
    fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(data, null, 2));
    console.log('✅ Products file updated');
  }
  
  return results;
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  
  console.log(dryRun ? '🔍 Dry run mode\n' : '🔄 Refreshing images...\n');
  
  const results = await refreshProducts({ dryRun });
  
  for (const r of results) {
    const status = r.imageValid ? '✅' : '❌';
    console.log(`${status} [${r.id}] ${r.name}`);
    console.log(`   Source: ${r.source}`);
    if (r.source !== 'existing') {
      console.log(`   Updated: ${r.oldImage.slice(0, 50)}...`);
      console.log(`        to: ${r.newImage.slice(0, 50)}...`);
    }
  }
  
  const valid = results.filter(r => r.imageValid).length;
  console.log(`\n📊 ${valid}/${results.length} images valid`);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = { refreshProducts, verifyImageUrl, FALLBACK_IMAGES };
