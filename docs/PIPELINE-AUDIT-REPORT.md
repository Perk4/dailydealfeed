# Pipeline Audit Report

**Date:** 2026-02-20  
**Auditor:** Pipeline Investigator Agent  
**Repository:** /root/dailydealfeed

---

## Executive Summary

The @dailydealfeed video pipeline is **partially operational** with a **73% video generation success rate** (16/22 products have approved videos). The pipeline successfully generates TikTok/Instagram-ready short-form videos with voiceover, music, and product overlays.

**Key strengths:** Robust video editing (V10 with sticker overlays), good product database, working QA system, complete post metadata generation.

**Critical issues:** The production queue is depleted (0 pending items), 6 items stuck in "needs-review" limbo, embed pages not being generated, and QA bitrate threshold is causing marginal rejections. The pipeline is essentially **paused** until these are addressed.

---

## Pipeline Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        @dailydealfeed VIDEO PIPELINE                         │
└─────────────────────────────────────────────────────────────────────────────┘

┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  1. PRODUCT  │───▶│  2. QUEUE    │───▶│  3. AMAZON   │───▶│  4. VIDEO    │
│  DISCOVERY   │    │  MANAGEMENT  │    │  DATA FETCH  │    │  GENERATION  │
│              │    │              │    │              │    │              │
│ 22 products  │    │ 16 complete  │    │ Screenshots  │    │ editor.js V10│
│ 36+ curated  │    │ 6 stuck      │    │ 0 cached     │    │ 16 approved  │
│ ✅ Working   │    │ ⚠️ Depleted  │    │ ⚠️ Empty     │    │ ✅ Working   │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
                                                                    │
                                                                    ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│  7. OUTPUT   │◀───│  6. EMBED    │◀───│  5. QA       │◀───│              │
│  DELIVERY    │    │  PAGES       │    │  VALIDATION  │    │              │
│              │    │              │    │              │    │              │
│ 16 videos    │    │ 1 of 22      │    │ Bitrate      │    │              │
│ Ready to post│    │ generated    │    │ threshold    │    │              │
│ ✅ Complete  │    │ ❌ Broken    │    │ ⚠️ Too strict│    │              │
└──────────────┘    └──────────────┘    └──────────────┘    └──────────────┘
```

---

## Step-by-Step Findings

### 1. Product Discovery

**Status:** 🟢 Working

**Current State:**
- `discover-products.js` contains 36+ curated viral products (hardcoded database)
- Categories: skincare, beauty, cleaning, home, drinkware, footwear, tech
- `products.json` has 3 products (minimal test set)
- `staging/products/manifest.json` has 22 products, all approved
- Auto-expand triggers discovery when queue < 3 items

**Issues:**
- ⚠️ Only hardcoded curated products - no dynamic discovery from trends
- ⚠️ `products.json` only has 3 products vs manifest's 22

**Action Items:**
- [ ] 🟢 Consider adding API-based trend discovery (Rainforest trending, etc.)
- [ ] 🟢 Sync products.json with manifest for consistency

---

### 2. Queue Management

**Status:** 🟡 Needs Attention

**Current State:**
```json
{
  "total": 22,
  "pending": 0,
  "completed": 16,
  "needs-review": 6,
  "failed": 0
}
```

**Issues:**
- 🔴 **Queue depleted**: 0 pending items means NO new videos will generate
- 🔴 **6 items stuck in "needs-review"**: These will never be processed
- ⚠️ Auto-expand triggers but only adds to manifest, doesn't rebuild queue properly

**Root Cause:**
The queue was built once, items got processed or stuck, but there's no mechanism to:
1. Retry "needs-review" items
2. Add new products as pending when they're discovered
3. Clear completed items and cycle through products again

**Action Items:**
- [ ] 🔴 Fix `queue-manager.js` to reset "needs-review" items to "pending" for retry
- [ ] 🔴 Add `--reset-queue` command to force rebuild fresh queue
- [ ] 🟡 Implement round-robin so completed products can be re-used with different clips

---

### 3. Amazon Data Fetching

**Status:** 🟡 Partially Working

**Current State:**
- `fetch-amazon.js` uses Rainforest API (key present in code)
- `amazon-screenshot.js` exists with Playwright integration
- Screenshot directory: **0 files** in `temp/screenshots/`
- `amazon-recorder.js` exists for video recordings

**Issues:**
- ⚠️ No cached screenshots - every video uses static images or re-fetches
- ⚠️ Rainforest API key hardcoded (should be env variable)
- ⚠️ No rate limiting beyond 1 req/second

**Root Cause:**
Screenshots are either being cleaned up after use or Playwright isn't running successfully in the environment.

**Action Items:**
- [ ] 🟡 Move `RAINFOREST_API_KEY` to environment variable
- [ ] 🟡 Debug why screenshots aren't being cached
- [ ] 🟢 Add screenshot caching to avoid redundant API calls

---

### 4. Video Generation

**Status:** 🟢 Working Well

**Current State:**
- Editor: **V10** with price sticker overlays
- Features: Ken Burns zoom, voiceover, background music, bounce animations
- Video format: 1080x1920 (9:16), 10-14 seconds
- Success rate: **16/22 approved (73%)**
- 1 video in rejected/ folder

**Video Structure:**
```
[0-5s]   AFV clip hook (original audio preserved)
[5-10s]  Product showcase with price sticker
[10-12s] CTA: "Link in bio"
```

**Issues:**
- ⚠️ Some videos get rejected for borderline bitrate
- ⚠️ 50+ historical rejections in output/rejected/ (mostly bitrate issues)

**Action Items:**
- [ ] 🟡 Increase FFmpeg encoding quality to ensure >1 Mbps output
- [ ] 🟢 Add bitrate target to encoder settings (`-b:v 1.5M`)

---

### 5. QA Validation

**Status:** 🟡 Threshold Too Strict

**Current State:**
- `video-qa.js` checks: resolution, duration, audio, bitrate, file size, aspect ratio
- Thresholds:
  - Duration: 8-15 seconds ✓
  - Resolution: 1080x1920 ✓
  - Bitrate: **≥600 Kbps** (code says 600K but error says "need ≥1 Mbps")

**Issues:**
- 🔴 **Bitrate mismatch**: Code sets `minBitrate: 600000` but error message says "need ≥1 Mbps"
- 🔴 Rejection example: `video_16` rejected at 0.53 Mbps
- 🔴 Another near-miss: `video_3` rejected at 0.96 Mbps

**Root Cause:**
The QA error message says "need ≥1 Mbps" but threshold is set to 600Kbps. Either:
1. There's an old comment/message not matching current threshold
2. Threshold was recently lowered but videos still failing

Looking at rejection: 0.53 Mbps < 0.6 Mbps threshold, so it's correctly rejecting.

**Action Items:**
- [ ] 🟡 Consider lowering threshold to 500Kbps for short-form video
- [ ] 🟡 Fix error message to match actual threshold
- [ ] 🟢 Add QA report summary to production logs

---

### 6. Embed Page Generation

**Status:** 🔴 Broken/Incomplete

**Current State:**
- `generate-embed.js` exists and works
- **Only 1 embed page created**: `embeds/product-1.html`
- **0 pages in docs/**: `ls docs/product-*.html` returns 0
- `docs/index.html` exists with video gallery structure
- Carrd integration mentioned in README

**Issues:**
- 🔴 Embed pages not generated for 21/22 products
- 🔴 No automation to generate embeds after video approval
- ⚠️ Index.html references videos but no individual product pages

**Root Cause:**
`generate-embed.js` isn't being called automatically after video generation. It's a manual step that was run once for product 1.

**Action Items:**
- [ ] 🔴 Add embed generation to queue-manager.js post-video hook
- [ ] 🔴 Run `node generate-embed.js` for all 22 products
- [ ] 🟡 Auto-update docs/index.html with new videos

---

### 7. Output & Delivery

**Status:** 🟢 Ready for Posting

**Current State:**
- **16 videos** in output/approved/
- **16 post metadata JSONs** with complete IG/TikTok captions
- **16 thumbnails** generated
- Metadata includes:
  - `ig_caption` and `tiktok_caption`
  - `voiceover_script`
  - `hook_angle`
  - `ready_for_posting: true`
  - `music_track`

**Sample Output:**
```json
{
  "product_name": "BYPHASSE Face Mist with Rose Water",
  "product_price": "$8.99",
  "ig_caption": "Check this out: BYPHASSE Face Mist...\n🔗 Link in bio!",
  "tiktok_caption": "Check this out: BYPHASSE Face Mist 🤯 #amazonfinds",
  "ready_for_posting": true
}
```

**Issues:**
- ⚠️ No automated posting (manual upload required)
- ⚠️ Post JSONs in output/ root, not output/approved/ with videos

**Action Items:**
- [ ] 🟢 Move post_*.json to same folder as approved videos
- [ ] 🟢 Consider adding posting automation (Later, TikTok API, etc.)

---

## Critical Action Items (Priority Order)

| # | Priority | Action Item | Effort | Impact |
|---|----------|-------------|--------|--------|
| 1 | 🔴 | Fix queue to reset "needs-review" → "pending" for retry | 1h | Critical - unblocks pipeline |
| 2 | 🔴 | Generate missing embed pages for all 22 products | 30m | Critical - Carrd broken |
| 3 | 🔴 | Add `--reset-queue` command for full queue rebuild | 1h | Critical - enables fresh runs |
| 4 | 🟡 | Lower QA bitrate threshold to 500Kbps or increase encoder quality | 30m | High - fewer rejections |
| 5 | 🟡 | Auto-generate embed pages after video approval | 1h | High - automation |
| 6 | 🟡 | Move Rainforest API key to env variable | 15m | Medium - security |
| 7 | 🟢 | Add bitrate target to FFmpeg encoder | 30m | Medium - quality |
| 8 | 🟢 | Sync products.json with manifest | 15m | Low - consistency |

---

## Recommendations

### Immediate (Today)
1. **Reset the queue**: Create `--reset-queue` flag or manually edit queue.json to set all items back to "pending"
2. **Generate embeds**: Run `for i in {1..22}; do node scripts/generate-embed.js $i; done`
3. **Reprocess stuck items**: The 6 "needs-review" items need manual intervention

### Short-term (This Week)
1. **Improve video bitrate**: Add `-b:v 1.5M` to FFmpeg encoding to ensure all videos pass QA
2. **Automate embed generation**: Hook into queue-manager.js completion flow
3. **Add metrics dashboard**: Track success rate, rejection reasons, queue depth

### Long-term (This Month)
1. **Dynamic product discovery**: Add trending product APIs beyond curated list
2. **A/B testing integration**: The `ab-testing.js` script exists - wire it up
3. **Posting automation**: Integrate with Later or direct TikTok/IG APIs

---

## Estimated Effort

| Action Item | Effort | Impact | Dependencies |
|-------------|--------|--------|--------------|
| Reset queue mechanism | 1h | Critical | None |
| Generate all embed pages | 30m | Critical | None |
| Lower QA threshold | 15m | High | None |
| Add encoder bitrate target | 30m | Medium | Testing |
| Auto-embed hook | 1h | High | Queue changes |
| API key to env | 15m | Medium | None |
| Posting automation | 4h | High | API access |

**Total estimated: ~8 hours for all items**

---

## Next Steps

1. **Right now:** Run `node scripts/queue-manager.js --build-queue` to rebuild queue
2. **Generate embeds:** `cd /root/dailydealfeed && for i in $(seq 1 22); do node scripts/generate-embed.js $i; done`
3. **Test one video:** Run `node scripts/queue-manager.js --generate-one` to verify pipeline works
4. **Monitor:** Check `production/auto-expand.log` for issues

---

## Appendix: File Locations

```
/root/dailydealfeed/
├── scripts/
│   ├── discover-products.js   # Product discovery
│   ├── auto-expand.js         # Orchestration
│   ├── queue-manager.js       # Queue management
│   ├── fetch-amazon.js        # Amazon API
│   ├── editor.js              # Video generation (V10)
│   ├── video-qa.js            # QA validation
│   └── generate-embed.js      # Embed pages
├── staging/
│   ├── products/manifest.json # 22 products
│   └── clips/manifest.json    # 66 clips
├── production/
│   ├── queue/queue.json       # Current queue state
│   └── auto-expand.log        # Pipeline logs
├── output/
│   ├── approved/              # 16 videos ready
│   └── rejected/              # 50+ historical rejections
├── docs/
│   └── index.html             # Gallery page
└── embeds/
    └── product-1.html         # Only 1 embed exists
```

---

*Report generated by Pipeline Investigator Agent*
