#!/usr/bin/env node
/**
 * Analytics CLI - DailyDealFeed Click Tracking
 * 
 * Process and report on embed page click data.
 * 
 * Commands:
 *   --report    Show click summary
 *   --export    Export to CSV
 *   --clear     Clear old data (>90 days)
 *   --simulate  Generate sample data for testing
 *   --daily     Show daily breakdown
 *   --product   Show per-product metrics
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data', 'clicks');
const SUMMARY_FILE = path.join(__dirname, '..', 'data', 'click-summary.json');

// Ensure data directory exists
function ensureDataDir() {
  const dataPath = path.join(__dirname, '..', 'data');
  if (!fs.existsSync(dataPath)) fs.mkdirSync(dataPath, { recursive: true });
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

// Load all click data
function loadAllData() {
  ensureDataDir();
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  const allData = [];
  
  for (const file of files) {
    try {
      const content = JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), 'utf8'));
      if (Array.isArray(content)) {
        allData.push(...content);
      } else if (content.events) {
        allData.push(...content.events);
      }
    } catch (e) {
      console.warn(`Warning: Could not parse ${file}`);
    }
  }
  
  return allData;
}

// Load or create summary
function loadSummary() {
  ensureDataDir();
  if (fs.existsSync(SUMMARY_FILE)) {
    return JSON.parse(fs.readFileSync(SUMMARY_FILE, 'utf8'));
  }
  return {
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    totals: { views: 0, clicks: 0 },
    byProduct: {},
    byReferrer: {},
    byDevice: { mobile: 0, desktop: 0 },
    byDate: {}
  };
}

// Save summary
function saveSummary(summary) {
  ensureDataDir();
  summary.updated = new Date().toISOString();
  fs.writeFileSync(SUMMARY_FILE, JSON.stringify(summary, null, 2));
}

// Process events into summary
function processEvents(events) {
  const summary = loadSummary();
  
  for (const event of events) {
    const productId = event.p || event.product_id || 'unknown';
    const eventType = event.e || event.event || 'view';
    const referrer = event.r || event.referrer || 'direct';
    const device = event.d || event.device || 'd';
    const date = new Date(event.t || event.timestamp).toISOString().split('T')[0];
    
    // Update totals
    if (eventType === 'view') summary.totals.views++;
    if (eventType === 'click') summary.totals.clicks++;
    
    // By product
    if (!summary.byProduct[productId]) {
      summary.byProduct[productId] = { views: 0, clicks: 0 };
    }
    if (eventType === 'view') summary.byProduct[productId].views++;
    if (eventType === 'click') summary.byProduct[productId].clicks++;
    
    // By referrer
    const refDomain = referrer.replace(/^www\./, '') || 'direct';
    if (!summary.byReferrer[refDomain]) {
      summary.byReferrer[refDomain] = 0;
    }
    summary.byReferrer[refDomain]++;
    
    // By device
    if (device === 'm' || device === 'mobile') {
      summary.byDevice.mobile++;
    } else {
      summary.byDevice.desktop++;
    }
    
    // By date
    if (!summary.byDate[date]) {
      summary.byDate[date] = { views: 0, clicks: 0 };
    }
    if (eventType === 'view') summary.byDate[date].views++;
    if (eventType === 'click') summary.byDate[date].clicks++;
  }
  
  return summary;
}

// Generate sample data for testing
function generateSampleData() {
  ensureDataDir();
  const today = new Date().toISOString().split('T')[0];
  const events = [];
  
  const products = ['1', '2', '3', '7', '12', '15'];
  const referrers = ['tiktok.com', 'twitter.com', 'instagram.com', '', 'youtube.com'];
  const devices = ['m', 'd'];
  
  // Generate 100 sample events
  for (let i = 0; i < 100; i++) {
    const productId = products[Math.floor(Math.random() * products.length)];
    const sessionId = Math.random().toString(36).slice(2, 10);
    
    // View event
    events.push({
      e: 'view',
      p: productId,
      s: sessionId,
      t: Date.now() - Math.random() * 86400000 * 7, // Last 7 days
      r: referrers[Math.floor(Math.random() * referrers.length)],
      d: devices[Math.floor(Math.random() * devices.length)]
    });
    
    // 20% chance of click
    if (Math.random() < 0.2) {
      events.push({
        e: 'click',
        p: productId,
        s: sessionId,
        t: Date.now() - Math.random() * 86400000 * 7,
        r: referrers[Math.floor(Math.random() * referrers.length)],
        d: devices[Math.floor(Math.random() * devices.length)],
        duration: Math.floor(Math.random() * 120)
      });
    }
  }
  
  fs.writeFileSync(
    path.join(DATA_DIR, `${today}.json`),
    JSON.stringify(events, null, 2)
  );
  
  console.log(`✅ Generated ${events.length} sample events in data/clicks/${today}.json`);
}

// Show report
function showReport() {
  const events = loadAllData();
  const summary = processEvents(events);
  saveSummary(summary);
  
  const ctr = summary.totals.views > 0 
    ? (summary.totals.clicks / summary.totals.views * 100).toFixed(2) 
    : '0.00';
  
  console.log('\n📊 CLICK TRACKING REPORT\n');
  console.log('═'.repeat(50));
  
  console.log('\n📈 TOTALS');
  console.log(`   Views:      ${summary.totals.views.toLocaleString()}`);
  console.log(`   Clicks:     ${summary.totals.clicks.toLocaleString()}`);
  console.log(`   CTR:        ${ctr}%`);
  
  console.log('\n📱 DEVICES');
  const totalDevices = summary.byDevice.mobile + summary.byDevice.desktop;
  const mobilePercent = totalDevices > 0 
    ? (summary.byDevice.mobile / totalDevices * 100).toFixed(1) 
    : 0;
  console.log(`   Mobile:     ${summary.byDevice.mobile} (${mobilePercent}%)`);
  console.log(`   Desktop:    ${summary.byDevice.desktop} (${100 - mobilePercent}%)`);
  
  console.log('\n🔗 TOP REFERRERS');
  const sortedRefs = Object.entries(summary.byReferrer)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);
  for (const [ref, count] of sortedRefs) {
    console.log(`   ${(ref || 'direct').padEnd(20)} ${count}`);
  }
  
  console.log('\n🛍️ TOP PRODUCTS (by clicks)');
  const sortedProducts = Object.entries(summary.byProduct)
    .sort((a, b) => b[1].clicks - a[1].clicks)
    .slice(0, 5);
  console.log('   ' + ['Product', 'Views', 'Clicks', 'CTR'].map(h => h.padEnd(10)).join(''));
  console.log('   ' + '-'.repeat(40));
  for (const [productId, metrics] of sortedProducts) {
    const productCtr = metrics.views > 0 
      ? (metrics.clicks / metrics.views * 100).toFixed(1) + '%'
      : '0.0%';
    console.log('   ' + [
      `#${productId}`,
      metrics.views,
      metrics.clicks,
      productCtr
    ].map(v => String(v).padEnd(10)).join(''));
  }
  
  console.log('\n═'.repeat(50));
  console.log(`Last updated: ${summary.updated}`);
  console.log(`Data files: ${fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json')).length}`);
}

// Show daily breakdown
function showDaily() {
  const events = loadAllData();
  const summary = processEvents(events);
  
  console.log('\n📅 DAILY BREAKDOWN\n');
  console.log('═'.repeat(50));
  console.log(['Date', 'Views', 'Clicks', 'CTR'].map(h => h.padEnd(12)).join(''));
  console.log('-'.repeat(50));
  
  const sortedDates = Object.entries(summary.byDate)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .slice(0, 14);
  
  for (const [date, metrics] of sortedDates) {
    const ctr = metrics.views > 0 
      ? (metrics.clicks / metrics.views * 100).toFixed(1) + '%'
      : '0.0%';
    console.log([date, metrics.views, metrics.clicks, ctr].map(v => String(v).padEnd(12)).join(''));
  }
}

// Show per-product metrics
function showProduct(productId) {
  const events = loadAllData();
  const productEvents = events.filter(e => 
    (e.p || e.product_id) === productId
  );
  
  if (productEvents.length === 0) {
    console.log(`No data found for product ${productId}`);
    return;
  }
  
  const views = productEvents.filter(e => (e.e || e.event) === 'view').length;
  const clicks = productEvents.filter(e => (e.e || e.event) === 'click').length;
  const ctr = views > 0 ? (clicks / views * 100).toFixed(2) : '0.00';
  
  console.log(`\n📦 PRODUCT #${productId}\n`);
  console.log(`   Views:   ${views}`);
  console.log(`   Clicks:  ${clicks}`);
  console.log(`   CTR:     ${ctr}%`);
  
  // Referrer breakdown
  const referrers = {};
  for (const e of productEvents) {
    const ref = e.r || e.referrer || 'direct';
    referrers[ref] = (referrers[ref] || 0) + 1;
  }
  
  console.log('\n   Referrers:');
  for (const [ref, count] of Object.entries(referrers).sort((a, b) => b[1] - a[1])) {
    console.log(`      ${(ref || 'direct').padEnd(20)} ${count}`);
  }
}

// Export to CSV
function exportCSV() {
  const events = loadAllData();
  const outputPath = path.join(__dirname, '..', 'data', 'clicks-export.csv');
  
  const rows = [['timestamp', 'event', 'product_id', 'session_id', 'referrer', 'device', 'duration']];
  
  for (const e of events) {
    rows.push([
      new Date(e.t || e.timestamp).toISOString(),
      e.e || e.event || 'view',
      e.p || e.product_id || '',
      e.s || e.session_id || '',
      e.r || e.referrer || '',
      e.d || e.device || '',
      e.duration || ''
    ]);
  }
  
  const csv = rows.map(r => r.map(c => `"${c}"`).join(',')).join('\n');
  fs.writeFileSync(outputPath, csv);
  
  console.log(`✅ Exported ${events.length} events to ${outputPath}`);
}

// Clear old data
function clearOld(daysToKeep = 90) {
  ensureDataDir();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - daysToKeep);
  const cutoffDate = cutoff.toISOString().split('T')[0];
  
  const files = fs.readdirSync(DATA_DIR).filter(f => f.endsWith('.json'));
  let removed = 0;
  
  for (const file of files) {
    const fileDate = file.replace('.json', '');
    if (fileDate < cutoffDate) {
      fs.unlinkSync(path.join(DATA_DIR, file));
      removed++;
    }
  }
  
  console.log(`✅ Removed ${removed} files older than ${daysToKeep} days`);
}

// CLI
const args = process.argv.slice(2);
const command = args[0] || '--report';

switch (command) {
  case '--report':
  case 'report':
    showReport();
    break;
    
  case '--daily':
  case 'daily':
    showDaily();
    break;
    
  case '--product':
  case 'product':
    if (!args[1]) {
      console.log('Usage: analytics.js --product <product_id>');
      process.exit(1);
    }
    showProduct(args[1]);
    break;
    
  case '--export':
  case 'export':
    exportCSV();
    break;
    
  case '--clear':
  case 'clear':
    clearOld(parseInt(args[1]) || 90);
    break;
    
  case '--simulate':
  case 'simulate':
    generateSampleData();
    break;
    
  case '--help':
  case 'help':
  default:
    console.log(`
📊 Analytics CLI - DailyDealFeed Click Tracking

Commands:
  --report           Show click summary (default)
  --daily            Show daily breakdown
  --product <id>     Show metrics for specific product
  --export           Export all data to CSV
  --clear [days]     Clear data older than N days (default: 90)
  --simulate         Generate sample test data

Examples:
  node analytics.js --report
  node analytics.js --product 7
  node analytics.js --export
  node analytics.js --clear 30
  node analytics.js --simulate
`);
}
