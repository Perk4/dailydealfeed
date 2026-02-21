# 📺 DailyDealFeed Episode Workflow

Daily posting checklist for creating and publishing deal episodes.

---

## ⏰ Posting Schedule

**3 episodes per day:**
| Time (EST) | Episode Name | Best Content |
|------------|--------------|--------------|
| 8:00 AM | Morning Deals | Coffee, WFH, productivity items |
| 1:00 PM | Afternoon Finds | Impulse buys, beauty, trending |
| 7:00 PM | Evening Steals | Home, relaxation, gaming |

---

## 🎬 Creating an Episode

### Quick Command
```bash
cd /root/dailydealfeed
node scripts/create-episode.js --name "Morning Deals"
```

### Options
```bash
# Auto-select 7 products (default)
node scripts/create-episode.js

# Custom name
node scripts/create-episode.js --name "Flash Sale!"

# Specific products by ASIN
node scripts/create-episode.js --products B0CQVWT2NH,B0DJ18ZWYQ,B0DC156Y5X

# More/fewer products
node scripts/create-episode.js --count 8

# Rebuild site without new episode
node scripts/create-episode.js --rebuild
```

---

## 📋 Daily Checklist

### Morning (8 AM EST)

- [ ] **Check product queue**
  - Review `production/queue/next-batch.json`
  - Ensure 6-8 good products available

- [ ] **Create morning episode**
  ```bash
  node scripts/create-episode.js --name "Morning Deals"
  ```

- [ ] **Push to GitHub**
  ```bash
  git add -A && git commit -m "Episode X: Morning Deals" && git push
  ```

- [ ] **Wait 2-3 min for GitHub Pages deploy**

- [ ] **Post to Instagram**
  - Screenshot episode on site
  - Write caption with deal highlights
  - Add "Link in bio" CTA
  - Hashtags: #amazonfinds #dealsoftheday #tiktokmademebuyit

- [ ] **Post to TikTok**
  - Quick deal roundup video OR
  - Slideshow of products
  - Pin link to bio

### Afternoon (1 PM EST)
- [ ] Create afternoon episode
- [ ] Push to GitHub
- [ ] Post to IG + TikTok

### Evening (7 PM EST)
- [ ] Create evening episode
- [ ] Push to GitHub
- [ ] Post to IG + TikTok

---

## 📁 Episode Structure

Episodes are stored in `/episodes/`:

```
episodes/
├── episodes.json        # Manifest of all episodes
├── episode-1.json       # First episode data
├── episode-2.json
└── episode-3.json
```

### Episode JSON Format
```json
{
  "number": 1,
  "name": "Morning Deals",
  "date": "Fri, Feb 21, 2026",
  "timestamp": "2026-02-21T13:00:00.000Z",
  "products": [
    {
      "asin": "B0CQVWT2NH",
      "name": "Product Name",
      "price": "$34.99",
      "affiliate_link": "https://...",
      "promoCodes": [...]
    }
  ]
}
```

---

## 🎯 Product Selection Tips

### Mix Categories
Aim for variety in each episode:
- 1-2 Beauty/Skincare
- 1-2 Home/Kitchen
- 1-2 Tech/Gadgets
- 1-2 Lifestyle/Trending

### Prioritize
1. **Products with promo codes** (show real savings!)
2. **Trending items** (currently viral on TikTok)
3. **High-value deals** (40%+ off)
4. **Visual products** (good for social media)

### Avoid
- Repeating products within 3 episodes
- Low-rated products (<4 stars)
- Out-of-stock items

---

## 📱 Social Media Templates

### Instagram Caption
```
🔥 Episode [X] is LIVE!

Today's best finds:
💰 [Product 1] - $XX (was $XX)
💰 [Product 2] - $XX
💰 [Product 3] - $XX

👆 Link in bio for all deals + codes!

#amazonfinds #dealsoftheday #tiktokmademebuyit #amazondeals
```

### TikTok Caption
```
POV: You're about to save so much money 💰

Episode [X] deals live now - link in bio!

#amazonfinds #amazondeals #savemoney #tiktokmademebuyit
```

---

## 🔄 Replenishing the Queue

When products run low:

1. **Run product scout**
   ```bash
   node scripts/discover-products.js
   ```

2. **Review staging**
   - Check `staging/products/approved/`
   - Verify products still available

3. **Update next-batch.json**
   - Add new products to queue
   - Run code hunter for promo codes

---

## 🚨 Troubleshooting

### "No products available"
- Check `production/queue/next-batch.json` has items
- Check `products.json` has products
- Run product scout to discover more

### Episode not showing on site
- Verify `git push` completed
- Wait 2-3 minutes for GitHub Pages
- Check https://perk4.github.io/dailydealfeed/

### Promo code expired
- Update product in queue with new code
- Or remove promo code info
- Re-run `--rebuild` to update

---

## 📊 Success Metrics

Track for each episode:
- [ ] Episode number
- [ ] Post time
- [ ] Products included
- [ ] Social engagement (likes, comments, saves)
- [ ] Link clicks (if tracking)
- [ ] Any sales conversions

---

*Last updated: 2026-02-21*
