# 💰 DailyDealFeed

**Daily Amazon deals with promo codes.** Episode-based deal site with click tracking, automated publishing, and social media workflow.

🔗 **Live:** [perk4.github.io/dailydealfeed](https://perk4.github.io/dailydealfeed)  
📊 **Analytics:** [perk4.github.io/dailydealfeed/analytics.html](https://perk4.github.io/dailydealfeed/analytics.html)

---

## 🚀 Quick Start

```bash
# 1. Create a new episode (auto-selects products)
node scripts/create-episode.js --name "Morning Deals"

# 2. Deploy to GitHub Pages
git add -A && git commit -m "Episode X" && git push origin main

# 3. Site updates in ~2 minutes!
```

---

## 📂 Project Structure

```
dailydealfeed/
├── index.html              # Main site (auto-generated)
├── analytics.html          # Click tracking dashboard
├── css/styles.css          # Site styling
├── js/tracking.js          # Auto-tracks affiliate clicks
├── scripts/
│   └── create-episode.js   # Episode generator
├── episodes/               # Episode data files
│   ├── episodes.json       # Manifest
│   └── episode-*.json      # Individual episodes
├── production/queue/
│   └── next-batch.json     # Product queue
├── products.json           # Product database
└── docs/                   # Documentation
    ├── POSTING-WORKFLOW.md # Complete daily workflow
    ├── PROMO-CODE-SOURCES.md
    └── TRACKING-SETUP.md
```

---

## 🎬 Episode System

### Creating Episodes

```bash
# Default: 7 random products, auto-named by time of day
node scripts/create-episode.js

# Custom name
node scripts/create-episode.js --name "Flash Sale!"

# More products
node scripts/create-episode.js --count 10

# Specific products by ASIN
node scripts/create-episode.js --products B0CQVWT2NH,B0DJ18ZWYQ

# Rebuild index without new episode
node scripts/create-episode.js --rebuild
```

### Episode Features

- ✅ Auto-incrementing episode numbers
- ✅ Accordion UI (latest expanded, older collapsed)
- ✅ Promo code buttons with copy-to-clipboard
- ✅ Savings notes for each product
- ✅ Mobile-responsive design

---

## 📊 Click Tracking

Every affiliate link click is automatically tracked:

- **Real-time** click counts (no 24hr delay)
- **Traffic sources** (Instagram, TikTok, direct, etc.)
- **Device breakdown** (mobile/desktop)
- **Product-level** stats
- **7-day trend** chart

View at: `/analytics.html`

Export data anytime for backup. Works entirely client-side.

---

## 💰 Promo Codes

Products can include promo codes with copy buttons:

```json
{
  "asin": "B0123456",
  "name": "Product Name",
  "promoCodes": [{ "code": "SAVE20", "discount": "20% off" }],
  "savingsNote": "Stack with Subscribe & Save"
}
```

**Code Sources:** SimplyCodes, Vipon, CouponFollow, Amazon Coupons Page

See `docs/PROMO-CODE-SOURCES.md` for detailed hunting guide.

---

## ⏰ Daily Workflow

| Time | Action |
|------|--------|
| 8 AM | Morning episode → push → post socials |
| 1 PM | Afternoon episode → push → post socials |
| 7 PM | Evening episode → push → post socials |

Full checklist: `docs/POSTING-WORKFLOW.md`

---

## 📱 Social Media

### Instagram Caption

```
🔥 Episode [X] is LIVE!

Today's best finds:
💰 [Product 1] - $XX
💰 [Product 2] - $XX

👆 Link in bio for all deals + codes!

#amazonfinds #dealsoftheday #tiktokmademebuyit
```

---

## 🔧 Technical Details

- **Hosting:** GitHub Pages (free, auto-deploys on push)
- **Tracking:** Client-side localStorage (no server needed)
- **Styling:** Custom CSS, mobile-first responsive
- **No build step:** Pure HTML/CSS/JS

---

## 📚 Documentation

| Doc | Purpose |
|-----|---------|
| `docs/POSTING-WORKFLOW.md` | Complete daily workflow |
| `docs/EPISODE-WORKFLOW.md` | Episode system details |
| `docs/TRACKING-SETUP.md` | Click tracking implementation |
| `docs/PROMO-CODE-SOURCES.md` | Finding promo codes |
| `docs/CODE-VERIFICATION.md` | Verifying codes work |

---

## 🤝 Affiliate Disclosure

As an Amazon Associate, we earn from qualifying purchases. Prices and codes valid at time of posting.

---

*Built with ❤️ for deal hunters*
