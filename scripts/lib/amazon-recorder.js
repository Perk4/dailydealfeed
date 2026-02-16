/**
 * Amazon Mobile Screen Recorder - Library Module
 * For integration with editor.js and video pipeline
 */

const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEMP_DIR = path.join(__dirname, '../../temp');
const OUTPUT_DIR = path.join(__dirname, '../../output');

// Ensure directories exist
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

/**
 * Record Amazon product page scrolling through images
 * @param {string} asin - Amazon product ASIN
 * @param {Object} options - Recording options
 * @returns {Promise<string>} - Path to final MP4 recording
 */
async function recordAmazonProduct(asin, options = {}) {
  const {
    outputPath = path.join(TEMP_DIR, `amazon_${asin}_${Date.now()}.mp4`),
    duration = 6,
    numImages = 4,
    scrollDelay = 800,
    debug = false
  } = options;

  const rawRecordingDir = path.join(TEMP_DIR, `raw_${Date.now()}`);
  fs.mkdirSync(rawRecordingDir, { recursive: true });

  if (debug) {
    console.log(`🎬 Recording Amazon product: ${asin}`);
    console.log(`📁 Output: ${outputPath}`);
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--disable-web-security', '--no-sandbox']
  });

  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    recordVideo: {
      dir: rawRecordingDir,
      size: { width: 390, height: 844 }
    }
  });

  const page = await context.newPage();

  try {
    await page.goto(`https://www.amazon.com/dp/${asin}`, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });

    await page.waitForSelector('#imageBlock, .a-carousel, #main-image-container', {
      timeout: 10000
    }).catch(() => {});

    await page.waitForTimeout(1500);

    // Close any popups
    try {
      await page.click('[data-action="a-modal-close"]', { timeout: 1000 });
    } catch (e) {}

    await page.waitForTimeout(1000);

    // Scroll through images
    const imageBlock = await page.$('#imageBlock, .a-carousel, #main-image-container');
    
    if (imageBlock) {
      const box = await imageBlock.boundingBox();
      if (box) {
        for (let i = 0; i < numImages; i++) {
          const startX = box.x + box.width * 0.75;
          const endX = box.x + box.width * 0.25;
          const y = box.y + box.height * 0.5;
          
          await page.mouse.move(startX, y);
          await page.mouse.down();
          await page.mouse.move(endX, y, { steps: 20 });
          await page.mouse.up();
          await page.waitForTimeout(scrollDelay);
        }
      }
    } else {
      // Fallback: click thumbnails
      const thumbnails = await page.$$('#imageBlock_feature_div li, .imageThumbnail');
      for (let i = 1; i < Math.min(thumbnails.length, numImages + 1); i++) {
        try {
          await thumbnails[i].click();
          await page.waitForTimeout(scrollDelay);
        } catch (e) {}
      }
    }

    await page.waitForTimeout(1000);

  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  // Find and convert the recording
  const files = fs.readdirSync(rawRecordingDir);
  const videoFile = files.find(f => f.endsWith('.webm'));

  if (!videoFile) {
    throw new Error('No recording found');
  }

  const rawVideoPath = path.join(rawRecordingDir, videoFile);
  
  const filter = [
    'scale=1080:1920:force_original_aspect_ratio=decrease',
    'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0a0a0a'
  ].join(',');

  execSync(`ffmpeg -y -i "${rawVideoPath}" -t ${duration} -vf "${filter}" -c:v libx264 -pix_fmt yuv420p -an "${outputPath}" 2>/dev/null`);

  // Cleanup
  fs.rmSync(rawRecordingDir, { recursive: true, force: true });

  return outputPath;
}

/**
 * Get product visual - returns recording or falls back to static image
 * @param {Object} product - Product object with asin and image_url
 * @param {boolean} useRecording - Whether to use screen recording
 * @returns {Promise<string>} - Path to video/image
 */
async function getProductVisual(product, useRecording = false) {
  if (useRecording && product.asin) {
    try {
      const recordingPath = await recordAmazonProduct(product.asin, {
        duration: 5,
        numImages: 3
      });
      return recordingPath;
    } catch (err) {
      console.log(`⚠️ Recording failed: ${err.message}, using static image`);
    }
  }
  return product.image_url;
}

module.exports = { 
  recordAmazonProduct,
  getProductVisual
};
