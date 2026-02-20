/**
 * Amazon Product Screenshot & Validation
 * Takes mobile screenshots of Amazon product pages and validates with vision model
 * 
 * Simpler than video recording:
 * - Captures mobile UI screenshot
 * - Uses vision model to validate product & price
 * - More reliable and faster than video
 */

const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const logger = require('./lib/logger');

const TEMP_DIR = path.join(__dirname, '../temp');
const SCREENSHOTS_DIR = path.join(__dirname, '../temp/screenshots');

// Ensure directories exist
[TEMP_DIR, SCREENSHOTS_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// Mobile viewport (iPhone 14 Pro)
const MOBILE_VIEWPORT = {
  width: 393,
  height: 852,
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true
};

const MOBILE_USER_AGENT = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

/**
 * Take a screenshot of an Amazon product page
 * @param {string} asin - Amazon product ASIN
 * @returns {Promise<{success: boolean, screenshotPath?: string, error?: string}>}
 */
async function captureProductScreenshot(asin) {
  const url = `https://www.amazon.com/dp/${asin}`;
  const screenshotPath = path.join(SCREENSHOTS_DIR, `${asin}_${Date.now()}.png`);
  const startTime = Date.now();
  
  logger.amazon('INFO', `Starting screenshot capture`, { asin, url });
  
  let browser;
  try {
    logger.amazon('DEBUG', `Launching Playwright browser`, { asin, headless: true });
    
    browser = await chromium.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    logger.amazon('DEBUG', `Browser launched successfully`, { asin });
    
    const context = await browser.newContext({
      viewport: MOBILE_VIEWPORT,
      userAgent: MOBILE_USER_AGENT
    });
    
    const page = await context.newPage();
    
    // Navigate with timeout
    logger.amazon('DEBUG', `Navigating to Amazon page`, { asin, url, timeout: '30s' });
    
    try {
      await page.goto(url, { 
        waitUntil: 'domcontentloaded',
        timeout: 30000 
      });
      logger.amazon('DEBUG', `Page loaded successfully`, { asin });
    } catch (navErr) {
      logger.amazon('ERROR', `Page navigation failed`, {
        asin,
        url,
        error: navErr.message,
        timeout: navErr.message.includes('timeout')
      });
      throw navErr;
    }
    
    // Wait for product image to load
    await page.waitForTimeout(2000);
    
    // Try to dismiss any popups
    try {
      await page.click('[data-action="a-popover-close"]', { timeout: 1000 });
      logger.amazon('DEBUG', `Dismissed popup`, { asin });
    } catch (e) { /* No popup */ }
    
    // Take screenshot
    logger.amazon('DEBUG', `Taking screenshot`, { asin, screenshotPath });
    
    await page.screenshot({ 
      path: screenshotPath,
      fullPage: false // Just the visible viewport
    });
    
    await browser.close();
    
    // Verify screenshot was created
    if (!fs.existsSync(screenshotPath)) {
      logger.amazon('ERROR', `Screenshot file not created`, { asin, screenshotPath });
      return { success: false, error: 'Screenshot file not created', asin };
    }
    
    const stats = fs.statSync(screenshotPath);
    if (stats.size === 0) {
      logger.amazon('ERROR', `Screenshot file is empty (0 bytes)`, { asin, screenshotPath });
      return { success: false, error: 'Screenshot file is empty', asin };
    }
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.amazon('INFO', `Screenshot captured successfully in ${elapsed}s`, {
      asin,
      screenshotPath,
      fileSize: stats.size,
      elapsedSeconds: elapsed
    });
    
    return { 
      success: true, 
      screenshotPath,
      asin
    };
    
  } catch (error) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    logger.amazon('ERROR', `Screenshot capture failed after ${elapsed}s: ${error.message}`, {
      asin,
      error: error.message,
      stack: error.stack,
      elapsedSeconds: elapsed
    });
    
    if (browser) {
      try {
        await browser.close();
      } catch (closeErr) {
        logger.amazon('WARN', `Failed to close browser`, { error: closeErr.message });
      }
    }
    
    return { 
      success: false, 
      error: error.message,
      asin
    };
  }
}

/**
 * Validate product screenshot using vision model
 * Checks if the screenshot shows the correct product and price
 * @param {string} screenshotPath - Path to screenshot
 * @param {object} expectedProduct - Expected product data
 * @returns {Promise<{valid: boolean, confidence: number, issues: string[]}>}
 */
async function validateScreenshot(screenshotPath, expectedProduct) {
  // This will be called by the pipeline with a vision model
  // For now, return a placeholder that the pipeline can use
  return {
    screenshotPath,
    expectedProduct,
    needsValidation: true,
    validationPrompt: `
Analyze this Amazon product screenshot and validate:

1. PRODUCT MATCH: Does the screenshot show "${expectedProduct.title || expectedProduct.name}"?
2. PRICE CHECK: Is the displayed price close to ${expectedProduct.price}? (Allow ±10%)
3. AVAILABILITY: Is the product in stock / available?
4. PAGE QUALITY: Is this a legitimate product page (not 404, captcha, or error)?

Respond with JSON:
{
  "productMatch": true/false,
  "priceMatch": true/false,
  "priceShown": "$XX.XX",
  "available": true/false,
  "pageValid": true/false,
  "confidence": 0-100,
  "issues": ["list of any problems"]
}
`
  };
}

/**
 * Full capture and validate flow
 * @param {string} asin - Product ASIN
 * @param {object} productData - Expected product data
 */
async function captureAndValidate(asin, productData) {
  logger.amazon('INFO', `Starting capture and validate flow`, {
    asin,
    productTitle: productData?.title || productData?.name
  });
  
  console.log(`📸 Capturing screenshot for ${asin}...`);
  
  const capture = await captureProductScreenshot(asin);
  
  if (!capture.success) {
    logger.amazon('ERROR', `Capture and validate flow failed at screenshot step`, {
      asin,
      error: capture.error
    });
    console.error(`❌ Screenshot failed: ${capture.error}`);
    return { success: false, error: capture.error };
  }
  
  console.log(`✅ Screenshot saved: ${capture.screenshotPath}`);
  
  const validation = await validateScreenshot(capture.screenshotPath, productData);
  
  logger.amazon('INFO', `Capture and validate flow completed`, {
    asin,
    screenshotPath: capture.screenshotPath,
    needsValidation: validation.needsValidation
  });
  
  return {
    success: true,
    screenshotPath: capture.screenshotPath,
    validation
  };
}

// CLI usage
if (require.main === module) {
  const asin = process.argv[2];
  const productJson = process.argv[3];
  
  if (!asin) {
    console.log('Usage: node amazon-screenshot.js <ASIN> [product.json]');
    console.log('Example: node amazon-screenshot.js B00PBX3L7K');
    process.exit(1);
  }
  
  let productData = { asin };
  if (productJson && fs.existsSync(productJson)) {
    productData = JSON.parse(fs.readFileSync(productJson, 'utf8'));
  }
  
  captureAndValidate(asin, productData)
    .then(result => {
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.success ? 0 : 1);
    })
    .catch(err => {
      console.error('Fatal error:', err);
      process.exit(1);
    });
}

module.exports = {
  captureProductScreenshot,
  validateScreenshot,
  captureAndValidate
};
