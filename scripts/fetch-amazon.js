#!/usr/bin/env node
/**
 * Fetch real Amazon product data via Rainforest API
 * Updates products.json with real images, prices, and details
 */

const fs = require('fs');
const path = require('path');
const https = require('https');

const RAINFOREST_API_KEY = process.env.RAINFOREST_API_KEY || '618EC0767D5D455DB7E5A14B1738287E';
const PRODUCTS_FILE = path.join(__dirname, '..', 'products.json');

// Fetch product data from Rainforest API
function fetchProduct(asin) {
  return new Promise((resolve, reject) => {
    const url = `https://api.rainforestapi.com/request?api_key=${RAINFOREST_API_KEY}&type=product&amazon_domain=amazon.com&asin=${asin}`;
    
    https.get(url, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.product) {
            resolve({
              asin: asin,
              title: json.product.title,
              image: json.product.main_image?.link || null,
              images: json.product.images?.map(i => i.link) || [],
              price: json.product.buybox_winner?.price?.raw || null,
              original_price: json.product.buybox_winner?.rrp?.raw || null,
              rating: json.product.rating || null,
              reviews_count: json.product.ratings_total || null,
              prime: json.product.buybox_winner?.is_prime || false,
              coupon: json.product.buybox_winner?.deal_badge || null,
            });
          } else {
            reject(new Error(json.error?.message || 'No product data'));
          }
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

// Delay helper
const delay = ms => new Promise(r => setTimeout(r, ms));

async function main() {
  // Load current products
  const productsData = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
  const products = productsData.products;
  
  console.log(`Fetching data for ${products.length} products...\n`);
  
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`[${i+1}/${products.length}] Fetching ${product.asin}...`);
    
    try {
      const data = await fetchProduct(product.asin);
      
      // Update product with real data
      product.name = data.title || product.name;
      product.image = data.image || product.image;
      product.amazon_images = data.images;
      product.price = data.price || product.price;
      product.original_price = data.original_price || product.original_price;
      product.rating = data.rating;
      product.reviews_count = data.reviews_count;
      product.prime = data.prime;
      product.amazon_coupon = data.coupon;
      product.last_updated = new Date().toISOString();
      
      console.log(`   ✅ ${data.title?.substring(0, 50)}... — ${data.price}`);
      console.log(`   📷 ${data.image}`);
      
    } catch (err) {
      console.log(`   ❌ Error: ${err.message}`);
    }
    
    // Rate limit: 1 request per second
    if (i < products.length - 1) {
      await delay(1100);
    }
  }
  
  // Save updated products
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(productsData, null, 2));
  console.log(`\n✅ Updated ${PRODUCTS_FILE}`);
}

main().catch(console.error);
