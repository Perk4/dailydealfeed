/**
 * Amazon Mobile Screen Recorder
 * Records Amazon product page scrolling through product images
 * Creates authentic mobile-native video content for TikTok/Reels
 * 
 * Anti-detection features:
 * - playwright-extra with stealth plugin
 * - Random delays between actions
 * - Realistic mouse movements
 * - Rotating mobile user agents
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Enable stealth mode
chromium.use(StealthPlugin());

const TEMP_DIR = path.join(__dirname, '../temp');
const OUTPUT_DIR = path.join(__dirname, '../output');

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

// Mobile user agents pool - rotate for anti-detection
const MOBILE_USER_AGENTS = [
  // iPhone 14 Pro
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  // iPhone 15
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1',
  // iPhone 14
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  // iPhone 13
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.5 Mobile/15E148 Safari/604.1',
  // Samsung Galaxy S23
  'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
  // Pixel 8
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.6099.144 Mobile Safari/537.36',
];

/**
 * Get random delay between min and max milliseconds
 */
function randomDelay(min = 500, max = 2000) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/**
 * Sleep for random duration
 */
async function humanDelay(min = 500, max = 2000) {
  const delay = randomDelay(min, max);
  await new Promise(resolve => setTimeout(resolve, delay));
}

/**
 * Simulate realistic mouse movement to target
 */
async function humanMouseMove(page, targetX, targetY, steps = null) {
  // Get current mouse position (start from random point if unknown)
  const startX = Math.random() * 390;
  const startY = Math.random() * 844;
  
  // Random number of steps for natural movement
  const numSteps = steps || Math.floor(Math.random() * 15) + 10;
  
  // Add some curve/randomness to the path
  for (let i = 0; i <= numSteps; i++) {
    const progress = i / numSteps;
    // Ease-out curve for natural deceleration
    const eased = 1 - Math.pow(1 - progress, 2);
    
    // Add slight randomness to path
    const jitterX = (Math.random() - 0.5) * 5;
    const jitterY = (Math.random() - 0.5) * 5;
    
    const x = startX + (targetX - startX) * eased + jitterX;
    const y = startY + (targetY - startY) * eased + jitterY;
    
    await page.mouse.move(x, y);
    await new Promise(resolve => setTimeout(resolve, randomDelay(5, 15)));
  }
  
  // Final precise move to target
  await page.mouse.move(targetX, targetY);
}

/**
 * Human-like click with mouse movement
 */
async function humanClick(page, x, y) {
  await humanMouseMove(page, x, y);
  await humanDelay(50, 150);
  await page.mouse.down();
  await humanDelay(50, 100);
  await page.mouse.up();
}

/**
 * Record Amazon product page scrolling through images
 * @param {string} asin - Amazon product ASIN
 * @param {Object} options - Recording options
 * @returns {Promise<string>} - Path to final MP4 recording
 */
async function recordAmazonProduct(asin, options = {}) {
  const {
    outputPath = path.join(OUTPUT_DIR, `amazon_${asin}_${Date.now()}.mp4`),
    duration = 6,
    numImages = 4,
    scrollDelay = 800,
    debug = false
  } = options;

  const rawRecordingDir = path.join(TEMP_DIR, `raw_${Date.now()}`);
  fs.mkdirSync(rawRecordingDir, { recursive: true });

  // Select random user agent
  const userAgent = MOBILE_USER_AGENTS[Math.floor(Math.random() * MOBILE_USER_AGENTS.length)];
  const isAndroid = userAgent.includes('Android');
  
  console.log(`🎬 Recording Amazon product: ${asin}`);
  console.log(`📱 User-Agent: ${isAndroid ? 'Android' : 'iOS'} device`);
  console.log(`📁 Output: ${outputPath}`);

  // Launch browser with stealth and mobile viewport + video recording
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-accelerated-2d-canvas',
      '--no-first-run',
      '--no-zygote',
      '--disable-gpu',
      '--window-size=390,844'
    ]
  });

  const context = await browser.newContext({
    // iPhone 14 Pro dimensions (or similar for Android)
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: userAgent,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { longitude: -73.935242, latitude: 40.730610 }, // NYC
    permissions: ['geolocation'],
    // Enable video recording
    recordVideo: {
      dir: rawRecordingDir,
      size: { width: 390, height: 844 }
    },
    // Additional browser context options for stealth
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'sec-ch-ua-mobile': '?1',
      'sec-ch-ua-platform': isAndroid ? '"Android"' : '"iOS"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    }
  });

  const page = await context.newPage();

  // Override navigator properties for extra stealth
  await page.addInitScript(() => {
    // Hide webdriver property
    Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    
    // Mock plugins (mobile devices have none)
    Object.defineProperty(navigator, 'plugins', { get: () => [] });
    
    // Mock languages
    Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] });
    
    // Remove automation flags
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Array;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Promise;
    delete window.cdc_adoQpoasnfa76pfcZLmcfl_Symbol;
  });

  try {
    // Random initial delay before navigation (human-like)
    await humanDelay(300, 800);
    
    // Navigate to Amazon product
    const url = `https://www.amazon.com/dp/${asin}`;
    console.log(`🌐 Navigating to: ${url}`);
    
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Human-like wait for page to settle (random 2-4 seconds)
    await humanDelay(2000, 4000);

    // Check for bot detection/captcha
    const pageContent = await page.content();
    const pageTitle = await page.title();
    
    // Check for CAPTCHA
    if (pageContent.includes('Enter the characters you see below') ||
        pageContent.includes('Type the characters you see in this image') ||
        pageContent.includes('Sorry, we just need to make sure') ||
        pageTitle.includes('Robot Check')) {
      console.log('⚠️ CAPTCHA detected - bot detection triggered');
      await browser.close();
      throw new Error('Amazon bot detection - CAPTCHA required');
    }
    
    // Check for 404/error pages
    if (pageContent.includes("Sorry, we couldn't find that page") || 
        pageContent.includes("Page Not Found") ||
        pageContent.includes("Looking for something?") ||
        pageTitle.includes("Page Not Found") ||
        pageContent.includes("We're sorry, the page you requested was not found")) {
      console.log('⚠️ Product page not found (404), using fallback image');
      await browser.close();
      return null;
    }

    // Check if product is unavailable
    if (pageContent.includes("Currently unavailable") && 
        pageContent.includes("We don't know when or if this item will be back in stock")) {
      console.log('⚠️ Product unavailable, may have limited images');
    }

    // Random mouse movement to look human while waiting
    await humanMouseMove(page, randomDelay(100, 300), randomDelay(200, 400));

    // Wait for images to load with human-like patience
    console.log(`⏳ Waiting for images...`);
    await page.waitForSelector('#imageBlock, .a-carousel, #main-image-container, #imgTagWrapperId', {
      timeout: 15000
    }).catch(() => {
      console.log('⚠️ Image selector not found, continuing anyway...');
    });

    // Human delay while "looking" at the page
    await humanDelay(1000, 2000);

    // Try to close any popups/modals with human-like interaction
    try {
      const closeButton = await page.$('[data-action="a-modal-close"]');
      if (closeButton) {
        const box = await closeButton.boundingBox();
        if (box) {
          await humanClick(page, box.x + box.width / 2, box.y + box.height / 2);
          console.log('✓ Closed popup');
          await humanDelay(500, 1000);
        }
      }
    } catch (e) {
      // No modal to close
    }

    // Initial pause to show the product (like a human looking at it)
    await humanDelay(800, 1500);

    // Scroll through product images with human-like swipe gestures
    console.log(`📷 Scrolling through ${numImages} images...`);
    
    const imageBlock = await page.$('#imageBlock, .a-carousel, #main-image-container');
    
    if (imageBlock) {
      const box = await imageBlock.boundingBox();
      
      if (box) {
        for (let i = 0; i < numImages; i++) {
          console.log(`  Swipe ${i + 1}/${numImages}`);
          
          // Random variation in swipe start/end points
          const startXOffset = Math.random() * 0.1; // 0-10% variation
          const endXOffset = Math.random() * 0.1;
          
          const startX = box.x + box.width * (0.7 + startXOffset);
          const endX = box.x + box.width * (0.2 + endXOffset);
          const y = box.y + box.height * (0.4 + Math.random() * 0.2); // Vary Y position
          
          // Move to start position with human-like movement
          await humanMouseMove(page, startX, y, 8);
          await humanDelay(50, 150);
          
          // Swipe with natural speed variation
          await page.mouse.down();
          const swipeSteps = randomDelay(15, 25);
          await page.mouse.move(endX, y + (Math.random() - 0.5) * 20, { steps: swipeSteps });
          await humanDelay(30, 80);
          await page.mouse.up();
          
          // Human-like pause between swipes (variable)
          await humanDelay(scrollDelay, scrollDelay + 500);
        }
      }
    } else {
      // Fallback: Try clicking thumbnail dots if they exist
      console.log('  Using thumbnail click fallback...');
      const thumbnails = await page.$$('#imageBlock_feature_div li, .imageThumbnail');
      
      for (let i = 1; i < Math.min(thumbnails.length, numImages + 1); i++) {
        try {
          const thumb = thumbnails[i];
          const box = await thumb.boundingBox();
          if (box) {
            await humanClick(page, box.x + box.width / 2, box.y + box.height / 2);
            await humanDelay(scrollDelay, scrollDelay + 300);
          }
        } catch (e) {
          // Thumbnail not clickable
        }
      }
    }

    // Final pause (human looking at last image)
    await humanDelay(800, 1500);

    console.log(`✓ Recording captured`);

  } catch (err) {
    console.error(`❌ Error during recording: ${err.message}`);
    throw err;
  } finally {
    // Close page to finalize video
    await page.close();
    await context.close();
    await browser.close();
  }

  // Find the recorded video
  const files = fs.readdirSync(rawRecordingDir);
  const videoFile = files.find(f => f.endsWith('.webm'));

  if (!videoFile) {
    throw new Error('No recording found');
  }

  const rawVideoPath = path.join(rawRecordingDir, videoFile);
  console.log(`📼 Raw recording: ${rawVideoPath}`);

  // Convert and scale to 9:16 vertical (1080x1920) with letterboxing
  console.log(`🔄 Converting to 9:16 MP4...`);
  
  const filter = [
    'scale=1080:1920:force_original_aspect_ratio=decrease',
    'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0a0a0a'
  ].join(',');

  try {
    execSync(`ffmpeg -y -i "${rawVideoPath}" -t ${duration} -vf "${filter}" -c:v libx264 -pix_fmt yuv420p -an "${outputPath}" 2>/dev/null`);
    console.log(`✅ Output: ${outputPath}`);
  } catch (err) {
    console.error(`❌ FFmpeg conversion failed: ${err.message}`);
    throw err;
  }

  // Cleanup temp files
  fs.rmSync(rawRecordingDir, { recursive: true, force: true });

  return outputPath;
}

/**
 * Batch record multiple products
 */
async function recordMultiple(asins, outputDir = OUTPUT_DIR) {
  const results = [];
  
  for (const asin of asins) {
    try {
      const outputPath = path.join(outputDir, `amazon_${asin}.mp4`);
      // Add delay between products to avoid rate limiting
      if (results.length > 0) {
        console.log('⏳ Waiting between products...');
        await humanDelay(3000, 6000);
      }
      await recordAmazonProduct(asin, { outputPath });
      results.push({ asin, success: true, path: outputPath });
    } catch (err) {
      results.push({ asin, success: false, error: err.message });
    }
  }
  
  return results;
}

// CLI interface
if (require.main === module) {
  const asin = process.argv[2] || 'B00TTD9BRC'; // CeraVe as default
  const outputName = process.argv[3] || `amazon_${asin}.mp4`;
  const outputPath = outputName.startsWith('/') 
    ? outputName 
    : path.join(OUTPUT_DIR, outputName);

  console.log('=== Amazon Mobile Screen Recorder ===');
  console.log('🛡️ Anti-detection: ENABLED\n');
  
  recordAmazonProduct(asin, { outputPath })
    .then((result) => {
      if (result) {
        console.log('\n=== RECORDING COMPLETE ===');
        console.log(`📁 File: ${result}`);
        
        // Get file info
        const stats = fs.statSync(result);
        console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
      } else {
        console.log('\n⚠️ Recording returned null (404/unavailable product)');
        process.exit(1);
      }
    })
    .catch((err) => {
      console.error('\n❌ Recording failed:', err.message);
      process.exit(1);
    });
}

module.exports = { recordAmazonProduct, recordMultiple };
