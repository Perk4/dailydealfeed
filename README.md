# dailydealfeed

Link directory for [@dailydealfeed](https://instagram.com/dailydealfeed) — curated product finds.

## How It Works

- `products.json` — Product data (updated by agent)
- `embed.html` — Embeddable product grid for Carrd
- `index.html` — Standalone landing page

## Live

- **Site:** [perk4.github.io/dailydealfeed](https://perk4.github.io/dailydealfeed)
- **Carrd:** [dailydealfeed.carrd.co](https://dailydealfeed.carrd.co)

## Updating Products

Edit `products.json` and push. The Carrd embed fetches fresh data on each page load.

```json
{
  "id": "16",
  "name": "New Product",
  "category": "tech",
  "price": "$29",
  "image": "https://...",
  "link": "https://amazon.com/dp/ASIN?tag=dailydealfeed-20",
  "tagline": "Why you need this",
  "featured": false
}
```

---

*As an Amazon Associate, we earn from qualifying purchases.*
