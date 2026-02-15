#!/usr/bin/env node
/**
 * A/B Testing Framework — Hook Performance Tracker
 * @dailydealfeed
 * 
 * Features:
 * - Multiple hook variants per product
 * - Track which hooks are used in videos
 * - Record performance metrics (views, engagement, CTR)
 * - Analyze which hook patterns work best
 * - Auto-suggest winning hooks for new products
 */

const fs = require('fs');
const path = require('path');

const AB_DATA_FILE = path.join(__dirname, '..', 'ab-testing-data.json');
const SCRIPT_MAP_FILE = path.join(__dirname, 'script-map.json');

// ============================================================================
// Data Management
// ============================================================================

function loadABData() {
  if (!fs.existsSync(AB_DATA_FILE)) {
    return {
      version: '1.0',
      created: new Date().toISOString(),
      hook_variants: {},
      experiments: [],
      results: {},
      patterns: {
        // Hook pattern templates that tend to work
        transformation: ['This $X versus my disgusting $Y', 'Watch this $X destroy my $Y'],
        disbelief: ['What came out of my $X... I\'m disturbed', 'I can\'t believe this worked'],
        authority: ['The $X that $AUTHORITY won\'t shut up about', '$AUTHORITY recommended this'],
        challenge: ['$X that doesn\'t $NEGATIVE', 'Finally $X that actually works'],
        vibe: ['When the vibes finally hit different', 'POV: you discovered $X'],
        price_shock: ['This $PRICE $X changed everything', '$X for only $PRICE'],
      }
    };
  }
  return JSON.parse(fs.readFileSync(AB_DATA_FILE, 'utf8'));
}

function saveABData(data) {
  data.updated = new Date().toISOString();
  fs.writeFileSync(AB_DATA_FILE, JSON.stringify(data, null, 2));
}

function loadScriptMap() {
  return JSON.parse(fs.readFileSync(SCRIPT_MAP_FILE, 'utf8'));
}

// ============================================================================
// Hook Variant Management
// ============================================================================

function addHookVariant(productId, hook, pattern = null) {
  const data = loadABData();
  
  if (!data.hook_variants[productId]) {
    data.hook_variants[productId] = [];
  }
  
  const variant = {
    id: `${productId}-${Date.now()}`,
    hook,
    pattern: pattern || detectPattern(hook),
    created: new Date().toISOString(),
    times_used: 0,
    metrics: {
      impressions: 0,
      views: 0,
      watch_time_avg: 0,
      clicks: 0,
      conversions: 0
    }
  };
  
  data.hook_variants[productId].push(variant);
  saveABData(data);
  
  return variant;
}

function detectPattern(hook) {
  const lowerHook = hook.toLowerCase();
  
  if (lowerHook.includes('versus') || lowerHook.includes('vs') || lowerHook.includes('destroy')) {
    return 'transformation';
  }
  if (lowerHook.includes('came out') || lowerHook.includes('can\'t believe') || lowerHook.includes('disturbed')) {
    return 'disbelief';
  }
  if (lowerHook.includes('dermatologist') || lowerHook.includes('recommend') || lowerHook.includes('won\'t shut up')) {
    return 'authority';
  }
  if (lowerHook.includes('doesn\'t') || lowerHook.includes('actually') || lowerHook.includes('finally')) {
    return 'challenge';
  }
  if (lowerHook.includes('vibe') || lowerHook.includes('pov') || lowerHook.includes('aesthetic')) {
    return 'vibe';
  }
  if (/\$?\d+/.test(hook) || lowerHook.includes('bucks') || lowerHook.includes('dollar')) {
    return 'price_shock';
  }
  
  return 'other';
}

function getHookVariants(productId) {
  const data = loadABData();
  return data.hook_variants[productId] || [];
}

function selectHookForExperiment(productId, strategy = 'exploration') {
  /**
   * Select a hook variant based on strategy:
   * - 'exploration': Prefer less-tested hooks (for gathering data)
   * - 'exploitation': Prefer best-performing hooks (for maximizing results)
   * - 'epsilon_greedy': 80% best, 20% random (balanced)
   */
  const variants = getHookVariants(productId);
  
  if (variants.length === 0) {
    // Fall back to script-map default
    const scriptMap = loadScriptMap();
    return scriptMap.scripts[productId]?.hook || 'You need to see this';
  }
  
  if (strategy === 'exploration') {
    // Pick the least-tested variant
    variants.sort((a, b) => a.times_used - b.times_used);
    return variants[0].hook;
  }
  
  if (strategy === 'exploitation') {
    // Pick the best-performing variant
    variants.sort((a, b) => {
      const scoreA = calculateScore(a.metrics);
      const scoreB = calculateScore(b.metrics);
      return scoreB - scoreA;
    });
    return variants[0].hook;
  }
  
  if (strategy === 'epsilon_greedy') {
    if (Math.random() < 0.8) {
      // Exploit: pick best
      variants.sort((a, b) => calculateScore(b.metrics) - calculateScore(a.metrics));
      return variants[0].hook;
    } else {
      // Explore: pick random
      return variants[Math.floor(Math.random() * variants.length)].hook;
    }
  }
  
  return variants[0].hook;
}

function calculateScore(metrics) {
  /**
   * Composite score weighted by engagement importance
   * Higher = better performing hook
   */
  if (metrics.impressions === 0) return 0;
  
  const viewRate = metrics.views / Math.max(metrics.impressions, 1);
  const ctr = metrics.clicks / Math.max(metrics.views, 1);
  const conversionRate = metrics.conversions / Math.max(metrics.clicks, 1);
  
  // Weighted composite: views matter most for hooks (they grab attention)
  return (viewRate * 0.5) + (ctr * 0.3) + (conversionRate * 0.2);
}

// ============================================================================
// Experiment Tracking
// ============================================================================

function createExperiment(productId, hookVariantId, videoId) {
  const data = loadABData();
  
  const experiment = {
    id: `exp-${Date.now()}`,
    product_id: productId,
    hook_variant_id: hookVariantId,
    video_id: videoId,
    created: new Date().toISOString(),
    status: 'active',
    platforms: {},
    metrics: {
      impressions: 0,
      views: 0,
      watch_time_avg: 0,
      clicks: 0,
      conversions: 0
    }
  };
  
  data.experiments.push(experiment);
  
  // Increment times_used for the variant
  for (const variants of Object.values(data.hook_variants)) {
    const variant = variants.find(v => v.id === hookVariantId);
    if (variant) {
      variant.times_used++;
      break;
    }
  }
  
  saveABData(data);
  return experiment;
}

function recordMetrics(experimentId, platform, metrics) {
  /**
   * Record performance metrics for an experiment
   * 
   * metrics: {
   *   impressions: number,
   *   views: number,
   *   watch_time_avg: number (seconds),
   *   clicks: number,
   *   conversions: number
   * }
   */
  const data = loadABData();
  const experiment = data.experiments.find(e => e.id === experimentId);
  
  if (!experiment) {
    return { error: `Experiment ${experimentId} not found` };
  }
  
  // Update platform-specific metrics
  experiment.platforms[platform] = {
    ...metrics,
    recorded_at: new Date().toISOString()
  };
  
  // Update aggregate metrics
  const allPlatforms = Object.values(experiment.platforms);
  experiment.metrics = {
    impressions: allPlatforms.reduce((sum, p) => sum + (p.impressions || 0), 0),
    views: allPlatforms.reduce((sum, p) => sum + (p.views || 0), 0),
    watch_time_avg: allPlatforms.reduce((sum, p) => sum + (p.watch_time_avg || 0), 0) / allPlatforms.length,
    clicks: allPlatforms.reduce((sum, p) => sum + (p.clicks || 0), 0),
    conversions: allPlatforms.reduce((sum, p) => sum + (p.conversions || 0), 0)
  };
  
  // Update the hook variant's aggregate metrics
  for (const variants of Object.values(data.hook_variants)) {
    const variant = variants.find(v => v.id === experiment.hook_variant_id);
    if (variant) {
      // Add to running totals
      variant.metrics.impressions += (metrics.impressions || 0);
      variant.metrics.views += (metrics.views || 0);
      variant.metrics.clicks += (metrics.clicks || 0);
      variant.metrics.conversions += (metrics.conversions || 0);
      // Running average for watch time
      variant.metrics.watch_time_avg = (
        (variant.metrics.watch_time_avg * (variant.times_used - 1)) + (metrics.watch_time_avg || 0)
      ) / variant.times_used;
      break;
    }
  }
  
  saveABData(data);
  return experiment;
}

// ============================================================================
// Analysis & Insights
// ============================================================================

function analyzePatterns() {
  /**
   * Analyze which hook patterns perform best across all products
   */
  const data = loadABData();
  const patternStats = {};
  
  for (const [productId, variants] of Object.entries(data.hook_variants)) {
    for (const variant of variants) {
      const pattern = variant.pattern || 'other';
      
      if (!patternStats[pattern]) {
        patternStats[pattern] = {
          pattern,
          total_uses: 0,
          total_impressions: 0,
          total_views: 0,
          total_clicks: 0,
          total_conversions: 0,
          avg_score: 0,
          hooks: []
        };
      }
      
      const stats = patternStats[pattern];
      stats.total_uses += variant.times_used;
      stats.total_impressions += variant.metrics.impressions;
      stats.total_views += variant.metrics.views;
      stats.total_clicks += variant.metrics.clicks;
      stats.total_conversions += variant.metrics.conversions;
      stats.hooks.push({
        hook: variant.hook,
        product_id: productId,
        score: calculateScore(variant.metrics)
      });
    }
  }
  
  // Calculate average scores
  for (const stats of Object.values(patternStats)) {
    if (stats.hooks.length > 0) {
      stats.avg_score = stats.hooks.reduce((sum, h) => sum + h.score, 0) / stats.hooks.length;
    }
    stats.hooks.sort((a, b) => b.score - a.score);
  }
  
  return Object.values(patternStats).sort((a, b) => b.avg_score - a.avg_score);
}

function getWinningHooks(productId) {
  /**
   * Get the best-performing hooks for a product
   */
  const variants = getHookVariants(productId);
  
  return variants
    .map(v => ({
      hook: v.hook,
      pattern: v.pattern,
      score: calculateScore(v.metrics),
      times_used: v.times_used,
      metrics: v.metrics
    }))
    .sort((a, b) => b.score - a.score);
}

function suggestHooks(productName, category) {
  /**
   * Suggest hook variants based on winning patterns
   */
  const patterns = analyzePatterns();
  const suggestions = [];
  
  // Use top 3 performing patterns
  const topPatterns = patterns.slice(0, 3);
  
  for (const patternStats of topPatterns) {
    const data = loadABData();
    const templates = data.patterns[patternStats.pattern] || [];
    
    for (const template of templates) {
      const hook = template
        .replace('$X', productName)
        .replace('$Y', category)
        .replace('$AUTHORITY', 'experts')
        .replace('$NEGATIVE', 'suck')
        .replace('$PRICE', '$20');
      
      suggestions.push({
        hook,
        pattern: patternStats.pattern,
        pattern_score: patternStats.avg_score,
        confidence: patternStats.total_uses > 5 ? 'high' : 'low'
      });
    }
  }
  
  return suggestions;
}

function generateReport() {
  /**
   * Generate a comprehensive A/B testing report
   */
  const data = loadABData();
  const patterns = analyzePatterns();
  
  const report = {
    generated: new Date().toISOString(),
    summary: {
      total_variants: Object.values(data.hook_variants).flat().length,
      total_experiments: data.experiments.length,
      active_experiments: data.experiments.filter(e => e.status === 'active').length,
      patterns_tested: patterns.length
    },
    top_patterns: patterns.slice(0, 5).map(p => ({
      pattern: p.pattern,
      avg_score: p.avg_score.toFixed(3),
      uses: p.total_uses,
      best_hook: p.hooks[0]?.hook || 'N/A'
    })),
    product_insights: {},
    recommendations: []
  };
  
  // Product-level insights
  for (const [productId, variants] of Object.entries(data.hook_variants)) {
    const sorted = variants.sort((a, b) => calculateScore(b.metrics) - calculateScore(a.metrics));
    report.product_insights[productId] = {
      variants_tested: variants.length,
      best_hook: sorted[0]?.hook || 'N/A',
      best_score: calculateScore(sorted[0]?.metrics || {}).toFixed(3),
      needs_more_data: variants.every(v => v.times_used < 3)
    };
  }
  
  // Generate recommendations
  if (patterns.length > 0) {
    report.recommendations.push(
      `Focus on "${patterns[0].pattern}" hooks - they perform ${(patterns[0].avg_score * 100).toFixed(0)}% better on average`
    );
  }
  
  const needsData = Object.entries(report.product_insights)
    .filter(([id, info]) => info.needs_more_data)
    .map(([id]) => id);
  
  if (needsData.length > 0) {
    report.recommendations.push(
      `Products ${needsData.join(', ')} need more A/B tests for reliable insights`
    );
  }
  
  return report;
}

// ============================================================================
// Initialize from existing scripts
// ============================================================================

function initializeFromScriptMap() {
  /**
   * Bootstrap A/B data from existing script-map.json
   */
  const scriptMap = loadScriptMap();
  const data = loadABData();
  
  let added = 0;
  
  for (const [productId, script] of Object.entries(scriptMap.scripts)) {
    if (!data.hook_variants[productId]) {
      data.hook_variants[productId] = [];
    }
    
    // Check if this hook already exists
    const exists = data.hook_variants[productId].some(v => v.hook === script.hook);
    
    if (!exists && script.hook) {
      data.hook_variants[productId].push({
        id: `${productId}-initial`,
        hook: script.hook,
        pattern: detectPattern(script.hook),
        created: new Date().toISOString(),
        times_used: 1, // Assume used at least once
        metrics: {
          impressions: 0,
          views: 0,
          watch_time_avg: 0,
          clicks: 0,
          conversions: 0
        },
        source: 'script-map-initial'
      });
      added++;
    }
  }
  
  saveABData(data);
  return { added, total: Object.values(data.hook_variants).flat().length };
}

// ============================================================================
// CLI
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'init':
      const initResult = initializeFromScriptMap();
      console.log(`Initialized A/B testing: ${initResult.added} hooks added (${initResult.total} total)`);
      break;
      
    case 'add':
      const productId = args[1];
      const hook = args.slice(2).join(' ');
      if (!productId || !hook) {
        console.error('Usage: ab-testing.js add <product_id> <hook text>');
        process.exit(1);
      }
      const variant = addHookVariant(productId, hook);
      console.log('Added hook variant:', JSON.stringify(variant, null, 2));
      break;
      
    case 'variants':
      const pid = args[1];
      if (!pid) {
        // Show all variants
        const data = loadABData();
        console.log(JSON.stringify(data.hook_variants, null, 2));
      } else {
        const variants = getHookVariants(pid);
        console.log(JSON.stringify(variants, null, 2));
      }
      break;
      
    case 'select':
      const selPid = args[1];
      const strategy = args[2] || 'epsilon_greedy';
      const selected = selectHookForExperiment(selPid, strategy);
      console.log(`Selected hook (${strategy}):`, selected);
      break;
      
    case 'analyze':
      const patterns = analyzePatterns();
      console.log('Pattern Analysis:');
      console.log(JSON.stringify(patterns, null, 2));
      break;
      
    case 'winners':
      const winPid = args[1];
      if (!winPid) {
        console.error('Usage: ab-testing.js winners <product_id>');
        process.exit(1);
      }
      const winners = getWinningHooks(winPid);
      console.log('Winning hooks:', JSON.stringify(winners, null, 2));
      break;
      
    case 'suggest':
      const name = args[1] || 'Product';
      const category = args[2] || 'cleaning';
      const suggestions = suggestHooks(name, category);
      console.log('Suggested hooks:', JSON.stringify(suggestions, null, 2));
      break;
      
    case 'report':
      const report = generateReport();
      console.log(JSON.stringify(report, null, 2));
      break;
      
    case 'record':
      const expId = args[1];
      const platform = args[2];
      const metricsJson = args[3];
      if (!expId || !platform || !metricsJson) {
        console.error('Usage: ab-testing.js record <experiment_id> <platform> <metrics_json>');
        process.exit(1);
      }
      const metrics = JSON.parse(metricsJson);
      const updated = recordMetrics(expId, platform, metrics);
      console.log('Updated experiment:', JSON.stringify(updated, null, 2));
      break;
      
    case 'help':
    default:
      console.log(`
A/B Testing Framework — Hook Performance Tracker

Usage:
  ab-testing.js init                     Initialize from script-map.json
  ab-testing.js add <pid> <hook>         Add new hook variant
  ab-testing.js variants [pid]           List hook variants
  ab-testing.js select <pid> [strategy]  Select hook for experiment
  ab-testing.js analyze                  Analyze pattern performance
  ab-testing.js winners <pid>            Get winning hooks for product
  ab-testing.js suggest <name> <cat>     Suggest hooks based on patterns
  ab-testing.js report                   Generate full report
  ab-testing.js record <exp> <plat> {}   Record metrics for experiment

Strategies:
  exploration    - Prefer less-tested hooks (gather data)
  exploitation   - Prefer best-performing hooks (maximize)
  epsilon_greedy - 80% best, 20% random (balanced)

Examples:
  ./ab-testing.js init
  ./ab-testing.js add 3 "POV: you discovered the Pink Stuff"
  ./ab-testing.js select 3 exploration
  ./ab-testing.js analyze
`);
  }
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = {
  loadABData,
  saveABData,
  addHookVariant,
  getHookVariants,
  selectHookForExperiment,
  createExperiment,
  recordMetrics,
  analyzePatterns,
  getWinningHooks,
  suggestHooks,
  generateReport,
  initializeFromScriptMap,
  detectPattern,
  calculateScore
};
