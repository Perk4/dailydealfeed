#!/usr/bin/env node
/**
 * Pipeline Health Check for @dailydealfeed
 * 
 * Validates system readiness for unattended video generation.
 * 
 * Usage:
 *   node healthcheck.js              Run all checks (JSON output)
 *   node healthcheck.js --verbose    Human-readable output
 *   node healthcheck.js --fix        Attempt to fix recoverable issues
 */

const fs = require('fs');
const path = require('path');
const { execSync, spawnSync } = require('child_process');

const PROJECT_DIR = path.join(__dirname, '..');
const PRODUCTION_DIR = path.join(PROJECT_DIR, 'production');
const STAGING_DIR = path.join(PROJECT_DIR, 'staging');
const OUTPUT_DIR = path.join(PROJECT_DIR, 'output');
const QUEUE_FILE = path.join(PRODUCTION_DIR, 'queue', 'queue.json');

// Thresholds
const STUCK_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes
const MIN_DISK_MB = 500; // Minimum 500MB free

/**
 * Check if ffmpeg is installed and working
 */
function checkFfmpeg() {
  try {
    const result = spawnSync('ffmpeg', ['-version'], {
      encoding: 'utf8',
      timeout: 5000,
      stdio: 'pipe'
    });
    
    if (result.status === 0) {
      const versionMatch = result.stdout.match(/ffmpeg version ([^\s]+)/);
      return {
        ok: true,
        version: versionMatch ? versionMatch[1] : 'unknown',
        message: 'ffmpeg available'
      };
    }
    return { ok: false, error: 'ffmpeg exited with error', message: 'ffmpeg not working' };
  } catch (err) {
    return { ok: false, error: err.message, message: 'ffmpeg not installed' };
  }
}

/**
 * Check if required directories exist
 */
function checkDirectories() {
  const required = [
    { path: PRODUCTION_DIR, name: 'production' },
    { path: path.join(PRODUCTION_DIR, 'queue'), name: 'production/queue' },
    { path: STAGING_DIR, name: 'staging' },
    { path: path.join(STAGING_DIR, 'products'), name: 'staging/products' },
    { path: path.join(STAGING_DIR, 'clips'), name: 'staging/clips' },
    { path: OUTPUT_DIR, name: 'output' },
    { path: path.join(OUTPUT_DIR, 'approved'), name: 'output/approved' },
  ];
  
  const missing = [];
  const present = [];
  
  for (const dir of required) {
    if (fs.existsSync(dir.path)) {
      present.push(dir.name);
    } else {
      missing.push(dir.name);
    }
  }
  
  return {
    ok: missing.length === 0,
    present,
    missing,
    message: missing.length === 0 
      ? 'All directories exist' 
      : `Missing: ${missing.join(', ')}`
  };
}

/**
 * Check if queue file is readable and valid
 */
function checkQueueFile() {
  if (!fs.existsSync(QUEUE_FILE)) {
    return { ok: false, error: 'Queue file not found', message: 'No queue.json' };
  }
  
  try {
    const content = fs.readFileSync(QUEUE_FILE, 'utf8');
    const data = JSON.parse(content);
    
    if (!data.items || !Array.isArray(data.items)) {
      return { ok: false, error: 'Invalid queue structure', message: 'Queue missing items array' };
    }
    
    const stats = {
      total: data.items.length,
      pending: data.items.filter(i => i.status === 'pending').length,
      processing: data.items.filter(i => i.status === 'in-progress').length,
      completed: data.items.filter(i => i.status === 'completed').length,
      failed: data.items.filter(i => i.status === 'failed').length,
      needsReview: data.items.filter(i => i.status === 'needs-review').length
    };
    
    return {
      ok: true,
      stats,
      createdAt: data.createdAt,
      message: `Queue valid: ${stats.total} items (${stats.pending} pending)`
    };
  } catch (err) {
    return { ok: false, error: err.message, message: 'Queue file corrupt' };
  }
}

/**
 * Check for stuck items (in-progress > 5 minutes)
 */
function checkStuckItems() {
  if (!fs.existsSync(QUEUE_FILE)) {
    return { ok: true, stuckItems: [], message: 'No queue to check' };
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    const now = Date.now();
    const stuckItems = [];
    
    for (const item of data.items || []) {
      if (item.status === 'in-progress' && item.startedAt) {
        const startTime = new Date(item.startedAt).getTime();
        const elapsed = now - startTime;
        
        if (elapsed > STUCK_THRESHOLD_MS) {
          stuckItems.push({
            id: item.id,
            asin: item.product?.asin,
            name: item.product?.name,
            startedAt: item.startedAt,
            elapsedMinutes: Math.round(elapsed / 60000)
          });
        }
      }
    }
    
    return {
      ok: stuckItems.length === 0,
      stuckItems,
      count: stuckItems.length,
      message: stuckItems.length === 0 
        ? 'No stuck items' 
        : `${stuckItems.length} items stuck in processing`
    };
  } catch (err) {
    return { ok: false, error: err.message, message: 'Error checking stuck items' };
  }
}

/**
 * Check available disk space
 */
function checkDiskSpace() {
  try {
    const result = execSync(`df -m "${PROJECT_DIR}" | tail -1`, { encoding: 'utf8' });
    const parts = result.trim().split(/\s+/);
    const availableMB = parseInt(parts[3], 10);
    const usedPercent = parts[4];
    
    return {
      ok: availableMB >= MIN_DISK_MB,
      availableMB,
      usedPercent,
      threshold: MIN_DISK_MB,
      message: availableMB >= MIN_DISK_MB
        ? `${availableMB}MB available (${usedPercent} used)`
        : `Low disk space: ${availableMB}MB (need ${MIN_DISK_MB}MB)`
    };
  } catch (err) {
    return { ok: false, error: err.message, message: 'Cannot check disk space' };
  }
}

/**
 * Check Node.js and dependencies
 */
function checkNodeDeps() {
  const issues = [];
  
  // Check node version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0], 10);
  if (majorVersion < 16) {
    issues.push(`Node.js ${nodeVersion} is old (need 16+)`);
  }
  
  // Check critical dependencies exist
  const criticalDeps = [
    path.join(__dirname, 'editor.js'),
    path.join(__dirname, 'video-qa.js'),
    path.join(__dirname, 'lib', 'logger.js')
  ];
  
  for (const dep of criticalDeps) {
    if (!fs.existsSync(dep)) {
      issues.push(`Missing: ${path.basename(dep)}`);
    }
  }
  
  return {
    ok: issues.length === 0,
    nodeVersion,
    issues,
    message: issues.length === 0 
      ? `Node ${nodeVersion} OK` 
      : issues.join('; ')
  };
}

/**
 * Check staging manifests
 */
function checkManifests() {
  const results = {
    products: { ok: false, count: 0 },
    clips: { ok: false, count: 0 }
  };
  
  // Products manifest
  const productsPath = path.join(STAGING_DIR, 'products', 'manifest.json');
  if (fs.existsSync(productsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
      const approved = (data.products || []).filter(p => p.status === 'approved');
      results.products = { ok: true, count: approved.length, total: data.products?.length || 0 };
    } catch (e) {
      results.products = { ok: false, error: e.message };
    }
  }
  
  // Clips manifest
  const clipsPath = path.join(STAGING_DIR, 'clips', 'manifest.json');
  if (fs.existsSync(clipsPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(clipsPath, 'utf8'));
      const approved = (data.clips || []).filter(c => c.status === 'approved');
      results.clips = { ok: true, count: approved.length, total: data.clips?.length || 0 };
    } catch (e) {
      results.clips = { ok: false, error: e.message };
    }
  }
  
  const ok = results.products.ok && results.clips.ok;
  return {
    ok,
    products: results.products,
    clips: results.clips,
    message: ok 
      ? `${results.products.count} products, ${results.clips.count} clips approved`
      : 'Manifest issues detected'
  };
}

/**
 * Reset stuck items to pending (for --fix mode)
 */
function fixStuckItems() {
  if (!fs.existsSync(QUEUE_FILE)) {
    return { fixed: 0, message: 'No queue file' };
  }
  
  try {
    const data = JSON.parse(fs.readFileSync(QUEUE_FILE, 'utf8'));
    const now = Date.now();
    let fixedCount = 0;
    
    for (const item of data.items || []) {
      if (item.status === 'in-progress' && item.startedAt) {
        const startTime = new Date(item.startedAt).getTime();
        const elapsed = now - startTime;
        
        if (elapsed > STUCK_THRESHOLD_MS) {
          item.status = 'pending';
          item.retryCount = (item.retryCount || 0) + 1;
          item.lastStuckRecovery = new Date().toISOString();
          delete item.startedAt;
          fixedCount++;
        }
      }
    }
    
    if (fixedCount > 0) {
      fs.writeFileSync(QUEUE_FILE, JSON.stringify(data, null, 2));
    }
    
    return { fixed: fixedCount, message: `Reset ${fixedCount} stuck items to pending` };
  } catch (err) {
    return { fixed: 0, error: err.message, message: 'Fix failed' };
  }
}

/**
 * Create missing directories (for --fix mode)
 */
function fixDirectories() {
  const dirs = [
    path.join(PRODUCTION_DIR, 'queue'),
    path.join(PRODUCTION_DIR, 'in-progress'),
    path.join(PRODUCTION_DIR, 'completed'),
    path.join(OUTPUT_DIR, 'approved'),
    path.join(OUTPUT_DIR, 'rejected')
  ];
  
  let created = 0;
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
      created++;
    }
  }
  
  return { created, message: `Created ${created} directories` };
}

/**
 * Run all health checks
 */
function runHealthCheck(options = {}) {
  const checks = {
    ffmpeg: checkFfmpeg(),
    directories: checkDirectories(),
    queueFile: checkQueueFile(),
    stuckItems: checkStuckItems(),
    diskSpace: checkDiskSpace(),
    nodeDeps: checkNodeDeps(),
    manifests: checkManifests()
  };
  
  const allOk = Object.values(checks).every(c => c.ok);
  const issues = Object.entries(checks)
    .filter(([, c]) => !c.ok)
    .map(([name, c]) => ({ check: name, message: c.message }));
  
  const report = {
    healthy: allOk,
    timestamp: new Date().toISOString(),
    checks,
    issues,
    summary: allOk ? 'All systems operational' : `${issues.length} issue(s) detected`
  };
  
  // Apply fixes if requested
  if (options.fix) {
    report.fixes = {
      directories: fixDirectories(),
      stuckItems: fixStuckItems()
    };
    
    // Re-check after fixes
    report.afterFix = {
      directories: checkDirectories(),
      stuckItems: checkStuckItems()
    };
  }
  
  return report;
}

/**
 * Format report for human reading
 */
function formatVerbose(report) {
  const lines = [
    '\n=== PIPELINE HEALTH CHECK ===',
    `Timestamp: ${report.timestamp}`,
    `Status: ${report.healthy ? '✅ HEALTHY' : '⚠️ ISSUES DETECTED'}`,
    ''
  ];
  
  for (const [name, check] of Object.entries(report.checks)) {
    const icon = check.ok ? '✅' : '❌';
    lines.push(`${icon} ${name}: ${check.message}`);
  }
  
  if (report.issues.length > 0) {
    lines.push('\n--- Issues ---');
    for (const issue of report.issues) {
      lines.push(`  • ${issue.check}: ${issue.message}`);
    }
  }
  
  if (report.fixes) {
    lines.push('\n--- Fixes Applied ---');
    for (const [name, fix] of Object.entries(report.fixes)) {
      lines.push(`  • ${name}: ${fix.message}`);
    }
  }
  
  lines.push('');
  return lines.join('\n');
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const fix = args.includes('--fix');
  
  const report = runHealthCheck({ fix });
  
  if (verbose) {
    console.log(formatVerbose(report));
  } else {
    console.log(JSON.stringify(report, null, 2));
  }
  
  process.exit(report.healthy ? 0 : 1);
}

module.exports = { runHealthCheck, fixStuckItems, checkStuckItems };
