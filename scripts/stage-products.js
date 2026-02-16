const fs = require('fs');
const path = require('path');
const { validateProduct } = require('./validate-product.js');

const PRODUCTS_FILE = path.join(__dirname, '..', 'products.json');
const STAGING_DIR = path.join(__dirname, '..', 'staging', 'products');
const APPROVED_DIR = path.join(STAGING_DIR, 'approved');
const REJECTED_DIR = path.join(STAGING_DIR, 'rejected');
const PENDING_DIR = path.join(STAGING_DIR, 'pending');

async function stageProducts() {
  console.log('📦 PRODUCT STAGING SYSTEM');
  console.log('='.repeat(50));
  
  // Load products
  let products;
  try {
    const data = fs.readFileSync(PRODUCTS_FILE, 'utf8');
    products = JSON.parse(data).products;
    console.log(`📋 Loaded ${products.length} products from products.json\n`);
  } catch (error) {
    console.error(`❌ Failed to load products.json: ${error.message}`);
    process.exit(1);
  }
  
  const results = {
    approved: [],
    rejected: [],
    timestamp: new Date().toISOString()
  };
  
  // Validate each product
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    console.log(`\n[${i + 1}/${products.length}] ${product.name}`);
    console.log(`    ASIN: ${product.asin}`);
    
    const validation = await validateProduct(product.asin);
    
    // Combine product data with validation results
    const enrichedProduct = {
      ...product,
      validation: {
        valid: validation.valid,
        score: validation.score,
        passedChecks: validation.passedChecks,
        checks: validation.checks,
        liveData: validation.data,
        errors: validation.errors,
        validatedAt: new Date().toISOString()
      }
    };
    
    // Write to appropriate directory
    const filename = `${product.asin}.json`;
    
    if (validation.valid) {
      fs.writeFileSync(
        path.join(APPROVED_DIR, filename),
        JSON.stringify(enrichedProduct, null, 2)
      );
      results.approved.push(enrichedProduct);
      console.log(`    ✅ APPROVED (${validation.passedChecks}/5 checks passed)`);
      
      // Show live data
      if (validation.data.price) {
        console.log(`    💰 Live price: ${validation.data.price}`);
      }
      if (validation.data.title) {
        console.log(`    📝 Title: ${validation.data.title.substring(0, 50)}...`);
      }
    } else {
      fs.writeFileSync(
        path.join(REJECTED_DIR, filename),
        JSON.stringify(enrichedProduct, null, 2)
      );
      results.rejected.push(enrichedProduct);
      console.log(`    ❌ REJECTED (${validation.passedChecks}/5 checks passed)`);
      if (validation.errors.length > 0) {
        console.log(`    ⚠️  Errors: ${validation.errors.join(', ')}`);
      }
    }
    
    // Brief pause between requests to avoid rate limiting
    if (i < products.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
  
  // Write manifest of approved products
  const manifest = {
    approvedProducts: results.approved.map(p => ({
      id: p.id,
      asin: p.asin,
      name: p.name,
      price: p.price,
      livePrice: p.validation.liveData.price,
      category: p.category,
      affiliate_link: p.affiliate_link,
      score: p.validation.score
    })),
    rejectedProducts: results.rejected.map(p => ({
      id: p.id,
      asin: p.asin,
      name: p.name,
      errors: p.validation.errors,
      score: p.validation.score
    })),
    summary: {
      total: products.length,
      approved: results.approved.length,
      rejected: results.rejected.length,
      approvalRate: (results.approved.length / products.length * 100).toFixed(1) + '%'
    },
    generatedAt: results.timestamp
  };
  
  fs.writeFileSync(
    path.join(STAGING_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2)
  );
  
  // Print summary
  console.log('\n' + '='.repeat(50));
  console.log('📊 STAGING SUMMARY');
  console.log('='.repeat(50));
  console.log(`✅ Approved: ${results.approved.length}`);
  console.log(`❌ Rejected: ${results.rejected.length}`);
  console.log(`📈 Approval rate: ${manifest.summary.approvalRate}`);
  console.log(`\n📁 Manifest saved: staging/products/manifest.json`);
  
  return manifest;
}

// CLI
async function main() {
  try {
    await stageProducts();
  } catch (error) {
    console.error(`❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Only run main if this is the entry point
if (require.main === module) {
  main();
}

module.exports = { stageProducts };
