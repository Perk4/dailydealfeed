# Carrd Site Polish Log

> Progressive improvements to embed pages for @dailydealfeed

## Quality Checklist

Each embed page should pass:
- [x] Product image loads (Amazon CDN)
- [x] Price displays correctly
- [x] Product name truncated nicely
- [x] Affiliate link works (dailydealfeed-20 tag)
- [x] "Shop on Amazon" button prominent
- [x] Mobile responsive
- [ ] Video plays inline
- [x] Fast load time (<2s)
- [ ] No console errors

## Current Status

| Page | Image | Price | Link | Mobile | Video | Score |
|------|-------|-------|------|--------|-------|-------|
| video-embed.html?id=1 | ✅ | ✅ | ✅ | ✅ | ✅ | 9/10 |
| product-1.html (static) | ✅ | ✅ | ✅ | ✅ | ❌ 404 | 5/10 |

## Improvement Log

### 2026-02-17 - Cycle 1: Initial Audit
**Pages Audited:** 2 (video-embed.html, product-1.html)
**Issues Found:**
1. `product-1.html` references `video_1_latest.mp4` which doesn't exist (404)
   - Videos are named `video_1_<timestamp>.mp4` not `video_1_latest.mp4`
2. Static pages can't track latest video - dynamic `video-embed.html` is the correct solution

**Recommendation:** Use `video-embed.html?id=N` for Carrd embeds instead of static pages
- Dynamic approach finds latest video via GitHub API
- No hardcoded video filenames to break
- Same visual quality/styling

**Next Steps:**
- Deprecate static product-*.html in favor of video-embed.html
- Consider creating symlinks/redirects for any existing Carrd integrations

---

## Format
```
### [DATE] - [IMPROVEMENT]
**Pages Affected:** [which product pages]
**Issue:** [what was wrong]
**Fix:** [what we changed]
**Evidence:** [screenshot/test result]
**Commit:** [hash]
```
