/**
 * Browser Rendering Worker - Phase 3 of Cloudflare Migration
 * 
 * Captures screenshots of Amazon product pages using Cloudflare Browser Rendering.
 * Features:
 * - Mobile viewport emulation (iPhone 14 Pro: 390x844)
 * - Retry logic with exponential backoff
 * - R2 storage for screenshots
 * - Fallback to static images on failure
 * - KV caching for deduplication
 */

import puppeteer from '@cloudflare/puppeteer';

// Type definitions for the worker environment
interface Env {
  BROWSER: Fetcher;
  SCREENSHOTS: R2Bucket;
  BROWSER_KV: KVNamespace;
  MAX_RETRIES: string;
  SCREENSHOT_TIMEOUT_MS: string;
  VIEWPORT_WIDTH: string;
  VIEWPORT_HEIGHT: string;
  DEFAULT_FORMAT: string;
}

interface ScreenshotRequest {
  url: string;
  asin?: string;
  format?: 'png' | 'webp';
  width?: number;
  height?: number;
  waitForSelector?: string;
  forceRefresh?: boolean;
}

interface ScreenshotResult {
  success: boolean;
  key?: string;
  url?: string;
  cached?: boolean;
  error?: string;
  retries?: number;
}

// Mobile device emulation settings (iPhone 14 Pro)
const MOBILE_CONFIG = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
  viewport: {
    width: 390,
    height: 844,
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    isLandscape: false,
  },
};

// Screenshot configuration
const SCREENSHOT_CONFIG = {
  defaultWaitSelector: '[data-component-type="s-product-image"]',
  fallbackWaitSelector: '#productTitle',
  scrollDelay: 500,
  stabilizationDelay: 1000,
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    // Health check endpoint
    if (url.pathname === '/health') {
      return Response.json({ status: 'healthy', service: 'browser-renderer' });
    }

    // Screenshot endpoint
    if (url.pathname === '/screenshot' && request.method === 'POST') {
      try {
        const body = await request.json() as ScreenshotRequest;
        const result = await captureScreenshot(body, env);
        return Response.json(result, {
          status: result.success ? 200 : 500,
        });
      } catch (error) {
        return Response.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
      }
    }

    // Batch screenshot endpoint
    if (url.pathname === '/batch' && request.method === 'POST') {
      try {
        const { urls } = await request.json() as { urls: ScreenshotRequest[] };
        const results = await Promise.allSettled(
          urls.map(req => captureScreenshot(req, env))
        );
        return Response.json({
          results: results.map(r => 
            r.status === 'fulfilled' ? r.value : { success: false, error: r.reason }
          ),
        });
      } catch (error) {
        return Response.json({
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        }, { status: 500 });
      }
    }

    // Get screenshot by key
    if (url.pathname.startsWith('/get/')) {
      const key = url.pathname.replace('/get/', '');
      const object = await env.SCREENSHOTS.get(key);
      
      if (!object) {
        return new Response('Not found', { status: 404 });
      }
      
      const headers = new Headers();
      headers.set('Content-Type', object.httpMetadata?.contentType || 'image/webp');
      headers.set('Cache-Control', 'public, max-age=86400');
      
      return new Response(object.body, { headers });
    }

    return Response.json({
      service: 'browser-renderer',
      endpoints: {
        'POST /screenshot': 'Capture a single screenshot',
        'POST /batch': 'Capture multiple screenshots',
        'GET /get/:key': 'Retrieve a screenshot by key',
        'GET /health': 'Health check',
      },
    });
  },
};

/**
 * Main screenshot capture function with retry logic
 */
async function captureScreenshot(
  request: ScreenshotRequest,
  env: Env
): Promise<ScreenshotResult> {
  const maxRetries = parseInt(env.MAX_RETRIES || '3');
  const timeoutMs = parseInt(env.SCREENSHOT_TIMEOUT_MS || '30000');
  const format = request.format || (env.DEFAULT_FORMAT as 'png' | 'webp') || 'webp';
  
  // Generate cache key
  const cacheKey = generateCacheKey(request);
  
  // Check KV cache first (unless force refresh)
  if (!request.forceRefresh) {
    const cached = await env.BROWSER_KV.get(cacheKey);
    if (cached) {
      return {
        success: true,
        key: cached,
        cached: true,
      };
    }
  }
  
  let lastError: Error | null = null;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const result = await attemptScreenshot(request, env, format, timeoutMs);
      
      // Cache the result in KV (24 hour TTL)
      await env.BROWSER_KV.put(cacheKey, result.key!, {
        expirationTtl: 86400,
      });
      
      return {
        ...result,
        retries: attempt - 1,
      };
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      console.error(`Attempt ${attempt}/${maxRetries} failed:`, lastError.message);
      
      // Exponential backoff before retry
      if (attempt < maxRetries) {
        await sleep(Math.pow(2, attempt) * 500);
      }
    }
  }
  
  // All retries exhausted - try fallback
  console.log('All retries exhausted, attempting fallback...');
  return await fallbackScreenshot(request, env, lastError);
}

/**
 * Single screenshot attempt using Puppeteer
 */
async function attemptScreenshot(
  request: ScreenshotRequest,
  env: Env,
  format: 'png' | 'webp',
  timeoutMs: number
): Promise<ScreenshotResult> {
  const browser = await puppeteer.launch(env.BROWSER);
  
  try {
    const page = await browser.newPage();
    
    // Set mobile viewport
    await page.setViewport({
      width: request.width || MOBILE_CONFIG.viewport.width,
      height: request.height || MOBILE_CONFIG.viewport.height,
      deviceScaleFactor: MOBILE_CONFIG.viewport.deviceScaleFactor,
      isMobile: MOBILE_CONFIG.viewport.isMobile,
      hasTouch: MOBILE_CONFIG.viewport.hasTouch,
    });
    
    // Set mobile user agent
    await page.setUserAgent(MOBILE_CONFIG.userAgent);
    
    // Set extra headers to appear more like a real mobile browser
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    });
    
    // Navigate to the page with timeout
    await page.goto(request.url, {
      waitUntil: 'networkidle0',
      timeout: timeoutMs,
    });
    
    // Wait for specific selector if provided
    const waitSelector = request.waitForSelector || 
      (request.url.includes('amazon.com') ? SCREENSHOT_CONFIG.defaultWaitSelector : null);
    
    if (waitSelector) {
      try {
        await page.waitForSelector(waitSelector, { timeout: 5000 });
      } catch {
        // Try fallback selector for Amazon product pages
        if (request.url.includes('amazon.com')) {
          await page.waitForSelector(SCREENSHOT_CONFIG.fallbackWaitSelector, { timeout: 5000 });
        }
      }
    }
    
    // Small delay for dynamic content to stabilize
    await sleep(SCREENSHOT_CONFIG.stabilizationDelay);
    
    // Scroll down slightly to trigger lazy loading
    await page.evaluate(() => {
      window.scrollBy(0, 300);
    });
    await sleep(SCREENSHOT_CONFIG.scrollDelay);
    
    // Scroll back up
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await sleep(300);
    
    // Capture screenshot
    const screenshotBuffer = await page.screenshot({
      type: format,
      quality: format === 'webp' ? 85 : undefined,
      fullPage: false,
    });
    
    // Generate storage key
    const storageKey = generateStorageKey(request, format);
    
    // Store in R2
    await env.SCREENSHOTS.put(storageKey, screenshotBuffer, {
      httpMetadata: {
        contentType: format === 'webp' ? 'image/webp' : 'image/png',
      },
      customMetadata: {
        url: request.url,
        asin: request.asin || '',
        capturedAt: new Date().toISOString(),
        viewport: `${request.width || MOBILE_CONFIG.viewport.width}x${request.height || MOBILE_CONFIG.viewport.height}`,
      },
    });
    
    return {
      success: true,
      key: storageKey,
    };
  } finally {
    await browser.close();
  }
}

/**
 * Fallback mechanism when browser rendering fails
 * Attempts to use a static placeholder or cached version
 */
async function fallbackScreenshot(
  request: ScreenshotRequest,
  env: Env,
  originalError: Error | null
): Promise<ScreenshotResult> {
  // Try to find any cached version (even expired)
  const possibleKeys = [
    generateStorageKey(request, 'webp'),
    generateStorageKey(request, 'png'),
  ];
  
  for (const key of possibleKeys) {
    const existing = await env.SCREENSHOTS.head(key);
    if (existing) {
      console.log(`Using existing screenshot: ${key}`);
      return {
        success: true,
        key,
        cached: true,
      };
    }
  }
  
  // Generate a placeholder image key indicating failure
  // In production, you might want to store an actual placeholder image
  const placeholderKey = `fallback/${request.asin || hashUrl(request.url)}/placeholder.png`;
  
  // Check if placeholder exists, create if not
  const placeholder = await env.SCREENSHOTS.head(placeholderKey);
  if (placeholder) {
    return {
      success: true,
      key: placeholderKey,
      cached: true,
      error: `Using fallback: ${originalError?.message}`,
    };
  }
  
  // Ultimate fallback - return error with guidance
  return {
    success: false,
    error: `Screenshot failed after all retries: ${originalError?.message}. Consider uploading a static fallback image.`,
  };
}

/**
 * Generate a cache key for KV storage
 */
function generateCacheKey(request: ScreenshotRequest): string {
  const viewport = `${request.width || MOBILE_CONFIG.viewport.width}x${request.height || MOBILE_CONFIG.viewport.height}`;
  return `cache:${request.asin || hashUrl(request.url)}:${viewport}`;
}

/**
 * Generate a storage key for R2
 */
function generateStorageKey(request: ScreenshotRequest, format: string): string {
  const date = new Date().toISOString().split('T')[0];
  const identifier = request.asin || hashUrl(request.url);
  return `screenshots/${date}/${identifier}.${format}`;
}

/**
 * Simple hash function for URLs
 */
function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    const char = url.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Promise-based sleep function
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
