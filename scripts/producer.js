#!/usr/bin/env node
/**
 * Producer Agent — Amazon Asset Collector
 * Ticket #30
 * 
 * Fetches product assets for video assembly.
 * Currently uses existing images from products.json.
 * TODO: Integrate Amazon Product API when access is granted.
 */

const fs = require('fs');
const path = require('path');

const PRODUCTS_FILE = path.join(__dirname, '..', 'products.json');
const STORE_ID = 'dailydealfeed-20';

function loadProducts() {
  const data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
  return data.products;
}

function extractASIN(amazonUrl) {
  const match = amazonUrl.match(/\/dp\/([A-Z0-9]{10})/);
  return match ? match[1] : null;
}

function getProductAssets(productId) {
  /**
   * Get all assets needed for a product video.
   * 
   * Returns:
   * {
   *   product_id, product_name, product_image_url, amazon_link,
   *   asin, current_price, tagline, discount_code, affiliate_tag,
   *   assets_ready, notes
   * }
   */
  const products = loadProducts();
  const product = products.find(p => p.id === String(productId));
  
  if (!product) {
    return { error: `Product ${productId} not found` };
  }
  
  const asin = extractASIN(product.link);
  
  // Build affiliate link with tag
  let affiliateLink = product.link;
  if (!affiliateLink.includes(STORE_ID)) {
    affiliateLink = `${affiliateLink}?tag=${STORE_ID}`;
  }
  
  return {
    product_id: product.id,
    product_name: product.name,
    product_image_url: product.image,  // Currently Unsplash, will be Amazon later
    amazon_link: affiliateLink,
    asin: asin,
    current_price: product.price,
    tagline: product.tagline,
    discount_code: null,  // TODO: Integrate coupon API
    affiliate_tag: STORE_ID,
    assets_ready: true,
    notes: 'Using placeholder image. Amazon API integration pending.'
  };
}

function getAllAssets() {
  const products = loadProducts();
  return products.map(p => getProductAssets(p.id));
}

// CLI execution
if (require.main === module) {
  const productId = process.argv[2];
  
  if (productId) {
    console.log(JSON.stringify(getProductAssets(productId), null, 2));
  } else {
    // Demo: get first featured product
    const products = loadProducts();
    const featured = products.find(p => p.featured) || products[0];
    console.log(JSON.stringify(getProductAssets(featured.id), null, 2));
  }
}

module.exports = { getProductAssets, getAllAssets, loadProducts };
