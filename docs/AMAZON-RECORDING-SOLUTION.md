# Amazon Recording Solution

## Problem

The @dailydealfeed video pipeline requires Amazon mobile UI recordings to generate authentic-looking product videos. Current failure modes:

### Root Cause Analysis

| Issue | Frequency | Impact |
|-------|-----------|--------|
| **Missing Playwright dependencies** | High | Browser won't launch |
| **System libraries missing** (libnspr4, libnss3, etc) | High | Process crashes |
| **Bot detection / CAPTCHA** | Medium | Recording returns null |
| **Product 404 / unavailable** | Low | No recording to capture |
| **Video gen triggers before recording exists** | Medium | Pipeline failure |

### Tested Reality (2026-02-17)

After installing proper dependencies, the recorder **works reliably**:
- 5/5 test recordings succeeded
- No CAPTCHA triggered during sequential requests
- Current IP not blocked

**True root cause**: Missing Playwright browsers/dependencies in fresh environments.

---

## Recommended Solution: Multi-Tier Fallback System

### Tier 1: Optimized Playwright Recording (Primary)

Keep current `amazon-recorder.js` with improvements:

```javascript
// Pre-flight check before recording
async function checkPlaywrightReady() {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    return true;
  } catch (e) {
    console.error('Playwright not ready:', e.message);
    return false;
  }
}
```

**Improvements needed:**
1. Startup dependency check
2. Auto-install missing deps on first run
3. Retry logic with exponential backoff
4. Better error categorization

### Tier 2: Screenshot Slideshow (Fallback)

If recording fails, generate animated slideshow from static images:

```javascript
async function createScreenshotSlideshow(asin, outputPath) {
  // 1. Take 4 screenshots of product images
  // 2. Apply Ken Burns zoom/pan effect
  // 3. Crossfade transitions
  // Result: Looks like mobile browsing without actual recording
}
```

**FFmpeg command for Ken Burns effect:**
```bash
ffmpeg -loop 1 -t 2 -i img1.jpg -loop 1 -t 2 -i img2.jpg \
  -filter_complex \
  "[0:v]scale=1080:1920,zoompan=z='min(zoom+0.001,1.2)':d=60:x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)'[v0]; \
   [1:v]scale=1080:1920,zoompan=z='min(zoom+0.001,1.2)':d=60[v1]; \
   [v0][v1]xfade=transition=fade:duration=0.5:offset=1.5[outv]" \
  -map "[outv]" -c:v libx264 output.mp4
```

### Tier 3: Product Image API (Last Resort)

Use Rainforest API data already available:

```javascript
// Already have this in fetch-amazon.js
const data = await fetchProduct(asin);
// data.images contains all product images from Amazon CDN
```

Generate video from these high-res images with animations.

---

## Architecture

```
Product Pipeline
      │
      ▼
┌─────────────────────────────────────┐
│    Pre-record Check                 │
│    - Playwright ready?              │
│    - Dependencies installed?        │
│    - Output dir writable?           │
└────────────┬────────────────────────┘
             │
             ▼
┌─────────────────────────────────────┐
│    Tier 1: Playwright Recording     │
│    - Launch stealth browser         │
│    - Navigate to Amazon mobile      │
│    - Swipe through images           │
│    - Record video                   │
└────────────┬────────────────────────┘
             │
     Success │ Fail
             │
             ▼
┌─────────────────────────────────────┐
│    Tier 2: Screenshot Slideshow     │ ◄── Only if Tier 1 fails
│    - Fetch product images           │
│    - Apply Ken Burns animations     │
│    - Crossfade transitions          │
└────────────┬────────────────────────┘
             │
     Success │ Fail
             │
             ▼
┌─────────────────────────────────────┐
│    Tier 3: Static Image Video       │ ◄── Only if Tier 2 fails
│    - Use cached product images      │
│    - Basic zoom animation           │
│    - Always works (no network)      │
└─────────────────────────────────────┘
```

---

## Implementation Plan

### Phase 1: Quick Wins (Immediate)

1. **Add `setup-playwright.sh` script**
   - Installs Playwright browsers
   - Installs system dependencies
   - Run on container/machine startup

2. **Add pre-flight check to recorder**
   - Check Playwright is ready before attempting
   - Clear error message if not

3. **Recording status file**
   - Write `amazon_[ASIN].status.json` with result
   - Video gen checks status file before starting

### Phase 2: Fallback System (1-2 days)

1. **Implement screenshot slideshow fallback**
   - Reuse image fetching from Rainforest API
   - Ken Burns effect with FFmpeg

2. **Unified `getProductVideo()` function**
   ```javascript
   async function getProductVideo(asin) {
     // Try Tier 1
     const recording = await tryPlaywrightRecording(asin);
     if (recording) return recording;
     
     // Try Tier 2
     const slideshow = await tryScreenshotSlideshow(asin);
     if (slideshow) return slideshow;
     
     // Tier 3: Always works
     return await createStaticImageVideo(asin);
   }
   ```

### Phase 3: Production Hardening (1 week)

1. **Proxy rotation** (if bot detection increases)
   - Bright Data or SmartProxy integration
   - Only needed if free approach stops working

2. **Recording queue service**
   - Dedicated recording microservice
   - Retry with backoff
   - Health monitoring

---

## Fallback Strategy

| Scenario | Action | Visual Quality |
|----------|--------|----------------|
| Playwright works | Use recording | ★★★★★ Authentic |
| Playwright fails, images available | Ken Burns slideshow | ★★★★☆ Good |
| Playwright fails, no images | Fetch from Rainforest API | ★★★★☆ Good |
| Everything fails | Use cached/placeholder | ★★☆☆☆ Acceptable |

**Key principle**: Never block the pipeline. Always produce a video.

---

## Cost Estimate

| Approach | Monthly Cost |
|----------|--------------|
| Current (Playwright only) | $0 |
| + Screenshot fallback | $0 |
| + Rainforest API | ~$30 (100 req/day) |
| + Residential proxy | ~$30-50 |
| Total worst case | ~$80/month |

**Recommended budget**: $0-30/month (current + Rainforest API if needed)

---

## Quick Reference: Dependency Installation

```bash
# Install Playwright browsers
npx playwright install chromium

# Install system dependencies (Ubuntu/Debian)
npx playwright install-deps chromium

# Or manually:
apt-get install -y \
  libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
  libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
  libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2

# Verify installation
node -e "require('playwright').chromium.launch().then(b => { console.log('✓ Playwright ready'); b.close(); })"
```

---

## Timeline

| Phase | Duration | Effort |
|-------|----------|--------|
| Phase 1: Quick wins | Done today | 2 hours |
| Phase 2: Fallback system | 1-2 days | 4-6 hours |
| Phase 3: Hardening | As needed | Variable |

---

## Conclusion

The Amazon recording system **works** — the issue was missing dependencies, not bot detection. 

**Recommended path forward:**
1. ✅ Fix dependency installation (done)
2. Add pre-flight checks and status files
3. Implement screenshot fallback for resilience
4. Monitor for actual bot detection (unlikely to be an issue)

The pipeline should never fully block on recording failures. With a proper fallback chain, every product can generate a video.
