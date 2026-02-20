#!/usr/bin/env node
/**
 * Generate individual embed pages for Carrd integration
 * V2: Find actual video files + validate Amazon links
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const logger = require('./lib/logger');

/**
 * Check if Amazon product page exists (not 404)
 */
async function validateAmazonLink(asin) {
  return new Promise((resolve) => {
    const url = `https://www.amazon.com/dp/${asin}`;
    logger.embed('DEBUG', `Validating Amazon link`, { asin, url });
    
    const req = https.request(url, { method: 'HEAD', timeout: 10000 }, (res) => {
      // 200, 301, 302 are OK; 404 is bad
      const isValid = res.statusCode < 400;
      if (isValid) {
        logger.embed('DEBUG', `Amazon link valid`, { asin, statusCode: res.statusCode });
      } else {
        logger.embed('WARN', `Amazon link invalid (HTTP ${res.statusCode})`, { asin, statusCode: res.statusCode });
      }
      resolve(isValid);
    });
    req.on('error', (err) => {
      logger.embed('ERROR', `Amazon validation network error`, { asin, error: err.message });
      resolve(false);
    });
    req.on('timeout', () => {
      logger.embed('WARN', `Amazon validation timeout (10s)`, { asin });
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

/**
 * Find the actual video file for a product
 */
function findVideoFile(productId, asin) {
  const approvedDir = 'output/approved';
  if (!fs.existsSync(approvedDir)) return null;
  
  const files = fs.readdirSync(approvedDir);
  
  // Try to find video by product ID first
  let videoFile = files.find(f => f.startsWith(`video_${productId}_`) && f.endsWith('.mp4'));
  
  // Try by ASIN if not found
  if (!videoFile && asin) {
    videoFile = files.find(f => f.includes(asin) && f.endsWith('.mp4'));
  }
  
  // Try amazon_ prefix
  if (!videoFile && asin) {
    videoFile = files.find(f => f === `amazon_${asin}.mp4`);
  }
  
  return videoFile;
}

async function generateEmbed(productId, options = {}) {
  const { skipValidation = false, forceVideo = null } = options;
  
  logger.embed('INFO', `Generating embed for product ${productId}`, { productId, options });
  
  let manifest;
  try {
    manifest = JSON.parse(fs.readFileSync('staging/products/manifest.json', 'utf8'));
  } catch (readErr) {
    logger.embed('ERROR', `Failed to read products manifest`, {
      error: readErr.message,
      path: 'staging/products/manifest.json'
    });
    return { success: false, error: 'Failed to read manifest' };
  }
  
  const product = manifest.products[parseInt(productId) - 1];
  
  if (!product) {
    logger.embed('ERROR', `Product ${productId} not found in manifest`, {
      productId,
      totalProducts: manifest.products?.length
    });
    console.error(`❌ Product ${productId} not found`);
    return { success: false, error: 'Product not found' };
  }

  // Validate Amazon link
  if (!skipValidation) {
    console.log(`🔍 Validating Amazon link for ${product.asin}...`);
    const isValid = await validateAmazonLink(product.asin);
    if (!isValid) {
      logger.embed('WARN', `Amazon link 404 - skipping embed`, {
        productId,
        asin: product.asin,
        productName: product.name
      });
      console.error(`❌ Amazon link 404 for ${product.asin} - skipping embed`);
      return { success: false, error: 'Amazon 404', asin: product.asin };
    }
    console.log(`✅ Amazon link valid`);
  }

  // Find actual video file
  const videoFile = forceVideo || findVideoFile(productId, product.asin);
  const hasVideo = !!videoFile;
  
  if (!hasVideo) {
    logger.embed('WARN', `No video file found for product`, {
      productId,
      asin: product.asin,
      searchDir: 'output/approved'
    });
  } else {
    logger.embed('DEBUG', `Found video file`, { productId, videoFile });
  }
  
  const videoUrl = hasVideo 
    ? `https://raw.githubusercontent.com/Perk4/dailydealfeed/main/output/approved/${videoFile}`
    : null;

  // Generate HTML with or without video
  const videoSection = hasVideo 
    ? `<div class="video-wrapper">
      <video controls playsinline autoplay muted loop>
        <source src="${videoUrl}" type="video/mp4">
        Your browser does not support video.
      </video>
    </div>`
    : `<div class="video-wrapper no-video">
      <div class="placeholder">🎬 Video coming soon</div>
    </div>`;

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${product.name} - DailyDealFeed</title>
  <meta property="og:title" content="${product.name}">
  <meta property="og:description" content="Get it for ${product.price} on Amazon">
  <meta property="og:image" content="https://images-na.ssl-images-amazon.com/images/P/${product.asin}.jpg">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #fff; }
    .container { max-width: 400px; margin: 0 auto; padding: 16px; }
    .video-wrapper { width: 100%; aspect-ratio: 9/16; border-radius: 12px; overflow: hidden; background: #111; }
    .video-wrapper.no-video { display: flex; align-items: center; justify-content: center; }
    .placeholder { color: #666; font-size: 18px; }
    video { width: 100%; height: 100%; object-fit: cover; }
    .product-info { background: #1a1a1a; border-radius: 12px; padding: 16px; margin-top: 12px; }
    .product-row { display: flex; align-items: center; gap: 12px; }
    .product-img { width: 60px; height: 60px; object-fit: contain; background: #fff; border-radius: 8px; }
    .product-details h3 { font-size: 14px; margin-bottom: 4px; }
    .price { color: #4ade80; font-size: 18px; font-weight: 700; }
    .buy-btn { display: block; background: #ff9900; color: #000; text-align: center; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 12px; }
    .buy-btn:hover { background: #e8890a; }
  </style>
</head>
<body>
  <div class="container">
    ${videoSection}
    <div class="product-info">
      <div class="product-row">
        <img class="product-img" src="https://images-na.ssl-images-amazon.com/images/P/${product.asin}.jpg" alt="${product.name}" onerror="this.src='https://via.placeholder.com/60?text=No+Image'">
        <div class="product-details">
          <h3>${product.name.substring(0, 60)}${product.name.length > 60 ? '...' : ''}</h3>
          <div class="price">${product.price}</div>
        </div>
      </div>
      <a class="buy-btn" href="https://www.amazon.com/dp/${product.asin}?tag=dailydealfeed-20" target="_blank" rel="noopener">Shop on Amazon</a>
    </div>
  </div>
</body>
</html>`;

  // Save to embeds folder
  const embedDir = 'embeds';
  if (!fs.existsSync(embedDir)) fs.mkdirSync(embedDir);
  
  const embedPath = path.join(embedDir, `product-${productId}.html`);
  try {
    fs.writeFileSync(embedPath, html);
    logger.embed('DEBUG', `Wrote embed file`, { embedPath });
  } catch (writeErr) {
    logger.embed('ERROR', `Failed to write embed file`, {
      embedPath,
      error: writeErr.message
    });
    return { success: false, error: 'Failed to write embed file', path: embedPath };
  }
  
  // Also save to docs for GitHub Pages
  const docsDir = 'docs';
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);
  
  const docsPath = path.join(docsDir, `product-${productId}.html`);
  try {
    fs.writeFileSync(docsPath, html);
    logger.embed('DEBUG', `Wrote docs file`, { docsPath });
  } catch (writeErr) {
    logger.embed('ERROR', `Failed to write docs file`, {
      docsPath,
      error: writeErr.message
    });
    // Non-fatal, continue
  }
  
  logger.embed('INFO', `Embed generated successfully`, {
    productId,
    asin: product.asin,
    hasVideo,
    videoFile,
    embedPath,
    url: `https://perk4.github.io/dailydealfeed/product-${productId}.html`
  });
  
  console.log(`✅ Embed generated: ${embedPath}`);
  console.log(`   Video: ${hasVideo ? videoFile : 'none'}`);
  console.log(`   URL: https://perk4.github.io/dailydealfeed/product-${productId}.html`);
  
  return { 
    success: true, 
    productId, 
    asin: product.asin,
    hasVideo,
    videoFile,
    embedPath,
    docsPath
  };
}

/**
 * Generate all embeds with validation
 */
async function generateAllEmbeds() {
  const manifest = JSON.parse(fs.readFileSync('staging/products/manifest.json', 'utf8'));
  const results = {
    success: [],
    failed: [],
    noVideo: []
  };
  
  for (let i = 0; i < manifest.products.length; i++) {
    const productId = i + 1;
    console.log(`\n--- Product ${productId}/${manifest.products.length} ---`);
    
    const result = await generateEmbed(productId);
    
    if (result.success) {
      if (result.hasVideo) {
        results.success.push(result);
      } else {
        results.noVideo.push(result);
      }
    } else {
      results.failed.push(result);
    }
  }
  
  console.log(`\n=== SUMMARY ===`);
  console.log(`✅ Success with video: ${results.success.length}`);
  console.log(`⚠️ Success without video: ${results.noVideo.length}`);
  console.log(`❌ Failed (404 or error): ${results.failed.length}`);
  
  if (results.failed.length > 0) {
    console.log(`\nFailed ASINs:`);
    results.failed.forEach(r => console.log(`  - ${r.asin}: ${r.error}`));
  }
  
  return results;
}

// CLI
if (require.main === module) {
  const arg = process.argv[2];
  
  if (arg === '--all') {
    generateAllEmbeds().then(results => {
      process.exit(results.failed.length > 0 ? 1 : 0);
    });
  } else if (arg) {
    generateEmbed(arg).then(result => {
      process.exit(result.success ? 0 : 1);
    });
  } else {
    console.log('Usage:');
    console.log('  node generate-embed.js <product-id>  - Generate single embed');
    console.log('  node generate-embed.js --all         - Generate all embeds with validation');
    process.exit(1);
  }
}

module.exports = { generateEmbed, generateAllEmbeds, validateAmazonLink, findVideoFile };
