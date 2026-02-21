# ✅ DailyDealFeed QA Checklist

**Pre-post verification to ensure quality before going live.**

---

## 🚀 Pre-Post Checklist

### Episode Creation
- [ ] Episode created with `node scripts/create-episode.js`
- [ ] Episode number incremented correctly
- [ ] At least 6 products in episode
- [ ] All product images loading
- [ ] Prices displayed correctly
- [ ] Promo codes copied and buttons working

### Site Verification
- [ ] `index.html` updated with new episode
- [ ] New episode appears first and is expanded
- [ ] Accordion toggle works on all episodes
- [ ] Mobile view looks correct (test at 375px width)
- [ ] All "Go to Deal" links work
- [ ] Affiliate tag `dailydealfeed-20` present in URLs

### Tracking Verification
- [ ] `js/tracking.js` loaded (check Network tab)
- [ ] Click a deal link
- [ ] Open DevTools Console: `DealTracker.getSummary()`
- [ ] Verify click was recorded
- [ ] Check analytics.html shows the click

### Pre-Push Checks
```bash
# Verify changes
git diff --stat

# Check for any errors
grep -r "undefined" index.html | grep -v "\.js"

# Verify all episode files exist
ls -la episodes/
```

---

## 🔍 Manual Testing Checklist

### Desktop (Chrome/Firefox/Safari)
- [ ] Homepage loads correctly
- [ ] Navigation links work
- [ ] Episode accordion opens/closes
- [ ] Promo code copy button works
- [ ] Newsletter form submits
- [ ] Analytics page loads and shows data

### Mobile (iOS Safari / Android Chrome)
- [ ] Hamburger menu works
- [ ] Product cards stack properly
- [ ] Touch targets are large enough (44px min)
- [ ] Prices readable
- [ ] Deal buttons tappable

### Affiliate Links
- [ ] Link goes to correct Amazon product
- [ ] `?tag=dailydealfeed-20` in URL
- [ ] No broken links (404s)

---

## 🚨 Common Issues & Fixes

### Issue: Episode not showing on live site

**Symptoms:** Pushed changes but site shows old content

**Fixes:**
1. Wait 2-3 minutes (GitHub Pages build time)
2. Hard refresh: `Ctrl+Shift+R` / `Cmd+Shift+R`
3. Check build status: https://github.com/Perk4/dailydealfeed/actions
4. Clear browser cache

### Issue: "No products available" error

**Symptoms:** `create-episode.js` exits with error

**Fixes:**
```bash
# Check product sources
cat production/queue/next-batch.json | jq '.items | length'
cat products.json | jq '.products | length'

# If empty, add more products to next-batch.json
```

### Issue: Tracking not recording clicks

**Symptoms:** Clicks not appearing in analytics

**Fixes:**
1. Check browser console for errors
2. Verify `<script src="js/tracking.js">` in index.html head
3. Check localStorage: `localStorage.getItem('ddf_click_analytics')`
4. Ensure links have `amazon.com` or class `btn-deal`

### Issue: Promo code not copying

**Symptoms:** Click copy button, nothing happens

**Fixes:**
1. Check if site is served over HTTPS (clipboard requires it)
2. Check browser console for permission errors
3. Test in incognito mode

### Issue: Images not loading

**Symptoms:** Broken image icons

**Fixes:**
1. Verify ASIN is correct
2. Test URL directly: `https://images-na.ssl-images-amazon.com/images/P/{ASIN}.jpg`
3. Some products don't have this URL format - use product.image_url instead

### Issue: Git push rejected

**Symptoms:** `! [rejected] main -> main (fetch first)`

**Fixes:**
```bash
git pull --rebase origin main
git push origin main
```

---

## 📋 Quality Gates

### Before Creating Episode
| Gate | Check | Pass Criteria |
|------|-------|---------------|
| Products | `next-batch.json` has items | ≥ 6 products |
| Codes | Codes verified | Tested in last 7 days |
| Images | URLs checked | No broken images |

### Before Pushing
| Gate | Check | Pass Criteria |
|------|-------|---------------|
| Build | Episode created | No errors in console |
| HTML | index.html updated | New episode at top |
| Tracking | JS included | `tracking.js` in head |

### Before Posting Social
| Gate | Check | Pass Criteria |
|------|-------|---------------|
| Live Site | Visit URL | Episode visible |
| Links | Click 2-3 deals | Go to Amazon |
| Mobile | Check on phone | Readable, tappable |

---

## 🔄 Weekly QA Tasks

### Every Monday
- [ ] Run full mobile test suite
- [ ] Verify all episodes from past week load
- [ ] Check analytics export works
- [ ] Review Amazon Associates dashboard for click discrepancies

### Every Friday  
- [ ] Verify all promo codes still work
- [ ] Update/remove expired codes
- [ ] Backup analytics data (export JSON)
- [ ] Check for any console errors on live site

---

## 📊 Monitoring

### Key Metrics to Watch
| Metric | Normal | Investigate If |
|--------|--------|----------------|
| Page load time | < 2s | > 4s |
| Tracking errors | 0 | Any |
| Broken links | 0 | Any |
| Episode size | 6-10 products | < 5 |

### Health Check Command
```bash
# Quick health check
cd /root/dailydealfeed
echo "Episodes: $(cat episodes/episodes.json | jq '.episodes | length')"
echo "Products in queue: $(cat production/queue/next-batch.json | jq '.items | length')"
echo "Last episode: $(cat episodes/episodes.json | jq -r '.episodes[0].name')"
```

---

## 🚑 Emergency Procedures

### Site Down
1. Check GitHub repo status
2. Check GitHub Pages status: https://www.githubstatus.com/
3. If needed, push a fix or revert

### All Links Broken
1. Check if affiliate tag changed
2. Verify Amazon URLs are valid
3. Rebuild: `node scripts/create-episode.js --rebuild && git push`

### Analytics Lost
1. Check localStorage in browser
2. If data exists, export immediately
3. If cleared, import from last backup

---

*Last updated: 2026-02-21 | Phase 6: Final Integration*
