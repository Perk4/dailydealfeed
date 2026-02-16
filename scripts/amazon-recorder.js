/**
 * Amazon Mobile Screen Recorder
 * Records Amazon product page scrolling through product images
 * Creates authentic mobile-native video content for TikTok/Reels
 */

const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEMP_DIR = path.join(__dirname, '../temp');
const OUTPUT_DIR = path.join(__dirname, '../output');

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });

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

  console.log(`🎬 Recording Amazon product: ${asin}`);
  console.log(`📁 Output: ${outputPath}`);

  // Launch browser with mobile viewport + video recording
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--disable-web-security',
      '--disable-features=IsolateOrigins,site-per-process',
      '--no-sandbox'
    ]
  });

  const context = await browser.newContext({
    // iPhone 14 Pro dimensions
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    // Enable video recording
    recordVideo: {
      dir: rawRecordingDir,
      size: { width: 390, height: 844 }
    }
  });

  const page = await context.newPage();

  try {
    // Navigate to Amazon product
    const url = `https://www.amazon.com/dp/${asin}`;
    console.log(`🌐 Navigating to: ${url}`);
    
    await page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    // Wait for images to load
    console.log(`⏳ Waiting for images...`);
    await page.waitForSelector('#imageBlock, .a-carousel, #main-image-container', {
      timeout: 10000
    }).catch(() => {
      console.log('⚠️ Image selector not found, continuing anyway...');
    });

    // Small delay for everything to render
    await page.waitForTimeout(1500);

    // Try to close any popups/modals
    try {
      await page.click('[data-action="a-modal-close"]', { timeout: 1000 });
      console.log('✓ Closed popup');
    } catch (e) {
      // No modal to close
    }

    // Initial pause to show the product
    await page.waitForTimeout(1000);

    // Scroll through product images with swipe gestures
    console.log(`📷 Scrolling through ${numImages} images...`);
    
    const imageBlock = await page.$('#imageBlock, .a-carousel, #main-image-container');
    
    if (imageBlock) {
      const box = await imageBlock.boundingBox();
      
      if (box) {
        for (let i = 0; i < numImages; i++) {
          console.log(`  Swipe ${i + 1}/${numImages}`);
          
          // Swipe left gesture (to see next image)
          const startX = box.x + box.width * 0.75;
          const endX = box.x + box.width * 0.25;
          const y = box.y + box.height * 0.5;
          
          await page.mouse.move(startX, y);
          await page.mouse.down();
          await page.mouse.move(endX, y, { steps: 20 }); // Smooth animation
          await page.mouse.up();
          
          await page.waitForTimeout(scrollDelay);
        }
      }
    } else {
      // Fallback: Try clicking thumbnail dots if they exist
      console.log('  Using thumbnail click fallback...');
      const thumbnails = await page.$$('#imageBlock_feature_div li, .imageThumbnail');
      
      for (let i = 1; i < Math.min(thumbnails.length, numImages + 1); i++) {
        try {
          await thumbnails[i].click();
          await page.waitForTimeout(scrollDelay);
        } catch (e) {
          // Thumbnail not clickable
        }
      }
    }

    // Final pause
    await page.waitForTimeout(1000);

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

  console.log('=== Amazon Mobile Screen Recorder ===\n');
  
  recordAmazonProduct(asin, { outputPath })
    .then((result) => {
      console.log('\n=== RECORDING COMPLETE ===');
      console.log(`📁 File: ${result}`);
      
      // Get file info
      const stats = fs.statSync(result);
      console.log(`📊 Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);
    })
    .catch((err) => {
      console.error('\n❌ Recording failed:', err.message);
      process.exit(1);
    });
}

module.exports = { recordAmazonProduct, recordMultiple };
