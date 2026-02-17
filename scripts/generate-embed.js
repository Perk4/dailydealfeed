#!/usr/bin/env node
/**
 * Generate individual embed pages for Carrd integration
 */

const fs = require('fs');
const path = require('path');

function generateEmbed(productId) {
  const manifest = JSON.parse(fs.readFileSync('staging/products/manifest.json', 'utf8'));
  const product = manifest.products[parseInt(productId) - 1];
  
  if (!product) {
    console.error(`Product ${productId} not found`);
    return false;
  }

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${product.name} - DailyDealFeed</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, sans-serif; background: #0a0a0a; color: #fff; }
    .container { max-width: 400px; margin: 0 auto; padding: 16px; }
    .video-wrapper { width: 100%; aspect-ratio: 9/16; border-radius: 12px; overflow: hidden; background: #111; }
    video { width: 100%; height: 100%; object-fit: cover; }
    .product-info { background: #1a1a1a; border-radius: 12px; padding: 16px; margin-top: 12px; }
    .product-row { display: flex; align-items: center; gap: 12px; }
    .product-img { width: 60px; height: 60px; object-fit: contain; background: #fff; border-radius: 8px; }
    .product-details h3 { font-size: 14px; margin-bottom: 4px; }
    .price { color: #4ade80; font-size: 18px; font-weight: 700; }
    .buy-btn { display: block; background: #ff9900; color: #000; text-align: center; padding: 12px; border-radius: 8px; text-decoration: none; font-weight: 600; margin-top: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="video-wrapper">
      <video controls playsinline autoplay muted loop>
        <source src="https://raw.githubusercontent.com/Perk4/dailydealfeed/main/output/approved/video_${productId}_latest.mp4" type="video/mp4">
      </video>
    </div>
    <div class="product-info">
      <div class="product-row">
        <img class="product-img" src="https://images-na.ssl-images-amazon.com/images/P/${product.asin}.jpg" alt="${product.name}">
        <div class="product-details">
          <h3>${product.name.substring(0, 50)}${product.name.length > 50 ? '...' : ''}</h3>
          <div class="price">${product.price}</div>
        </div>
      </div>
      <a class="buy-btn" href="https://www.amazon.com/dp/${product.asin}?tag=dailydealfeed-20" target="_blank">Shop on Amazon</a>
    </div>
  </div>
</body>
</html>`;

  // Save to embeds folder
  const embedDir = 'embeds';
  if (!fs.existsSync(embedDir)) fs.mkdirSync(embedDir);
  
  const embedPath = path.join(embedDir, `product-${productId}.html`);
  fs.writeFileSync(embedPath, html);
  
  // Also save to docs for GitHub Pages
  const docsDir = 'docs';
  if (!fs.existsSync(docsDir)) fs.mkdirSync(docsDir);
  
  const docsPath = path.join(docsDir, `product-${productId}.html`);
  fs.writeFileSync(docsPath, html);
  
  console.log(`✅ Embed generated: ${embedPath}`);
  console.log(`✅ GitHub Pages: https://perk4.github.io/dailydealfeed/product-${productId}.html`);
  
  return true;
}

// CLI
if (require.main === module) {
  const productId = process.argv[2];
  if (!productId) {
    console.log('Usage: node generate-embed.js <product-id>');
    process.exit(1);
  }
  generateEmbed(productId);
}

module.exports = { generateEmbed };
