# GitHub Pages 404 Debug Log

**Date:** 2026-02-21  
**Issue:** https://perk4.github.io/dailydealfeed/preview.html returning 404

## Root Cause

**GitHub Pages is configured to serve from `/docs` folder, NOT the repository root.**

### Evidence

| File | Location | GitHub Pages URL | Status |
|------|----------|------------------|--------|
| `index.html` | `/docs/index.html` | https://perk4.github.io/dailydealfeed/ | ✅ 200 |
| `about.html` | `/docs/about.html` | https://perk4.github.io/dailydealfeed/about.html | ✅ 200 |
| `preview.html` | `/preview.html` (root) | https://perk4.github.io/dailydealfeed/preview.html | ❌ 404 |

The root `/index.html` contains "DailyDealFeed - Save Money Every Day" (💰 emoji).  
The `/docs/index.html` contains "DailyDealFeed - Hot Deals & Promo Codes".  
GitHub Pages was serving the `/docs/` version, proving that Pages is configured for `/docs` not root.

## Fix Applied

1. Copied `preview.html` from repo root to `/docs/preview.html`
2. Committed and pushed changes

## Verification

After fix, https://perk4.github.io/dailydealfeed/preview.html should work.

## Future Notes

Any HTML files meant to be served via GitHub Pages **must be placed in `/docs/`**, not in the repository root.

The GitHub Pages source configuration can be changed in:
**Repository Settings → Pages → Source → Branch: main, Folder: /docs**

If you want to serve from root instead, change the folder to `/ (root)`.
