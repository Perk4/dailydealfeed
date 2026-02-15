#!/usr/bin/env node
/**
 * Posting Queue Manager
 * Semi-automated publishing system for DailyDealFeed videos
 * 
 * Usage:
 *   node posting-queue.js add <video_path> [--product-id <id>] [--priority high|normal|low]
 *   node posting-queue.js list [--status pending|scheduled|posted|failed]
 *   node posting-queue.js schedule <queue_id> <datetime>
 *   node posting-queue.js mark <queue_id> <status>
 *   node posting-queue.js next
 *   node posting-queue.js stats
 */

const fs = require('fs');
const path = require('path');

const QUEUE_PATH = path.join(__dirname, '..', 'posting-queue.json');
const PRODUCTS_PATH = path.join(__dirname, '..', 'products.json');
const OUTPUT_DIR = path.join(__dirname, '..', 'output');

// Initialize queue file if it doesn't exist
function initQueue() {
  if (!fs.existsSync(QUEUE_PATH)) {
    const initialQueue = {
      version: '1.0',
      created: new Date().toISOString(),
      updated: new Date().toISOString(),
      settings: {
        platforms: ['tiktok', 'instagram', 'youtube'],
        defaultPriority: 'normal',
        postsPerDay: {
          tiktok: 3,
          instagram: 2,
          youtube: 1
        },
        optimalPostTimes: {
          tiktok: ['09:00', '12:00', '19:00'],
          instagram: ['11:00', '17:00'],
          youtube: ['14:00']
        }
      },
      queue: [],
      history: []
    };
    fs.writeFileSync(QUEUE_PATH, JSON.stringify(initialQueue, null, 2));
  }
  return JSON.parse(fs.readFileSync(QUEUE_PATH, 'utf8'));
}

// Load queue
function loadQueue() {
  return initQueue();
}

// Save queue
function saveQueue(data) {
  data.updated = new Date().toISOString();
  fs.writeFileSync(QUEUE_PATH, JSON.stringify(data, null, 2));
}

// Generate unique ID
function generateId() {
  return `post_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Extract product info from video filename or metadata
function extractProductInfo(videoPath) {
  const basename = path.basename(videoPath);
  const match = basename.match(/video_(\d+)_(\d+)\.mp4/);
  if (match) {
    const productId = match[1];
    const timestamp = match[2];
    
    // Try to find matching post metadata
    const metaPath = videoPath.replace('video_', 'post_').replace('.mp4', '.json');
    if (fs.existsSync(metaPath)) {
      return JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    }
    
    // Fall back to products.json
    if (fs.existsSync(PRODUCTS_PATH)) {
      const products = JSON.parse(fs.readFileSync(PRODUCTS_PATH, 'utf8'));
      const product = products.products.find(p => p.id === productId);
      if (product) {
        return {
          productId,
          name: product.name,
          price: product.price,
          link: product.link,
          timestamp
        };
      }
    }
    
    return { productId, timestamp };
  }
  return null;
}

// Add video to queue
function addToQueue(videoPath, options = {}) {
  const data = loadQueue();
  const fullPath = path.resolve(videoPath);
  
  if (!fs.existsSync(fullPath)) {
    throw new Error(`Video file not found: ${fullPath}`);
  }
  
  // Check if already in queue
  const existing = data.queue.find(item => item.videoPath === fullPath);
  if (existing) {
    return { success: false, message: 'Video already in queue', item: existing };
  }
  
  const productInfo = extractProductInfo(fullPath);
  const stats = fs.statSync(fullPath);
  
  const item = {
    id: generateId(),
    videoPath: fullPath,
    thumbnailPath: fullPath.replace('video_', 'thumb_').replace('.mp4', '.jpg'),
    metaPath: fullPath.replace('video_', 'post_').replace('.mp4', '.json'),
    addedAt: new Date().toISOString(),
    status: 'pending',
    priority: options.priority || 'normal',
    productInfo,
    fileSize: stats.size,
    platforms: {
      tiktok: { status: 'pending', postedAt: null, url: null },
      instagram: { status: 'pending', postedAt: null, url: null },
      youtube: { status: 'pending', postedAt: null, url: null }
    },
    scheduledFor: options.scheduledFor || null,
    qaScore: options.qaScore || null,
    notes: options.notes || null
  };
  
  data.queue.push(item);
  saveQueue(data);
  
  return { success: true, message: 'Added to queue', item };
}

// List queue items
function listQueue(filters = {}) {
  const data = loadQueue();
  let items = data.queue;
  
  if (filters.status) {
    items = items.filter(item => item.status === filters.status);
  }
  
  if (filters.priority) {
    items = items.filter(item => item.priority === filters.priority);
  }
  
  if (filters.platform) {
    items = items.filter(item => 
      item.platforms[filters.platform] && 
      item.platforms[filters.platform].status === 'pending'
    );
  }
  
  // Sort by priority and date
  const priorityOrder = { high: 0, normal: 1, low: 2 };
  items.sort((a, b) => {
    if (priorityOrder[a.priority] !== priorityOrder[b.priority]) {
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    }
    return new Date(a.addedAt) - new Date(b.addedAt);
  });
  
  return items;
}

// Get next video to post
function getNext(platform = null) {
  const filters = { status: 'pending' };
  if (platform) {
    filters.platform = platform;
  }
  
  const items = listQueue(filters);
  return items.length > 0 ? items[0] : null;
}

// Schedule a post
function schedulePost(queueId, datetime) {
  const data = loadQueue();
  const item = data.queue.find(i => i.id === queueId);
  
  if (!item) {
    return { success: false, message: 'Item not found' };
  }
  
  item.scheduledFor = new Date(datetime).toISOString();
  item.status = 'scheduled';
  saveQueue(data);
  
  return { success: true, message: 'Scheduled', item };
}

// Mark platform as posted
function markPlatformPosted(queueId, platform, url = null) {
  const data = loadQueue();
  const item = data.queue.find(i => i.id === queueId);
  
  if (!item) {
    return { success: false, message: 'Item not found' };
  }
  
  if (!item.platforms[platform]) {
    return { success: false, message: `Unknown platform: ${platform}` };
  }
  
  item.platforms[platform] = {
    status: 'posted',
    postedAt: new Date().toISOString(),
    url
  };
  
  // Check if all platforms are done
  const allDone = Object.values(item.platforms).every(p => p.status !== 'pending');
  if (allDone) {
    item.status = 'completed';
    // Move to history
    data.history.push(item);
    data.queue = data.queue.filter(i => i.id !== queueId);
  }
  
  saveQueue(data);
  return { success: true, message: `Marked ${platform} as posted`, item };
}

// Update item status
function updateStatus(queueId, status, notes = null) {
  const data = loadQueue();
  const item = data.queue.find(i => i.id === queueId);
  
  if (!item) {
    return { success: false, message: 'Item not found' };
  }
  
  item.status = status;
  if (notes) {
    item.notes = notes;
  }
  
  saveQueue(data);
  return { success: true, message: `Updated to ${status}`, item };
}

// Get queue statistics
function getStats() {
  const data = loadQueue();
  
  const stats = {
    total: data.queue.length,
    byStatus: {},
    byPriority: {},
    byPlatform: {
      tiktok: { pending: 0, posted: 0 },
      instagram: { pending: 0, posted: 0 },
      youtube: { pending: 0, posted: 0 }
    },
    history: {
      total: data.history.length,
      lastPosted: data.history.length > 0 
        ? data.history[data.history.length - 1] 
        : null
    }
  };
  
  data.queue.forEach(item => {
    stats.byStatus[item.status] = (stats.byStatus[item.status] || 0) + 1;
    stats.byPriority[item.priority] = (stats.byPriority[item.priority] || 0) + 1;
    
    Object.entries(item.platforms).forEach(([platform, info]) => {
      if (info.status === 'pending') {
        stats.byPlatform[platform].pending++;
      } else if (info.status === 'posted') {
        stats.byPlatform[platform].posted++;
      }
    });
  });
  
  return stats;
}

// Scan output directory and add all videos to queue
function scanAndAddVideos() {
  const results = [];
  const files = fs.readdirSync(OUTPUT_DIR);
  
  files.filter(f => f.startsWith('video_') && f.endsWith('.mp4')).forEach(file => {
    const videoPath = path.join(OUTPUT_DIR, file);
    try {
      const result = addToQueue(videoPath);
      results.push({ file, ...result });
    } catch (err) {
      results.push({ file, success: false, message: err.message });
    }
  });
  
  return results;
}

// Generate posting schedule for today
function generateDailySchedule() {
  const data = loadQueue();
  const pendingItems = listQueue({ status: 'pending' });
  const schedule = [];
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  Object.entries(data.settings.optimalPostTimes).forEach(([platform, times]) => {
    const platformItems = pendingItems.filter(item => 
      item.platforms[platform].status === 'pending'
    );
    
    times.forEach((time, idx) => {
      if (platformItems[idx]) {
        const [hours, minutes] = time.split(':').map(Number);
        const scheduledTime = new Date(today);
        scheduledTime.setHours(hours, minutes);
        
        schedule.push({
          platform,
          time: scheduledTime.toISOString(),
          item: platformItems[idx]
        });
      }
    });
  });
  
  return schedule.sort((a, b) => new Date(a.time) - new Date(b.time));
}

// CLI interface
async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  
  switch (command) {
    case 'add': {
      const videoPath = args[1];
      const priority = args.includes('--priority') 
        ? args[args.indexOf('--priority') + 1] 
        : 'normal';
      const result = addToQueue(videoPath, { priority });
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    
    case 'scan': {
      const results = scanAndAddVideos();
      console.log(JSON.stringify(results, null, 2));
      break;
    }
    
    case 'list': {
      const status = args.includes('--status') 
        ? args[args.indexOf('--status') + 1] 
        : null;
      const items = listQueue({ status });
      console.log(JSON.stringify(items, null, 2));
      break;
    }
    
    case 'next': {
      const platform = args[1] || null;
      const next = getNext(platform);
      console.log(JSON.stringify(next, null, 2));
      break;
    }
    
    case 'schedule': {
      const queueId = args[1];
      const datetime = args[2];
      const result = schedulePost(queueId, datetime);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    
    case 'mark': {
      const queueId = args[1];
      const status = args[2];
      const result = updateStatus(queueId, status);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    
    case 'posted': {
      const queueId = args[1];
      const platform = args[2];
      const url = args[3] || null;
      const result = markPlatformPosted(queueId, platform, url);
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    
    case 'daily': {
      const schedule = generateDailySchedule();
      console.log(JSON.stringify(schedule, null, 2));
      break;
    }
    
    case 'stats': {
      const stats = getStats();
      console.log(JSON.stringify(stats, null, 2));
      break;
    }
    
    case 'init': {
      initQueue();
      console.log('Queue initialized');
      break;
    }
    
    default:
      console.log(`
DailyDealFeed Posting Queue Manager

Commands:
  add <video_path> [--priority high|normal|low]  Add video to queue
  scan                                           Scan output/ and add all videos
  list [--status pending|scheduled|posted]       List queue items
  next [platform]                                Get next video to post
  schedule <id> <datetime>                       Schedule a post
  mark <id> <status>                             Update item status
  posted <id> <platform> [url]                   Mark platform as posted
  daily                                          Generate today's posting schedule
  stats                                          Show queue statistics
  init                                           Initialize/reset queue
      `);
  }
}

// Export for use as module
module.exports = {
  loadQueue,
  saveQueue,
  addToQueue,
  listQueue,
  getNext,
  schedulePost,
  markPlatformPosted,
  updateStatus,
  getStats,
  scanAndAddVideos,
  generateDailySchedule
};

// Run CLI if called directly
if (require.main === module) {
  main().catch(console.error);
}
