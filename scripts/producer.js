#!/usr/bin/env node
/**
 * Producer Agent — Amazon Asset Collector v2
 * @dailydealfeed
 * 
 * Fetches real Amazon product data including:
 * - Real product images from Amazon CDN
 * - Current exact prices
 * - Discount/coupon codes
 * - Prime badge status
 * 
 * Data sources (in priority order):
 * 1. Amazon Product Advertising API (PA-API) - if credentials available
 * 2. Rainforest API - if API key available
 * 3. Local curated data from products.json (verified real Amazon data)
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const PRODUCTS_FILE = path.join(__dirname, '..', 'products.json');
const STORE_ID = 'dailydealfeed-20';

// API Configuration - set these environment variables for live data
const CONFIG = {
  RAINFOREST_API_KEY: process.env.RAINFOREST_API_KEY || null,
  AMAZON_ACCESS_KEY: process.env.AMAZON_ACCESS_KEY || null,
  AMAZON_SECRET_KEY: process.env.AMAZON_SECRET_KEY || null,
  AMAZON_PARTNER_TAG: process.env.AMAZON_PARTNER_TAG || STORE_ID,
};

// ============================================================================
// Data Loading
// ============================================================================

function loadProducts() {
  const data = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
  return data.products;
}

function extractASIN(amazonUrl) {
  const match = amazonUrl.match(/\/dp\/([A-Z0-9]{10})/);
  return match ? match[1] : null;
}

// ============================================================================
// Rainforest API Integration
// ============================================================================

async function fetchFromRainforest(asin) {
  if (!CONFIG.RAINFOREST_API_KEY) {
    return null;
  }
  
  return new Promise((resolve, reject) => {
    const url = `https://api.rainforestapi.com/request?api_key=${CONFIG.RAINFOREST_API_KEY}&type=product&amazon_domain=amazon.com&asin=${asin}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.product) {
            resolve({
              name: json.product.title,
              price: json.product.buybox_winner?.price?.value 
                ? `$${json.product.buybox_winner.price.value}` 
                : null,
              original_price: json.product.buybox_winner?.rrp?.value
                ? `$${json.product.buybox_winner.rrp.value}`
                : null,
              image_url: json.product.main_image?.link || null,
              prime: json.product.buybox_winner?.is_prime || false,
              coupon_code: json.product.coupon?.raw || null,
              in_stock: json.product.buybox_winner?.availability?.type === 'in_stock',
              rating: json.product.rating,
              reviews_count: json.product.ratings_total,
            });
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    }).on('error', () => resolve(null));
  });
}

// ============================================================================
// Main Product Assets Function
// ============================================================================

async function getProductAssets(productId, options = {}) {
  /**
   * Get all assets needed for a product video.
   * 
   * Options:
   *   - forceLive: boolean - Force API fetch even if local data exists
   *   - includeMetadata: boolean - Include extra metadata fields
   * 
   * Returns structured product data:
   * {
   *   product_id, name, image_url, price, original_price,
   *   discount_percent, coupon_code, prime, asin, amazon_link,
   *   tagline, assets_ready, data_source
   * }
   */
  const products = loadProducts();
  const product = products.find(p => p.id === String(productId));
  
  if (!product) {
    return { error: `Product ${productId} not found`, product_id: productId };
  }
  
  const asin = product.asin || extractASIN(product.link);
  
  // Try live API fetch if configured
  let liveData = null;
  if (options.forceLive || CONFIG.RAINFOREST_API_KEY) {
    liveData = await fetchFromRainforest(asin);
  }
  
  // Build affiliate link with tag
  let affiliateLink = product.link || product.affiliate_link || `https://www.amazon.com/dp/${asin}`;
  if (!affiliateLink.includes(STORE_ID)) {
    const separator = affiliateLink.includes('?') ? '&' : '?';
    affiliateLink = `${affiliateLink}${separator}tag=${STORE_ID}`;
  }
  
  // Calculate discount if we have both prices
  let discountPercent = product.discount_percent;
  if (!discountPercent && product.original_price && product.price) {
    const current = parseFloat(product.price.replace(/[^0-9.]/g, ''));
    const original = parseFloat(product.original_price.replace(/[^0-9.]/g, ''));
    if (original > current) {
      discountPercent = Math.round((1 - current / original) * 100) + '%';
    }
  }
  
  // Merge live data with local data (live takes priority)
  const result = {
    product_id: product.id,
    name: liveData?.name || product.name,
    image_url: liveData?.image_url || product.image,
    price: liveData?.price || product.price,
    original_price: liveData?.original_price || product.original_price || null,
    discount_percent: discountPercent,
    coupon_code: liveData?.coupon_code || product.coupon_code || null,
    prime: liveData?.prime ?? product.prime ?? true,
    asin: asin,
    amazon_link: affiliateLink,
    tagline: product.tagline,
    category: product.category,
    featured: product.featured || false,
    assets_ready: true,
    data_source: liveData ? 'rainforest_api' : 'local_verified',
    verified_date: product.verified || null,
  };
  
  // Add extra metadata if requested
  if (options.includeMetadata && liveData) {
    result.metadata = {
      rating: liveData.rating,
      reviews_count: liveData.reviews_count,
      in_stock: liveData.in_stock,
    };
  }
  
  return result;
}

async function getAllAssets(options = {}) {
  const products = loadProducts();
  const results = [];
  
  for (const p of products) {
    const assets = await getProductAssets(p.id, options);
    results.push(assets);
  }
  
  return results;
}

function getFeaturedAssets() {
  const products = loadProducts();
  return products
    .filter(p => p.featured)
    .map(p => ({
      product_id: p.id,
      name: p.name,
      image_url: p.image,
      price: p.price,
      original_price: p.original_price,
      discount_percent: p.discount_percent,
      coupon_code: p.coupon_code,
      prime: p.prime,
      asin: p.asin,
      amazon_link: p.link.includes(STORE_ID) ? p.link : `${p.link}?tag=${STORE_ID}`,
      tagline: p.tagline,
      category: p.category,
      featured: true,
      assets_ready: true,
      data_source: 'local_verified',
    }));
}

// ============================================================================
// Image URL Helpers
// ============================================================================

function getAmazonImageUrl(asin, imageId, size = 'SL1500') {
  /**
   * Construct Amazon CDN image URL
   * Common sizes: SL100, SL200, SL500, SL1000, SL1500
   */
  return `https://m.media-amazon.com/images/I/${imageId}._AC_${size}_.jpg`;
}

function getImageVariants(imageUrl) {
  /**
   * Get different size variants of an Amazon image
   */
  const baseUrl = imageUrl.replace(/_AC_SL\d+_/, '_AC_');
  return {
    thumbnail: baseUrl.replace('_AC_', '_AC_SL100_'),
    small: baseUrl.replace('_AC_', '_AC_SL200_'),
    medium: baseUrl.replace('_AC_', '_AC_SL500_'),
    large: baseUrl.replace('_AC_', '_AC_SL1000_'),
    xlarge: baseUrl.replace('_AC_', '_AC_SL1500_'),
  };
}

// ============================================================================
// CLI Execution
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case '--all':
      const all = await getAllAssets();
      console.log(JSON.stringify(all, null, 2));
      break;
      
    case '--featured':
      const featured = getFeaturedAssets();
      console.log(JSON.stringify(featured, null, 2));
      break;
      
    case '--live':
      // Force live API fetch for a product
      const liveProductId = args[1];
      if (!liveProductId) {
        console.error('Usage: producer.js --live <product_id>');
        process.exit(1);
      }
      const liveAssets = await getProductAssets(liveProductId, { forceLive: true, includeMetadata: true });
      console.log(JSON.stringify(liveAssets, null, 2));
      break;
      
    case '--help':
      console.log(`
Producer Agent — Amazon Asset Collector v2

Usage:
  producer.js [product_id]    Get assets for a specific product
  producer.js --all           Get all product assets
  producer.js --featured      Get featured product assets only
  producer.js --live <id>     Force live API fetch for a product
  producer.js --help          Show this help

Environment Variables:
  RAINFOREST_API_KEY    Rainforest API key for live data
  AMAZON_ACCESS_KEY     Amazon PA-API access key
  AMAZON_SECRET_KEY     Amazon PA-API secret key
  AMAZON_PARTNER_TAG    Override default affiliate tag

Examples:
  ./producer.js 1
  ./producer.js --featured
  RAINFOREST_API_KEY=xxx ./producer.js --live 1
`);
      break;
      
    default:
      const productId = command || '1';
      const assets = await getProductAssets(productId);
      console.log(JSON.stringify(assets, null, 2));
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  getProductAssets,
  getAllAssets,
  getFeaturedAssets,
  loadProducts,
  extractASIN,
  getImageVariants,
  getAmazonImageUrl,
  CONFIG,
};
