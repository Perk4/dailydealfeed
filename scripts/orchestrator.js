#!/usr/bin/env node
/**
 * DailyDealFeed Orchestrator
 * 
 * Triggers parallel jobs when a new product is added:
 * 1. Amazon mobile UI recording
 * 2. Embed page generation
 * 3. Video generation
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

class Orchestrator {
  constructor() {
    this.jobs = [];
    this.results = {};
  }

  // Run a job and track it
  async runJob(name, command, args = []) {
    console.log(`🚀 Starting job: ${name}`);
    const start = Date.now();
    
    return new Promise((resolve, reject) => {
      const proc = spawn('node', [command, ...args], {
        cwd: '/root/dailydealfeed',
        stdio: 'pipe'
      });
      
      let output = '';
      proc.stdout.on('data', d => output += d);
      proc.stderr.on('data', d => output += d);
      
      proc.on('close', code => {
        const duration = ((Date.now() - start) / 1000).toFixed(1);
        this.results[name] = { code, duration, output };
        
        if (code === 0) {
          console.log(`✅ ${name} completed in ${duration}s`);
          resolve({ success: true, duration, output });
        } else {
          console.log(`❌ ${name} failed (code ${code})`);
          resolve({ success: false, code, output });
        }
      });
    });
  }

  // Process a single product through all pipelines
  async processProduct(product) {
    const { asin, name, price } = product;
    const id = product.id || this.getProductIndex(asin) + 1;
    
    console.log(`\n=== Processing: ${name} (${asin}) ===\n`);

    // Run jobs in parallel
    const jobs = await Promise.all([
      // Job 1: Amazon recording
      this.runJob('amazon-recording', 'scripts/amazon-recorder.js', [asin]),
      
      // Job 2: Generate embed page
      this.runJob('embed-page', 'scripts/generate-embed.js', [id.toString()]),
    ]);

    // Wait for recording before video generation (it's a dependency)
    const recordingResult = jobs[0];
    
    if (recordingResult.success) {
      // Job 3: Video generation (depends on recording)
      await this.runJob('video-generation', 'scripts/editor.js', ['--product-id', id.toString()]);
    } else {
      console.log('⚠️ Skipping video generation - recording failed');
    }

    return this.results;
  }

  // Get product index from manifest by ASIN
  getProductIndex(asin) {
    const manifest = JSON.parse(fs.readFileSync('staging/products/manifest.json', 'utf8'));
    return manifest.products.findIndex(p => p.asin === asin);
  }

  // Process all pending products
  async processQueue() {
    const queuePath = 'production/queue/queue.json';
    if (!fs.existsSync(queuePath)) {
      console.log('No queue found');
      return;
    }

    const queue = JSON.parse(fs.readFileSync(queuePath, 'utf8'));
    const pending = queue.items.filter(i => i.status === 'pending');

    console.log(`Found ${pending.length} pending products\n`);

    for (const item of pending.slice(0, 3)) { // Process 3 at a time
      await this.processProduct(item.product);
    }
  }

  // Generate report
  report() {
    console.log('\n=== ORCHESTRATION REPORT ===');
    for (const [job, result] of Object.entries(this.results)) {
      const status = result.code === 0 ? '✅' : '❌';
      console.log(`${status} ${job}: ${result.duration}s`);
    }
  }
}

// CLI
async function main() {
  const orchestrator = new Orchestrator();
  
  const arg = process.argv[2];
  
  if (arg === '--process-queue') {
    await orchestrator.processQueue();
  } else if (arg) {
    // Process single ASIN
    const manifest = JSON.parse(fs.readFileSync('staging/products/manifest.json', 'utf8'));
    const product = manifest.products.find(p => p.asin === arg);
    if (product) {
      await orchestrator.processProduct(product);
    } else {
      console.log(`Product not found: ${arg}`);
    }
  } else {
    console.log('Usage:');
    console.log('  node orchestrator.js <ASIN>           Process single product');
    console.log('  node orchestrator.js --process-queue  Process pending queue');
  }
  
  orchestrator.report();
}

main().catch(console.error);

module.exports = { Orchestrator };
