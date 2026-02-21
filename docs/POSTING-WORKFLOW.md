# 📋 DailyDealFeed Complete Posting Workflow

**One document to rule them all.** This combines episode creation, promo codes, tracking, and social posting into a single daily workflow.

---

## 🚀 Quick Start (TL;DR)

```bash
# 1. Create a new episode
cd /root/dailydealfeed
node scripts/create-episode.js --name "Morning Deals"

# 2. Push to GitHub (triggers deploy)
git add -A && git commit -m "Episode X" && git push origin main

# 3. Wait 2-3 min, then post on social media
```

**That's it!** The system handles the rest automatically.

---

## ⏰ Daily Schedule

| Time (EST) | Episode | Best Categories |
|------------|---------|-----------------|
| **8:00 AM** | Morning Deals | Coffee, WFH, productivity |
| **1:00 PM** | Afternoon Finds | Beauty, trending, impulse buys |
| **7:00 PM** | Evening Steals | Home, relaxation, gaming |

---

## 📂 System Architecture

```
/root/dailydealfeed/
├── scripts/
│   └── create-episode.js     # Creates new episodes
├── episodes/
│   ├── episodes.json         # Episode manifest
│   └── episode-*.json        # Individual episode data
├── production/queue/
│   └── next-batch.json       # Product queue (14 products)
├── products.json             # Main product database
├── js/
│   └── tracking.js           # Click tracking (auto-loaded)
├── index.html                # Main site (auto-rebuilt)
└── analytics.html            # View click analytics
```

---

## 🎬 Creating Episodes

### Basic Usage

```bash
# Auto-select 7 products, auto-name by time of day
node scripts/create-episode.js

# Custom name
node scripts/create-episode.js --name "Flash Sale!"

# More products
node scripts/create-episode.js --count 10

# Specific products by ASIN
node scripts/create-episode.js --products B0CQVWT2NH,B0DJ18ZWYQ

# Rebuild site without creating new episode
node scripts/create-episode.js --rebuild
```

### What Happens

1. Products selected from `next-batch.json` and `products.json`
2. Episode JSON created in `episodes/`
3. `index.html` rebuilt with new episode at top (accordion format)
4. Latest episode auto-expanded, older collapsed

---

## 💰 Promo Codes

### Code Sources (ranked by reliability)

| Source | Success Rate | Best For |
|--------|--------------|----------|
| [SimplyCodes](https://www.simplycodes.com) | 95% | Verified working codes |
| [Vipon](https://www.vipon.com) | 80% | Seller-direct codes |
| [CouponFollow](https://couponfollow.com) | 75% | Amazon-wide codes |
| Amazon Coupons Page | 100% | Clippable coupons |

### Adding Codes to Products

Edit `production/queue/next-batch.json`:

```json
{
  "asin": "B0123456",
  "name": "Product Name",
  "promoCodes": [
    {
      "code": "SAVE20",
      "discount": "20% off"
    }
  ],
  "savingsNote": "Stack with Subscribe & Save for extra 15%"
}
```

### Working Codes Found

- **STOCKUPSAVE** — $15 off $50+ household items (verified working)

### Verification Steps

1. Add product to cart on Amazon
2. Apply code at checkout
3. Verify discount appears
4. Check expiration if shown

See `docs/CODE-VERIFICATION.md` for detailed verification process.

---

## 📊 Click Tracking

### How It Works

- **Automatic:** All Amazon links tracked (no setup needed)
- **Client-side:** Uses localStorage (no server required)
- **Real-time:** Instant click data vs Amazon's 24hr delay

### Viewing Analytics

Visit: https://perk4.github.io/dailydealfeed/analytics.html

Shows:
- Total clicks / today's clicks
- 7-day trend chart
- Top products by clicks
- Traffic sources (direct, Instagram, TikTok, etc.)
- Device breakdown (mobile/desktop)

### Exporting Data

Click "Export JSON" in analytics dashboard to download backup.

### Tracking vs Amazon Dashboard

| Metric | Our Tracking | Amazon Dashboard |
|--------|--------------|------------------|
| Click counts | ✅ Real-time | ⏰ 24hr delay |
| Traffic source | ✅ Yes | ❌ No |
| Conversions | ❌ No | ✅ Yes |
| Revenue | ❌ No | ✅ Yes |

**Use both together!**

---

## 📱 Social Media Posting

### Instagram Caption Template

```
🔥 Episode [X] is LIVE!

Today's best finds:
💰 [Product 1] - $XX
💰 [Product 2] - $XX
💰 [Product 3] - $XX

👆 Link in bio for all deals + codes!

#amazonfinds #dealsoftheday #tiktokmademebuyit #amazondeals #savemoney
```

### TikTok Caption Template

```
POV: You're about to save so much money 💰

Episode [X] deals live now - link in bio!

#amazonfinds #amazondeals #savemoney #tiktokmademebuyit
```

### Content Ideas

1. **Screenshot slideshow** of episode products
2. **Quick deal roundup** video (30-60 sec)
3. **Product demo** for one featured item
4. **Before/after** savings reveal

---

## 📋 Daily Checklist

### Morning (8 AM EST)

- [ ] Check `production/queue/next-batch.json` has products
- [ ] Run `node scripts/create-episode.js --name "Morning Deals"`
- [ ] `git add -A && git commit -m "Episode X" && git push`
- [ ] Wait 2-3 min for GitHub Pages deploy
- [ ] Post to Instagram (screenshot + caption)
- [ ] Post to TikTok (video/slideshow)

### Afternoon (1 PM EST)

- [ ] `node scripts/create-episode.js --name "Afternoon Finds"`
- [ ] Commit & push
- [ ] Post to socials

### Evening (7 PM EST)

- [ ] `node scripts/create-episode.js --name "Evening Steals"`
- [ ] Commit & push
- [ ] Post to socials

### Weekly Tasks

- [ ] Export analytics JSON for backup
- [ ] Check Amazon Associates dashboard for conversions
- [ ] Research new products for queue
- [ ] Hunt for new promo codes

---

## 🔄 Replenishing Products

When running low on products:

1. **Manual research:**
   - Check TikTok #TikTokMadeMeBuyIt
   - Amazon Movers & Shakers
   - Competitor accounts (@codesinred, @kristen.guides)

2. **Add to queue:**
   Edit `production/queue/next-batch.json` with new products

3. **Hunt for codes:**
   Use SimplyCodes, Vipon, CouponFollow

---

## 🚨 Troubleshooting

### "No products available"

```bash
# Check product sources
cat production/queue/next-batch.json | head -20
cat products.json | head -20
```

Add more products to either file.

### Episode not showing on live site

1. Verify `git push` completed successfully
2. Wait 2-3 minutes (GitHub Pages build time)
3. Hard refresh: Ctrl+Shift+R / Cmd+Shift+R
4. Check https://github.com/Perk4/dailydealfeed/actions for deploy status

### Promo code expired

1. Update product in `production/queue/next-batch.json`
2. Remove or replace the `promoCodes` array
3. Run `node scripts/create-episode.js --rebuild`
4. Commit and push

### Tracking not working

1. Check browser console for errors
2. Verify `js/tracking.js` is loaded in `index.html`
3. Click a deal and check localStorage for `ddf_click_analytics`

---

## 📈 Success Metrics

Track weekly:

| Metric | Target | Source |
|--------|--------|--------|
| Episodes posted | 21/week (3/day) | Git commits |
| Link clicks | Track trend | analytics.html |
| Social engagement | Growing | IG/TikTok insights |
| Conversions | Any | Amazon Associates |

---

## 🔗 Quick Links

- **Live Site:** https://perk4.github.io/dailydealfeed/
- **Analytics:** https://perk4.github.io/dailydealfeed/analytics.html
- **GitHub Repo:** https://github.com/Perk4/dailydealfeed
- **Amazon Associates:** https://affiliate-program.amazon.com/

---

## 📚 Related Docs

- `docs/EPISODE-WORKFLOW.md` — Episode system details
- `docs/TRACKING-SETUP.md` — Tracking implementation
- `docs/PROMO-CODE-SOURCES.md` — Code hunting guide
- `docs/CODE-VERIFICATION.md` — Verifying codes work
- `docs/CODESINRED-VIDEO-STYLE.md` — Video style reference
- `docs/VIDEO-STYLE-GAPS.md` — Improvement opportunities

---

*Last updated: 2026-02-21 | Phase 6: Pipeline Integration Complete*
