# Amazon Mobile Screen Recording Plan

> **Goal:** Replace static product images with authentic mobile screen recordings of Amazon product pages scrolling through images. This feels more native to TikTok/Reels and eliminates distorted/cropped product shots.

## Why This Approach

| Current Problem | Screen Recording Solution |
|-----------------|---------------------------|
| Static product images look stretched/cropped | Native Amazon mobile UI looks authentic |
| Feels "ad-like" and produced | Feels like someone actually shopping |
| Single product angle | Multiple images via scroll |
| Low engagement | Higher trust ("I'm watching them shop") |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│                    Screen Recording Pipeline            │
├─────────────────────────────────────────────────────────┤
│  1. Launch browser (Playwright/Puppeteer)               │
│  2. Set mobile viewport (iPhone 14 Pro: 390x844)        │
│  3. Navigate to Amazon product ASIN                     │
│  4. Wait for images to load                             │
│  5. Start recording (page.video() or ffmpeg capture)    │
│  6. Scroll through product images (swipe simulation)    │
│  7. Stop recording after N images or X seconds          │
│  8. Crop/trim to clean segment                          │
│  9. Feed into editor.js pipeline                        │
└─────────────────────────────────────────────────────────┘
```

---

## Implementation Steps

### Step 1: Browser Setup with Mobile Viewport

```javascript
const { chromium } = require('playwright');

async function setupMobileBrowser() {
  const browser = await chromium.launch({
    headless: true, // Set false for debugging
    args: ['--disable-web-security'] // May help with some Amazon blocks
  });
  
  const context = await browser.newContext({
    // iPhone 14 Pro dimensions
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.0 Mobile/15E148 Safari/604.1',
    
    // Record video of the page
    recordVideo: {
      dir: './temp/recordings/',
      size: { width: 390, height: 844 }
    }
  });
  
  return { browser, context };
}
```

### Step 2: Navigate to Amazon Product

```javascript
async function navigateToProduct(page, asin) {
  const url = `https://www.amazon.com/dp/${asin}`;
  
  await page.goto(url, { 
    waitUntil: 'domcontentloaded',
    timeout: 30000 
  });
  
  // Wait for product images to load
  await page.waitForSelector('#imageBlock, [data-action="main-image-click"]', {
    timeout: 10000
  });
  
  // Optional: Close any popups/modals
  try {
    await page.click('[data-action="a-modal-close"]', { timeout: 2000 });
  } catch (e) {
    // No modal to close
  }
  
  // Small delay for animations to settle
  await page.waitForTimeout(500);
}
```

### Step 3: Scroll Through Product Images

```javascript
async function scrollProductImages(page, options = {}) {
  const {
    numImages = 4,           // How many images to scroll through
    scrollDelay = 800,       // ms between scrolls (natural pace)
    initialPause = 500,      // ms to pause before starting
    finalPause = 1000        // ms to pause after scrolling
  } = options;
  
  await page.waitForTimeout(initialPause);
  
  // Find the image gallery/carousel
  const imageContainer = await page.$('#imageBlock, .a-carousel-viewport');
  
  if (imageContainer) {
    const box = await imageContainer.boundingBox();
    
    for (let i = 0; i < numImages; i++) {
      // Simulate swipe left (to see next image)
      await page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * 0.2, box.y + box.height / 2, {
        steps: 20 // Smooth swipe animation
      });
      await page.mouse.up();
      
      await page.waitForTimeout(scrollDelay);
    }
  } else {
    // Fallback: scroll the page itself
    for (let i = 0; i < numImages; i++) {
      await page.evaluate(() => {
        window.scrollBy({ top: 300, behavior: 'smooth' });
      });
      await page.waitForTimeout(scrollDelay);
    }
  }
  
  await page.waitForTimeout(finalPause);
}
```

### Step 4: Record the Screen

**Option A: Playwright Built-in Recording (Recommended)**

```javascript
async function recordAmazonProduct(asin, outputPath) {
  const { browser, context } = await setupMobileBrowser();
  
  // Context was created with recordVideo enabled
  const page = await context.newPage();
  
  try {
    // Navigate and scroll
    await navigateToProduct(page, asin);
    await scrollProductImages(page, { numImages: 4 });
    
    // Close page to finalize video
    await page.close();
    
    // Get the video path
    const video = page.video();
    const videoPath = await video.path();
    
    // Move/rename to our output location
    const fs = require('fs');
    fs.renameSync(videoPath, outputPath);
    
    return outputPath;
    
  } finally {
    await browser.close();
  }
}
```

**Option B: FFmpeg Screen Capture (More Control)**

```javascript
const { spawn } = require('child_process');

async function recordWithFFmpeg(page, outputPath, durationSec = 6) {
  // Start ffmpeg recording of display
  // Note: Requires X11/Xvfb for headless
  const ffmpeg = spawn('ffmpeg', [
    '-y',
    '-video_size', '390x844',
    '-framerate', '30',
    '-f', 'x11grab',
    '-i', ':99.0+0,0', // Xvfb display
    '-t', String(durationSec),
    '-c:v', 'libx264',
    '-pix_fmt', 'yuv420p',
    outputPath
  ]);
  
  // Run the scrolling while recording
  await scrollProductImages(page, { numImages: 4 });
  
  // Wait for ffmpeg to finish
  return new Promise((resolve, reject) => {
    ffmpeg.on('close', (code) => {
      if (code === 0) resolve(outputPath);
      else reject(new Error(`FFmpeg exited with code ${code}`));
    });
  });
}
```

### Step 5: Crop/Trim the Recording

```javascript
function trimRecording(inputPath, outputPath, options = {}) {
  const {
    startSec = 0.5,    // Trim first 0.5s (loading flicker)
    duration = 5,       // Keep 5 seconds
    cropTop = 0,        // Crop pixels from top (browser UI)
    cropBottom = 0      // Crop pixels from bottom
  } = options;
  
  const { execSync } = require('child_process');
  
  // Build crop filter if needed
  let filter = '';
  if (cropTop > 0 || cropBottom > 0) {
    const newHeight = 844 - cropTop - cropBottom;
    filter = `-vf "crop=390:${newHeight}:0:${cropTop},scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0a0a0a"`;
  } else {
    // Just scale to 9:16 vertical format
    filter = `-vf "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0a0a0a"`;
  }
  
  execSync(`ffmpeg -y -ss ${startSec} -i "${inputPath}" -t ${duration} ${filter} -c:v libx264 -pix_fmt yuv420p "${outputPath}"`);
  
  return outputPath;
}
```

### Step 6: Integration with editor.js

```javascript
// In editor.js, replace static product image with screen recording

async function createProductSegmentFromRecording(asin, outputPath, duration) {
  const tempRecording = path.join(TEMP_DIR, `amazon_recording_${Date.now()}.mp4`);
  const trimmedRecording = path.join(TEMP_DIR, `amazon_trimmed_${Date.now()}.mp4`);
  
  // Record Amazon product page
  await recordAmazonProduct(asin, tempRecording);
  
  // Trim and scale to 9:16
  trimRecording(tempRecording, trimmedRecording, {
    startSec: 0.3,
    duration: duration
  });
  
  // Add price overlay on top
  addPriceOverlay(trimmedRecording, outputPath, price);
  
  // Cleanup
  fs.unlinkSync(tempRecording);
  fs.unlinkSync(trimmedRecording);
  
  return outputPath;
}
```

---

## Full Pipeline Function

```javascript
// /root/dailydealfeed/scripts/lib/amazon-recorder.js

const { chromium } = require('playwright');
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

const TEMP_DIR = path.join(__dirname, '../../temp');

/**
 * Record Amazon product page scrolling through images
 * @param {string} asin - Amazon product ASIN
 * @param {Object} options - Recording options
 * @returns {Promise<string>} - Path to final recording
 */
async function recordAmazonProduct(asin, options = {}) {
  const {
    outputPath = path.join(TEMP_DIR, `amazon_${asin}_${Date.now()}.mp4`),
    duration = 5,
    numImages = 4,
    scrollSpeed = 800,
    includePrice = false,
    priceText = ''
  } = options;
  
  const rawRecording = path.join(TEMP_DIR, `raw_${Date.now()}`);
  
  // Launch browser with mobile viewport + video recording
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_0 like Mac OS X) AppleWebKit/605.1.15',
    recordVideo: {
      dir: rawRecording,
      size: { width: 390, height: 844 }
    }
  });
  
  const page = await context.newPage();
  
  try {
    // Navigate to Amazon product
    await page.goto(`https://www.amazon.com/dp/${asin}`, {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    // Wait for images
    await page.waitForSelector('#imageBlock', { timeout: 10000 }).catch(() => {});
    await page.waitForTimeout(500);
    
    // Scroll through images
    const imageBlock = await page.$('#imageBlock, .a-carousel');
    if (imageBlock) {
      const box = await imageBlock.boundingBox();
      for (let i = 0; i < numImages; i++) {
        // Swipe gesture
        await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.5);
        await page.mouse.down();
        await page.mouse.move(box.x + box.width * 0.25, box.y + box.height * 0.5, { steps: 15 });
        await page.mouse.up();
        await page.waitForTimeout(scrollSpeed);
      }
    }
    
    await page.waitForTimeout(500);
    
  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }
  
  // Find the recorded video
  const files = fs.readdirSync(rawRecording);
  const videoFile = files.find(f => f.endsWith('.webm'));
  
  if (!videoFile) {
    throw new Error('No recording found');
  }
  
  const rawVideoPath = path.join(rawRecording, videoFile);
  
  // Convert and scale to 9:16 vertical (1080x1920)
  const filter = [
    'scale=1080:1920:force_original_aspect_ratio=decrease',
    'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0a0a0a'
  ].join(',');
  
  execSync(`ffmpeg -y -i "${rawVideoPath}" -t ${duration} -vf "${filter}" -c:v libx264 -pix_fmt yuv420p -an "${outputPath}"`);
  
  // Cleanup
  fs.rmSync(rawRecording, { recursive: true, force: true });
  
  return outputPath;
}

module.exports = { recordAmazonProduct };
```

---

## Dependencies

```bash
# Install Playwright
npm install playwright

# Install browser binaries
npx playwright install chromium

# FFmpeg should already be installed
ffmpeg -version
```

---

## Anti-Detection Considerations

Amazon may block or challenge automated browsers. Mitigations:

1. **Rotate User-Agents** - Use realistic mobile UAs
2. **Add Random Delays** - Don't scroll at machine speed
3. **Use Residential Proxies** - If rate-limited
4. **Stealth Mode** - Use `playwright-extra` with stealth plugin:

```javascript
const { chromium } = require('playwright-extra');
const stealth = require('puppeteer-extra-plugin-stealth')();
chromium.use(stealth);
```

---

## Fallback Strategy

If screen recording fails (blocked, timeout, etc.):

1. **Fallback to static image** (current behavior)
2. **Use cached recordings** for popular products
3. **Pre-record batch** of product videos offline

```javascript
async function getProductVisual(asin, imageFallback) {
  try {
    return await recordAmazonProduct(asin, { duration: 5 });
  } catch (err) {
    console.log(`⚠️ Recording failed: ${err.message}, using static image`);
    return imageFallback; // Return static product image path
  }
}
```

---

## Integration Checklist

- [ ] Create `/root/dailydealfeed/scripts/lib/amazon-recorder.js`
- [ ] Install Playwright: `npm install playwright`
- [ ] Install browser: `npx playwright install chromium`
- [ ] Update `editor.js` to call `recordAmazonProduct()` instead of using static image
- [ ] Add ASIN to product data in database
- [ ] Test with 3-5 products
- [ ] Monitor for Amazon blocks
- [ ] Implement fallback to static images

---

## Timeline Estimate

| Task | Time |
|------|------|
| Create amazon-recorder.js | 2 hours |
| Integrate with editor.js | 1 hour |
| Testing & debugging | 2 hours |
| Anti-detection tweaks | 1 hour |
| **Total** | ~6 hours |

---

## Notes

- Recording quality depends on network speed (images need to load)
- Consider pre-caching popular products' recordings
- Mobile viewport (390x844) scales well to 9:16 vertical (1080x1920)
- Playwright's built-in recording is WebM format, needs FFmpeg conversion
