const { chromium } = require('playwright');

async function validateProduct(asin) {
  console.log(`🔍 Validating ASIN: ${asin}`);
  
  const result = {
    asin,
    valid: false,
    checks: {
      asin_format: false,
      page_exists: false,
      images_loaded: false,
      price_found: false,
      in_stock: false
    },
    data: {
      title: null,
      price: null,
      image_count: 0,
      availability: null
    },
    errors: []
  };
  
  // 1. ASIN format check
  if (!/^B[A-Z0-9]{9}$/.test(asin)) {
    result.errors.push('Invalid ASIN format');
    return result;
  }
  result.checks.asin_format = true;
  
  // Random delay to avoid detection
  await new Promise(r => setTimeout(r, Math.random() * 2000 + 1000));
  
  // 2. Load Amazon page with Playwright
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8'
    }
  });
  
  const page = await context.newPage();
  
  try {
    await page.goto(`https://www.amazon.com/dp/${asin}`, { 
      waitUntil: 'load',
      timeout: 45000 
    });
    
    // Wait for page content
    await page.waitForTimeout(3000);
    
    // Get page content for analysis
    const pageText = await page.textContent('body');
    const pageHtml = await page.content();
    
    // 3. Check for 404 / "Sorry" page - definitive no-product indicators
    const notFoundPatterns = [
      "Sorry, we couldn't find",
      "Page Not Found",
      "Looking for something?",
      "page you requested cannot be found",
      "no results for",
      "CAPTCHA",
      "Enter the characters you see",
      "To discuss automated access"
    ];
    
    for (const pattern of notFoundPatterns) {
      if (pageText.includes(pattern)) {
        if (pattern.includes('CAPTCHA') || pattern.includes('characters')) {
          result.errors.push('CAPTCHA detected - Amazon blocked request');
        } else {
          result.errors.push('Product page not found (404)');
        }
        await browser.close();
        return result;
      }
    }
    result.checks.page_exists = true;
    
    // 4. Check for product images - multiple methods
    let imageCount = 0;
    
    // Method 1: Look for specific Amazon image selectors
    const imageSelectors = [
      '#landingImage',
      '#imgTagWrapperId img',
      '#main-image-container img',
      '#imageBlock img',
      '.a-dynamic-image',
      'img[data-old-hires]',
      '#imgBlkFront',
      '[data-a-image-name="landingImage"]',
      'img[src*="images-amazon"]'
    ];
    
    for (const selector of imageSelectors) {
      const images = await page.$$(selector);
      if (images.length > 0) {
        imageCount = images.length;
        break;
      }
    }
    
    // Method 2: Check HTML for Amazon image URLs as fallback
    if (imageCount === 0) {
      const imageMatches = pageHtml.match(/https:\/\/m\.media-amazon\.com\/images\/I\/[A-Za-z0-9_.-]+\.(jpg|png)/g);
      if (imageMatches) {
        imageCount = new Set(imageMatches).size;
      }
    }
    
    result.data.image_count = imageCount;
    result.checks.images_loaded = imageCount > 0;
    
    // 5. Extract price - multiple methods
    const priceSelectors = [
      '#corePrice_feature_div .a-price .a-offscreen',
      '.a-price .a-offscreen',
      '#priceblock_ourprice',
      '#priceblock_dealprice', 
      '.apexPriceToPay .a-offscreen',
      '.priceToPay .a-offscreen',
      '#corePriceDisplay_desktop_feature_div .a-offscreen',
      '.a-price-whole'
    ];
    
    for (const selector of priceSelectors) {
      const priceElements = await page.$$(selector);
      for (const priceElement of priceElements) {
        let priceText = await priceElement.textContent();
        priceText = priceText.trim();
        if (priceText && priceText.match(/\$[\d,]+\.?\d*/)) {
          result.data.price = priceText;
          result.checks.price_found = true;
          break;
        }
      }
      if (result.checks.price_found) break;
    }
    
    // Fallback: regex price from HTML
    if (!result.checks.price_found) {
      const priceMatch = pageHtml.match(/\$(\d{1,4}\.\d{2})/);
      if (priceMatch) {
        result.data.price = '$' + priceMatch[1];
        result.checks.price_found = true;
      }
    }
    
    // 6. Extract title
    const titleSelectors = [
      '#productTitle',
      '#title span',
      'h1#title',
      'h1.product-title-word-break',
      '[data-feature-name="title"] span'
    ];
    
    for (const selector of titleSelectors) {
      const titleElement = await page.$(selector);
      if (titleElement) {
        let titleText = await titleElement.textContent();
        titleText = titleText.trim();
        if (titleText && titleText.length > 5) {
          result.data.title = titleText.substring(0, 100);
          break;
        }
      }
    }
    
    // Fallback: Check if page has product-like content
    if (!result.data.title) {
      const hasProductContent = pageHtml.includes('Add to Cart') || 
                                pageHtml.includes('Buy Now') ||
                                pageHtml.includes('addToCart');
      if (hasProductContent) {
        result.data.title = '[Product detected but title extraction failed]';
      }
    }
    
    // 7. Check availability
    const buyButtonSelectors = [
      '#add-to-cart-button',
      '#buy-now-button', 
      '.a-button-buy-now',
      'input[name="submit.add-to-cart"]',
      '#addToCart'
    ];
    
    for (const selector of buyButtonSelectors) {
      const btn = await page.$(selector);
      if (btn) {
        result.checks.in_stock = true;
        result.data.availability = 'In Stock';
        break;
      }
    }
    
    // Fallback: check HTML for add-to-cart indicators
    if (!result.checks.in_stock) {
      const hasAddToCart = pageHtml.includes('add-to-cart') || 
                           pageHtml.includes('addToCart') ||
                           pageHtml.includes('Buy Now');
      if (hasAddToCart) {
        result.checks.in_stock = true;
        result.data.availability = 'In Stock (inferred)';
      }
    }
    
  } catch (error) {
    result.errors.push(`Page load error: ${error.message}`);
  }
  
  await browser.close();
  
  // Calculate overall validity
  // Core requirement: page must exist and not be 404
  // Secondary: at least one of images/price/stock should work
  const passedChecks = Object.values(result.checks).filter(v => v).length;
  result.passedChecks = passedChecks;
  result.score = passedChecks / 5;
  
  // Valid if:
  // - At least 4/5 checks pass, OR
  // - Page exists + ASIN valid + at least one content check passes (images/price/stock)
  const contentChecks = [result.checks.images_loaded, result.checks.price_found, result.checks.in_stock];
  const hasContent = contentChecks.some(v => v);
  
  result.valid = passedChecks >= 4 || 
                 (result.checks.page_exists && result.checks.asin_format && hasContent);
  
  return result;
}

// Export for use in other scripts
module.exports = { validateProduct };

// CLI
async function main() {
  const asin = process.argv[2];
  if (!asin) {
    console.log('Usage: node validate-product.js <ASIN>');
    process.exit(1);
  }
  
  const result = await validateProduct(asin);
  console.log(JSON.stringify(result, null, 2));
  
  if (result.valid) {
    console.log('✅ Product APPROVED');
  } else {
    console.log('❌ Product REJECTED:', result.errors.join(', '));
  }
}

// Only run main if this is the entry point
if (require.main === module) {
  main();
}
