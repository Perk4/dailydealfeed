#!/usr/bin/env node
/**
 * Analytics Dashboard - DailyDealFeed
 * 
 * Track views, clicks, conversions across platforms.
 * Integrates with posting-queue.json and ab-testing-data.json
 * 
 * Commands:
 *   summary       - Overview of all metrics
 *   videos        - Per-video performance breakdown
 *   platforms     - Platform comparison (TikTok vs Instagram vs YouTube)
 *   products      - Product performance ranking
 *   hooks         - Hook pattern performance
 *   trends        - Time-based trends (daily/weekly)
 *   record        - Record metrics for a video
 *   export        - Export to CSV
 *   roi           - ROI and conversion analysis
 */

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..');
const ANALYTICS_FILE = path.join(DATA_DIR, 'analytics-data.json');
const POSTING_QUEUE_FILE = path.join(DATA_DIR, 'posting-queue.json');
const AB_TESTING_FILE = path.join(DATA_DIR, 'ab-testing-data.json');

// Initialize analytics data structure
function initData() {
  return {
    version: '1.0',
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    videos: {},  // videoId -> metrics per platform
    daily: {},   // YYYY-MM-DD -> aggregated metrics
    products: {}, // productId -> lifetime metrics
    platforms: { // Platform-level aggregates
      tiktok: createMetrics(),
      instagram: createMetrics(),
      youtube: createMetrics()
    },
    conversions: [], // Tracked affiliate conversions
    goals: {
      dailyViews: 10000,
      clickRate: 0.02,  // 2%
      conversionRate: 0.01  // 1%
    }
  };
}

function createMetrics() {
  return {
    impressions: 0,
    views: 0,
    likes: 0,
    comments: 0,
    shares: 0,
    saves: 0,
    clicks: 0,
    conversions: 0,
    revenue: 0,
    watchTimeSeconds: 0,
    videosPosted: 0
  };
}

function loadData() {
  if (fs.existsSync(ANALYTICS_FILE)) {
    return JSON.parse(fs.readFileSync(ANALYTICS_FILE, 'utf-8'));
  }
  return initData();
}

function saveData(data) {
  data.updated = new Date().toISOString();
  fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(data, null, 2));
}

function loadPostingQueue() {
  if (fs.existsSync(POSTING_QUEUE_FILE)) {
    return JSON.parse(fs.readFileSync(POSTING_QUEUE_FILE, 'utf-8'));
  }
  return { queue: [] };
}

function loadABTesting() {
  if (fs.existsSync(AB_TESTING_FILE)) {
    return JSON.parse(fs.readFileSync(AB_TESTING_FILE, 'utf-8'));
  }
  return { hook_variants: {}, experiments: [] };
}

// Calculate derived metrics
function calcDerived(metrics) {
  const ctr = metrics.views > 0 ? (metrics.clicks / metrics.views * 100).toFixed(2) : '0.00';
  const cvr = metrics.clicks > 0 ? (metrics.conversions / metrics.clicks * 100).toFixed(2) : '0.00';
  const engRate = metrics.views > 0 
    ? ((metrics.likes + metrics.comments + metrics.shares + metrics.saves) / metrics.views * 100).toFixed(2) 
    : '0.00';
  const avgWatchTime = metrics.views > 0 
    ? (metrics.watchTimeSeconds / metrics.views).toFixed(1) 
    : '0.0';
  const rpc = metrics.clicks > 0 ? (metrics.revenue / metrics.clicks).toFixed(2) : '0.00';
  
  return { ctr, cvr, engRate, avgWatchTime, rpc };
}

// Commands
function cmdSummary(data) {
  console.log('\n📊 ANALYTICS DASHBOARD - SUMMARY\n');
  console.log('='.repeat(50));
  
  // Aggregate all platform metrics
  const total = createMetrics();
  for (const platform of Object.keys(data.platforms)) {
    const p = data.platforms[platform];
    for (const key of Object.keys(total)) {
      total[key] += p[key];
    }
  }
  
  const derived = calcDerived(total);
  
  console.log('\n📈 TOTAL METRICS');
  console.log(`   Videos Posted:    ${total.videosPosted}`);
  console.log(`   Total Views:      ${total.views.toLocaleString()}`);
  console.log(`   Total Likes:      ${total.likes.toLocaleString()}`);
  console.log(`   Total Comments:   ${total.comments.toLocaleString()}`);
  console.log(`   Total Shares:     ${total.shares.toLocaleString()}`);
  console.log(`   Total Saves:      ${total.saves.toLocaleString()}`);
  console.log(`   Total Clicks:     ${total.clicks.toLocaleString()}`);
  console.log(`   Conversions:      ${total.conversions}`);
  console.log(`   Revenue:          $${total.revenue.toFixed(2)}`);
  
  console.log('\n📉 KEY RATES');
  console.log(`   Click-Through:    ${derived.ctr}%`);
  console.log(`   Conversion Rate:  ${derived.cvr}%`);
  console.log(`   Engagement Rate:  ${derived.engRate}%`);
  console.log(`   Avg Watch Time:   ${derived.avgWatchTime}s`);
  console.log(`   Revenue/Click:    $${derived.rpc}`);
  
  // Goal progress
  console.log('\n🎯 GOAL PROGRESS');
  const dailyViewProgress = total.views > 0 
    ? Math.min((total.views / data.goals.dailyViews * 100), 100).toFixed(0) 
    : 0;
  const ctrProgress = derived.ctr > 0 
    ? Math.min((parseFloat(derived.ctr) / (data.goals.clickRate * 100) * 100), 100).toFixed(0) 
    : 0;
  console.log(`   Daily Views:      ${dailyViewProgress}% of ${data.goals.dailyViews.toLocaleString()}`);
  console.log(`   Click Rate:       ${ctrProgress}% of ${(data.goals.clickRate * 100)}%`);
  
  console.log('\n' + '='.repeat(50));
  console.log(`Last updated: ${data.updated}`);
}

function cmdPlatforms(data) {
  console.log('\n📱 PLATFORM COMPARISON\n');
  console.log('='.repeat(70));
  
  const platforms = ['tiktok', 'instagram', 'youtube'];
  const headers = ['Metric', 'TikTok', 'Instagram', 'YouTube'];
  
  console.log(headers.map(h => h.padEnd(16)).join(''));
  console.log('-'.repeat(70));
  
  const metrics = ['views', 'likes', 'comments', 'shares', 'clicks', 'conversions', 'revenue'];
  for (const metric of metrics) {
    const row = [metric.charAt(0).toUpperCase() + metric.slice(1)];
    for (const platform of platforms) {
      const val = data.platforms[platform][metric];
      if (metric === 'revenue') {
        row.push('$' + val.toFixed(2));
      } else {
        row.push(val.toLocaleString());
      }
    }
    console.log(row.map(r => String(r).padEnd(16)).join(''));
  }
  
  console.log('-'.repeat(70));
  
  // Derived rates
  console.log('\n📊 PERFORMANCE RATES\n');
  console.log(['Rate', 'TikTok', 'Instagram', 'YouTube'].map(h => h.padEnd(16)).join(''));
  console.log('-'.repeat(70));
  
  for (const rate of ['ctr', 'cvr', 'engRate']) {
    const row = [rate === 'ctr' ? 'CTR' : rate === 'cvr' ? 'CVR' : 'Engagement'];
    for (const platform of platforms) {
      const derived = calcDerived(data.platforms[platform]);
      row.push(derived[rate] + '%');
    }
    console.log(row.map(r => String(r).padEnd(16)).join(''));
  }
}

function cmdVideos(data) {
  console.log('\n🎬 VIDEO PERFORMANCE\n');
  console.log('='.repeat(90));
  
  const videos = Object.entries(data.videos);
  if (videos.length === 0) {
    console.log('No video metrics recorded yet. Use: analytics record <videoId> <platform> <metrics>');
    return;
  }
  
  // Sort by total views
  videos.sort((a, b) => {
    const viewsA = Object.values(a[1]).reduce((sum, p) => sum + (p.views || 0), 0);
    const viewsB = Object.values(b[1]).reduce((sum, p) => sum + (p.views || 0), 0);
    return viewsB - viewsA;
  });
  
  console.log(['Video ID', 'Platform', 'Views', 'Likes', 'CTR', 'Revenue'].map(h => h.padEnd(15)).join(''));
  console.log('-'.repeat(90));
  
  for (const [videoId, platforms] of videos) {
    for (const [platform, metrics] of Object.entries(platforms)) {
      const derived = calcDerived(metrics);
      console.log([
        videoId.slice(0, 14),
        platform,
        metrics.views.toLocaleString(),
        metrics.likes.toLocaleString(),
        derived.ctr + '%',
        '$' + metrics.revenue.toFixed(2)
      ].map(r => String(r).padEnd(15)).join(''));
    }
  }
}

function cmdProducts(data) {
  console.log('\n🛍️ PRODUCT PERFORMANCE\n');
  console.log('='.repeat(80));
  
  const postingQueue = loadPostingQueue();
  
  // Aggregate by product from queue
  const products = {};
  for (const post of postingQueue.queue) {
    const productId = post.productInfo?.product_id;
    if (!productId) continue;
    
    if (!products[productId]) {
      products[productId] = {
        name: post.productInfo.product_name?.slice(0, 30) || 'Unknown',
        price: post.productInfo.product_price || '?',
        hook: post.productInfo.hook_angle?.slice(0, 40) || '',
        videos: 0,
        ...createMetrics()
      };
    }
    products[productId].videos++;
    
    // Pull metrics from analytics if available
    const videoId = path.basename(post.videoPath, '.mp4');
    if (data.videos[videoId]) {
      for (const platformMetrics of Object.values(data.videos[videoId])) {
        for (const key of Object.keys(createMetrics())) {
          products[productId][key] += platformMetrics[key] || 0;
        }
      }
    }
  }
  
  // Sort by views
  const sorted = Object.entries(products).sort((a, b) => b[1].views - a[1].views);
  
  console.log(['ID', 'Product', 'Price', 'Videos', 'Views', 'Clicks', 'Rev'].map(h => h.padEnd(12)).join(''));
  console.log('-'.repeat(80));
  
  for (const [id, p] of sorted) {
    console.log([
      id,
      p.name.slice(0, 10),
      p.price,
      p.videos,
      p.views.toLocaleString(),
      p.clicks,
      '$' + p.revenue.toFixed(2)
    ].map(r => String(r).padEnd(12)).join(''));
  }
}

function cmdHooks(data) {
  console.log('\n🎣 HOOK PATTERN PERFORMANCE\n');
  console.log('='.repeat(70));
  
  const abData = loadABTesting();
  
  // Aggregate metrics by pattern
  const patterns = {};
  for (const [productId, variants] of Object.entries(abData.hook_variants)) {
    for (const variant of variants) {
      const pattern = variant.pattern || 'other';
      if (!patterns[pattern]) {
        patterns[pattern] = { count: 0, ...createMetrics() };
      }
      patterns[pattern].count++;
      for (const key of Object.keys(createMetrics())) {
        patterns[pattern][key] += variant.metrics?.[key] || 0;
      }
    }
  }
  
  console.log(['Pattern', 'Hooks', 'Views', 'CTR', 'Best For'].map(h => h.padEnd(16)).join(''));
  console.log('-'.repeat(70));
  
  const patternDescriptions = {
    transformation: 'Before/after, cleaning',
    disbelief: 'Shocking reveals',
    authority: 'Expert endorsements',
    challenge: 'Problem-solving',
    vibe: 'Aesthetic, mood',
    price_shock: 'Budget finds',
    other: 'Miscellaneous'
  };
  
  for (const [pattern, metrics] of Object.entries(patterns)) {
    const derived = calcDerived(metrics);
    console.log([
      pattern,
      metrics.count,
      metrics.views.toLocaleString(),
      derived.ctr + '%',
      patternDescriptions[pattern] || ''
    ].map(r => String(r).padEnd(16)).join(''));
  }
}

function cmdTrends(data) {
  console.log('\n📈 TREND ANALYSIS\n');
  console.log('='.repeat(60));
  
  const days = Object.entries(data.daily).sort((a, b) => b[0].localeCompare(a[0]));
  
  if (days.length === 0) {
    console.log('No daily data recorded yet. Metrics will appear after posting and recording.');
    return;
  }
  
  console.log(['Date', 'Views', 'Clicks', 'CTR', 'Revenue'].map(h => h.padEnd(12)).join(''));
  console.log('-'.repeat(60));
  
  for (const [date, metrics] of days.slice(0, 14)) {
    const derived = calcDerived(metrics);
    console.log([
      date,
      metrics.views.toLocaleString(),
      metrics.clicks,
      derived.ctr + '%',
      '$' + metrics.revenue.toFixed(2)
    ].map(r => String(r).padEnd(12)).join(''));
  }
}

function cmdRecord(data, args) {
  if (args.length < 3) {
    console.log('Usage: analytics record <videoId> <platform> \'<json metrics>\'');
    console.log('Example: analytics record video_3_123 tiktok \'{"views":1000,"likes":50,"clicks":10}\'');
    return;
  }
  
  const [videoId, platform, metricsJson] = args;
  let metrics;
  try {
    metrics = JSON.parse(metricsJson);
  } catch (e) {
    console.error('Invalid JSON metrics:', e.message);
    return;
  }
  
  // Initialize video entry if needed
  if (!data.videos[videoId]) {
    data.videos[videoId] = {};
  }
  if (!data.videos[videoId][platform]) {
    data.videos[videoId][platform] = createMetrics();
  }
  
  // Merge metrics
  for (const [key, value] of Object.entries(metrics)) {
    if (key in data.videos[videoId][platform]) {
      data.videos[videoId][platform][key] = value;
    }
  }
  
  // Update platform totals
  for (const [key, value] of Object.entries(metrics)) {
    if (key in data.platforms[platform]) {
      data.platforms[platform][key] += value;
    }
  }
  
  // Update daily totals
  const today = new Date().toISOString().split('T')[0];
  if (!data.daily[today]) {
    data.daily[today] = createMetrics();
  }
  for (const [key, value] of Object.entries(metrics)) {
    if (key in data.daily[today]) {
      data.daily[today][key] += value;
    }
  }
  
  saveData(data);
  console.log(`✅ Recorded metrics for ${videoId} on ${platform}`);
  console.log(JSON.stringify(metrics, null, 2));
}

function cmdROI(data) {
  console.log('\n💰 ROI & CONVERSION ANALYSIS\n');
  console.log('='.repeat(60));
  
  const total = createMetrics();
  for (const platform of Object.keys(data.platforms)) {
    for (const key of Object.keys(total)) {
      total[key] += data.platforms[platform][key];
    }
  }
  
  // Estimated costs (adjustable)
  const costs = {
    ttsPerVideo: 0.05,  // Estimated TTS cost
    hostingPerMonth: 0,
    timePerVideoMinutes: 5
  };
  
  const videosPosted = total.videosPosted || 1;
  const totalCost = videosPosted * costs.ttsPerVideo;
  const profit = total.revenue - totalCost;
  const roiPercent = totalCost > 0 ? ((profit / totalCost) * 100).toFixed(0) : 0;
  
  console.log('💵 REVENUE');
  console.log(`   Affiliate Revenue:  $${total.revenue.toFixed(2)}`);
  console.log(`   Total Conversions:  ${total.conversions}`);
  
  console.log('\n💸 COSTS (estimated)');
  console.log(`   TTS Costs:          $${(videosPosted * costs.ttsPerVideo).toFixed(2)}`);
  console.log(`   Time Investment:    ${(videosPosted * costs.timePerVideoMinutes / 60).toFixed(1)} hours`);
  
  console.log('\n📊 ROI');
  console.log(`   Net Profit:         $${profit.toFixed(2)}`);
  console.log(`   ROI:                ${roiPercent}%`);
  console.log(`   Revenue/Video:      $${(total.revenue / videosPosted).toFixed(2)}`);
  
  // Funnel analysis
  console.log('\n🔄 CONVERSION FUNNEL');
  const funnel = [
    ['Impressions', total.impressions],
    ['Views', total.views],
    ['Engagements', total.likes + total.comments + total.shares],
    ['Clicks', total.clicks],
    ['Conversions', total.conversions]
  ];
  
  for (let i = 0; i < funnel.length; i++) {
    const [stage, count] = funnel[i];
    const dropoff = i > 0 && funnel[i-1][1] > 0 
      ? ((1 - count / funnel[i-1][1]) * 100).toFixed(0) + '% drop'
      : '';
    console.log(`   ${stage.padEnd(15)} ${String(count).padStart(8)}  ${dropoff}`);
  }
}

function cmdExport(data) {
  const outputPath = path.join(DATA_DIR, 'analytics-export.csv');
  const rows = [['VideoID', 'Platform', 'Views', 'Likes', 'Comments', 'Shares', 'Clicks', 'Conversions', 'Revenue']];
  
  for (const [videoId, platforms] of Object.entries(data.videos)) {
    for (const [platform, metrics] of Object.entries(platforms)) {
      rows.push([
        videoId,
        platform,
        metrics.views,
        metrics.likes,
        metrics.comments,
        metrics.shares,
        metrics.clicks,
        metrics.conversions,
        metrics.revenue
      ]);
    }
  }
  
  const csv = rows.map(r => r.join(',')).join('\n');
  fs.writeFileSync(outputPath, csv);
  console.log(`✅ Exported to ${outputPath}`);
}

function cmdInit(data) {
  // Sync with posting queue
  const postingQueue = loadPostingQueue();
  
  for (const post of postingQueue.queue) {
    const videoId = path.basename(post.videoPath, '.mp4');
    if (!data.videos[videoId]) {
      data.videos[videoId] = {};
      for (const platform of ['tiktok', 'instagram', 'youtube']) {
        if (post.platforms[platform]?.status === 'posted') {
          data.videos[videoId][platform] = createMetrics();
          data.videos[videoId][platform].videosPosted = 1;
          data.platforms[platform].videosPosted++;
        }
      }
    }
  }
  
  saveData(data);
  console.log('✅ Analytics initialized from posting queue');
  console.log(`   Videos tracked: ${Object.keys(data.videos).length}`);
}

// Main
const args = process.argv.slice(2);
const command = args[0] || 'summary';
const data = loadData();

switch (command) {
  case 'summary':
    cmdSummary(data);
    break;
  case 'platforms':
    cmdPlatforms(data);
    break;
  case 'videos':
    cmdVideos(data);
    break;
  case 'products':
    cmdProducts(data);
    break;
  case 'hooks':
    cmdHooks(data);
    break;
  case 'trends':
    cmdTrends(data);
    break;
  case 'record':
    cmdRecord(data, args.slice(1));
    break;
  case 'roi':
    cmdROI(data);
    break;
  case 'export':
    cmdExport(data);
    break;
  case 'init':
    cmdInit(data);
    break;
  default:
    console.log(`
📊 Analytics Dashboard - DailyDealFeed

Commands:
  summary      Overview of all metrics
  platforms    Platform comparison (TikTok vs Instagram vs YouTube)
  videos       Per-video performance breakdown
  products     Product performance ranking
  hooks        Hook pattern performance
  trends       Time-based trends (daily/weekly)
  record       Record metrics: record <videoId> <platform> '<json>'
  roi          ROI and conversion analysis
  export       Export to CSV
  init         Initialize from posting queue

Examples:
  node analytics-dashboard.js summary
  node analytics-dashboard.js record video_3_123 tiktok '{"views":1000,"likes":50}'
  node analytics-dashboard.js platforms
`);
}
