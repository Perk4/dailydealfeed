#!/usr/bin/env node
/**
 * Episode Production System for DailyDealFeed
 * 
 * Creates new episodes from the product queue and updates the site.
 * Usage: node scripts/create-episode.js [--products <asin1,asin2,...>] [--name "Episode Name"]
 * 
 * Examples:
 *   node scripts/create-episode.js                    # Auto-select 6-8 products from queue
 *   node scripts/create-episode.js --products B123,B456,B789
 *   node scripts/create-episode.js --name "Morning Deals"
 */

const fs = require('fs');
const path = require('path');

// Paths
const EPISODES_DIR = path.join(__dirname, '..', 'episodes');
const MANIFEST_PATH = path.join(EPISODES_DIR, 'episodes.json');
const NEXT_BATCH_PATH = path.join(__dirname, '..', 'production', 'queue', 'next-batch.json');
const PRODUCTS_PATH = path.join(__dirname, '..', 'products.json');
const INDEX_PATH = path.join(__dirname, '..', 'index.html');

// Ensure episodes directory exists
if (!fs.existsSync(EPISODES_DIR)) {
  fs.mkdirSync(EPISODES_DIR, { recursive: true });
}

// Load or create manifest
function loadManifest() {
  if (fs.existsSync(MANIFEST_PATH)) {
    return JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  }
  return {
    version: '1.0',
    lastEpisode: 0,
    episodes: []
  };
}

// Save manifest
function saveManifest(manifest) {
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2));
}

// Load available products from queue and main products.json
function loadAvailableProducts() {
  const products = [];
  
  // Load from next-batch.json (primary source)
  if (fs.existsSync(NEXT_BATCH_PATH)) {
    const batch = JSON.parse(fs.readFileSync(NEXT_BATCH_PATH, 'utf8'));
    if (batch.items) {
      products.push(...batch.items.map(item => ({
        asin: item.asin,
        name: item.name,
        price: item.price,
        category: item.category,
        rating: item.rating || '4.5 stars',
        bestStat: item.bestStat || item.whyItWorks?.substring(0, 50) || '',
        affiliate_link: item.affiliate_link,
        image_url: `https://images-na.ssl-images-amazon.com/images/P/${item.asin}.jpg`,
        promoCodes: item.promoCodes || [],
        savingsNote: item.savingsNote || '',
        clippableCoupon: item.clippableCoupon || ''
      })));
    }
  }
  
  // Load from products.json (secondary source)
  if (fs.existsSync(PRODUCTS_PATH)) {
    const productsJson = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));
    if (productsJson.products) {
      productsJson.products.forEach(p => {
        // Avoid duplicates
        if (!products.find(existing => existing.asin === p.asin)) {
          products.push({
            asin: p.asin,
            name: p.name,
            price: p.price,
            category: p.category,
            rating: '4.5 stars',
            bestStat: p.best_stat || '',
            affiliate_link: p.affiliate_link,
            image_url: p.image_url,
            promoCodes: p.promo_codes || [],
            savingsNote: p.promo_notes || '',
            clippableCoupon: ''
          });
        }
      });
    }
  }
  
  return products;
}

// Select products for episode
function selectProducts(available, specificAsins, count = 7) {
  if (specificAsins && specificAsins.length > 0) {
    return available.filter(p => specificAsins.includes(p.asin));
  }
  
  // Shuffle and pick count products
  const shuffled = [...available].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, shuffled.length));
}

// Generate product card HTML
function generateProductCard(product) {
  const hasCode = product.promoCodes && product.promoCodes.length > 0;
  const code = hasCode ? product.promoCodes[0].code : null;
  const discount = hasCode ? product.promoCodes[0].discount : null;
  
  // Calculate fake discount for display (if no actual discount info)
  const discountBadge = discount ? `<span class="discount-badge">${discount}</span>` : 
    '<span class="discount-badge">HOT DEAL</span>';
  
  const codeButton = code ? `
            <button class="btn btn-code" onclick="copyCode('${code}', this)">
              Code: ${code}
              <svg class="btn-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="8" y="8" width="14" height="14" rx="2"/>
                <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>
              </svg>
            </button>` : '';
  
  const savingsNote = product.savingsNote ? `<div class="savings-note">💡 ${product.savingsNote}</div>` : '';
  
  return `
          <!-- ${product.name} -->
          <div class="product-card">
            <div class="product-image">
              <img src="${product.image_url}" alt="${product.name}" loading="lazy">
            </div>
            <div class="product-title">${product.name}</div>
            <div class="product-pricing">
              ${discountBadge}
              <div class="price-row">
                <span class="sale-price">${product.price}</span>
              </div>
            </div>
            ${savingsNote}${codeButton}
            <a href="${product.affiliate_link}" target="_blank" rel="noopener" class="btn btn-deal">
              Go to Deal →
            </a>
          </div>`;
}

// Generate episode HTML block
function generateEpisodeHTML(episode, isFirst = false) {
  const products = episode.products.map(p => generateProductCard(p)).join('\n');
  const openClass = isFirst ? ' open' : '';
  
  return `
    <!-- Episode ${episode.number} -->
    <div class="episode${openClass}" id="episode${episode.number}">
      <button class="episode-header" onclick="toggleEpisode('episode${episode.number}')">
        <div>
          <div class="episode-title">Episode ${episode.number} - ${episode.name}</div>
          <div class="episode-subtitle">${episode.date} • ${episode.products.length} deals</div>
        </div>
        <svg class="episode-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="m6 9 6 6 6-6"/>
        </svg>
      </button>
      <div class="episode-content">
        <div class="product-grid">
${products}
        </div>
      </div>
    </div>`;
}

// Create a new episode
function createEpisode(options = {}) {
  const manifest = loadManifest();
  const available = loadAvailableProducts();
  
  if (available.length === 0) {
    console.error('❌ No products available! Add products to products.json or production/queue/next-batch.json');
    process.exit(1);
  }
  
  // Get next episode number
  const episodeNumber = manifest.lastEpisode + 1;
  
  // Select products
  const specificAsins = options.products ? options.products.split(',') : null;
  const selectedProducts = selectProducts(available, specificAsins, options.count || 7);
  
  if (selectedProducts.length < 3) {
    console.error('❌ Need at least 3 products for an episode');
    process.exit(1);
  }
  
  // Create episode data
  const now = new Date();
  const episode = {
    number: episodeNumber,
    name: options.name || getDefaultEpisodeName(now),
    date: now.toLocaleDateString('en-US', { 
      weekday: 'short', 
      month: 'short', 
      day: 'numeric',
      year: 'numeric'
    }),
    timestamp: now.toISOString(),
    products: selectedProducts,
    usedAsins: selectedProducts.map(p => p.asin)
  };
  
  // Save episode JSON
  const episodeFilePath = path.join(EPISODES_DIR, `episode-${episodeNumber}.json`);
  fs.writeFileSync(episodeFilePath, JSON.stringify(episode, null, 2));
  
  // Update manifest
  manifest.lastEpisode = episodeNumber;
  manifest.episodes.unshift({
    number: episodeNumber,
    name: episode.name,
    date: episode.date,
    timestamp: episode.timestamp,
    productCount: selectedProducts.length,
    file: `episode-${episodeNumber}.json`
  });
  saveManifest(manifest);
  
  // Generate HTML
  const episodeHTML = generateEpisodeHTML(episode, true);
  
  console.log(`✅ Created Episode ${episodeNumber}: "${episode.name}"`);
  console.log(`   📦 ${selectedProducts.length} products`);
  console.log(`   📁 Saved to: ${episodeFilePath}`);
  
  return { episode, html: episodeHTML };
}

// Get default episode name based on time of day
function getDefaultEpisodeName(date) {
  const hour = date.getHours();
  if (hour < 12) return 'Morning Deals';
  if (hour < 17) return 'Afternoon Finds';
  return 'Evening Steals';
}

// Rebuild index.html with all episodes
function rebuildIndex() {
  const manifest = loadManifest();
  
  if (manifest.episodes.length === 0) {
    console.log('⚠️ No episodes to build');
    return;
  }
  
  // Read existing index.html
  let indexHTML = fs.readFileSync(INDEX_PATH, 'utf8');
  
  // Generate HTML for all episodes
  const allEpisodesHTML = manifest.episodes.map((ep, idx) => {
    const episodePath = path.join(EPISODES_DIR, ep.file);
    if (!fs.existsSync(episodePath)) {
      console.warn(`⚠️ Episode file missing: ${ep.file}`);
      return '';
    }
    const episode = JSON.parse(fs.readFileSync(episodePath, 'utf8'));
    return generateEpisodeHTML(episode, idx === 0);
  }).join('\n');
  
  // Find the main content section and replace episodes
  // Look for the pattern between newsletter and footer
  const mainStartMarker = '<!-- Newsletter Signup -->';
  const mainEndMarker = '</main>';
  
  const mainStartIdx = indexHTML.indexOf(mainStartMarker);
  const mainEndIdx = indexHTML.indexOf(mainEndMarker);
  
  if (mainStartIdx === -1 || mainEndIdx === -1) {
    console.error('❌ Could not find main content markers in index.html');
    return;
  }
  
  // Find the newsletter section end
  const newsletterEnd = indexHTML.indexOf('</div>', mainStartIdx + mainStartMarker.length) + 6;
  
  // Build new main content
  const beforeNewsletter = indexHTML.substring(0, newsletterEnd);
  const afterMain = indexHTML.substring(mainEndIdx);
  
  const newIndexHTML = beforeNewsletter + '\n' + allEpisodesHTML + '\n\n  ' + afterMain;
  
  // Write updated index.html
  fs.writeFileSync(INDEX_PATH, newIndexHTML);
  console.log(`✅ Rebuilt index.html with ${manifest.episodes.length} episodes`);
}

// CLI argument parsing
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--products' && args[i + 1]) {
      options.products = args[i + 1];
      i++;
    } else if (args[i] === '--name' && args[i + 1]) {
      options.name = args[i + 1];
      i++;
    } else if (args[i] === '--count' && args[i + 1]) {
      options.count = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--rebuild') {
      options.rebuild = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      console.log(`
DailyDealFeed Episode Creator

Usage: node create-episode.js [options]

Options:
  --products <asins>   Comma-separated ASINs to include (e.g., B123,B456)
  --name <name>        Episode name (default: "Morning/Afternoon/Evening Deals")
  --count <n>          Number of products (default: 7)
  --rebuild            Rebuild index.html with all episodes
  --help, -h           Show this help

Examples:
  node create-episode.js                              # Create episode with 7 random products
  node create-episode.js --name "Flash Sale!"         # Custom episode name
  node create-episode.js --count 8                    # 8 products
  node create-episode.js --rebuild                    # Regenerate index.html
`);
      process.exit(0);
    }
  }
  
  return options;
}

// Main
const options = parseArgs();

if (options.rebuild) {
  rebuildIndex();
} else {
  const result = createEpisode(options);
  rebuildIndex();
  console.log('\n🎉 Episode ready! Site updated.');
  console.log(`\n📋 Next steps:
  1. git add -A && git commit -m "Episode ${result.episode.number}"
  2. git push origin main
  3. Post on IG/TikTok with episode link`);
}
