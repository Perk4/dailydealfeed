# Phase 3: Browser Rendering Worker

**Status:** ✅ Implementation Complete  
**Agent:** browser-renderer  
**Date:** 2026-02-18

## Overview

This phase implements a Cloudflare Browser Rendering worker that captures screenshots of Amazon product pages for embed generation. The worker uses `@cloudflare/puppeteer` to render pages in a headless browser with mobile viewport emulation.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Browser Rendering Worker                      │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  HTTP Request                                                    │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────┐    ┌───────────────┐    ┌─────────────────┐    │
│  │   Router    │───▶│  KV Cache     │───▶│ Return Cached   │    │
│  │             │    │  Check        │    │                 │    │
│  └─────────────┘    └───────────────┘    └─────────────────┘    │
│       │                    │ miss                               │
│       │                    ▼                                    │
│       │             ┌─────────────────────────┐                 │
│       │             │  Puppeteer Browser      │                 │
│       │             │  - Mobile viewport      │                 │
│       │             │  - User-agent spoof     │                 │
│       │             │  - Screenshot capture   │                 │
│       │             └─────────────────────────┘                 │
│       │                    │                                    │
│       │                    ▼                                    │
│       │             ┌─────────────────────────┐                 │
│       │             │  R2 Storage             │                 │
│       │             │  (embed-assets bucket)  │                 │
│       │             └─────────────────────────┘                 │
│       │                                                          │
│       ▼                                                          │
│  ┌─────────────────────────────────────────┐                    │
│  │  Response: { key, url, cached, ... }    │                    │
│  └─────────────────────────────────────────┘                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Technical Specifications

### Mobile Viewport Emulation (iPhone 14 Pro)
| Setting | Value |
|---------|-------|
| Width | 390px |
| Height | 844px |
| Device Scale Factor | 3x |
| isMobile | true |
| hasTouch | true |

### User-Agent
```
Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1
```

### Screenshot Configuration
| Setting | Value |
|---------|-------|
| Default Format | WebP |
| Quality | 85 |
| Timeout | 30 seconds |
| Retries | 3 (with exponential backoff) |

## API Endpoints

### POST /screenshot
Capture a single screenshot.

**Request:**
```json
{
  "url": "https://www.amazon.com/dp/B0EXAMPLE",
  "asin": "B0EXAMPLE",
  "format": "webp",
  "width": 390,
  "height": 844,
  "waitForSelector": "[data-component-type=\"s-product-image\"]",
  "forceRefresh": false
}
```

**Response:**
```json
{
  "success": true,
  "key": "screenshots/2026-02-18/B0EXAMPLE.webp",
  "cached": false,
  "retries": 0
}
```

### POST /batch
Capture multiple screenshots in parallel.

**Request:**
```json
{
  "urls": [
    { "url": "https://...", "asin": "B0EXAMPLE1" },
    { "url": "https://...", "asin": "B0EXAMPLE2" }
  ]
}
```

### GET /get/:key
Retrieve a screenshot by its storage key.

### GET /health
Health check endpoint.

## Cloudflare Bindings

| Binding | Type | Resource |
|---------|------|----------|
| BROWSER | Browser | Cloudflare Browser Rendering |
| SCREENSHOTS | R2 | embed-assets bucket |
| BROWSER_KV | KV | Browser cache namespace |

## Retry Logic

The worker implements exponential backoff retry logic:

1. **Attempt 1:** Immediate
2. **Attempt 2:** Wait 1 second (2^1 × 500ms)
3. **Attempt 3:** Wait 2 seconds (2^2 × 500ms)

### Failure Handling

When all retries fail:
1. Check for existing cached screenshot (any format)
2. Look for pre-uploaded fallback placeholder
3. Return error with guidance for manual fallback upload

## Storage Keys

### R2 Storage Pattern
```
screenshots/{date}/{asin-or-hash}.{format}
fallback/{asin-or-hash}/placeholder.png
```

### KV Cache Pattern
```
cache:{asin-or-hash}:{viewport}
```

KV entries have a 24-hour TTL.

## Files Created

```
src/browser-worker/
├── package.json          # Dependencies and scripts
├── tsconfig.json         # TypeScript configuration
├── wrangler.toml         # Cloudflare Worker configuration
└── src/
    └── index.ts          # Main worker implementation
```

## Deployment Commands

```bash
# Install dependencies
cd src/browser-worker && npm install

# Deploy to staging
npm run deploy:staging

# Deploy to production
npm run deploy:production

# View logs
npm run tail
```

## Pre-deployment Checklist

- [ ] Update `BROWSER_KV` ID in wrangler.toml with actual KV namespace ID
- [ ] Ensure Browser Rendering is enabled on the Cloudflare account
- [ ] Verify R2 bucket `embed-assets` exists
- [ ] Test with a sample Amazon URL

## Future Enhancements (Phase 4+)

1. **Queue Integration:** Add queue consumer to process batch requests
2. **Metrics:** Add analytics for screenshot success/failure rates
3. **CDN Integration:** Serve screenshots directly via R2 public access
4. **Image Optimization:** Add automatic image resizing/compression
5. **A/B Testing:** Support multiple viewport configurations

## Error Codes

| Error | Meaning | Resolution |
|-------|---------|------------|
| `TIMEOUT` | Page load exceeded 30s | Retry or check URL accessibility |
| `SELECTOR_NOT_FOUND` | Wait selector missing | Page structure may have changed |
| `BROWSER_LAUNCH_FAILED` | Browser binding issue | Check Cloudflare account limits |
| `R2_UPLOAD_FAILED` | Storage error | Check R2 bucket permissions |

## Dependencies

- `@cloudflare/puppeteer`: ^0.0.12
- `wrangler`: ^3.24.0
- `typescript`: ^5.3.3
- `@cloudflare/workers-types`: ^4.20240117.0

## Security Considerations

1. **URL Validation:** Only allow Amazon URLs in production
2. **Rate Limiting:** Consider adding per-IP rate limits
3. **CORS:** Restrict to known origins
4. **Input Sanitization:** Validate all request parameters

## Monitoring

Use Wrangler tail for real-time logs:
```bash
wrangler tail --env production
```

Key metrics to monitor:
- Screenshot success rate
- Average render time
- Cache hit ratio
- Retry distribution
