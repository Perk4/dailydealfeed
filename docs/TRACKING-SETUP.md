# Affiliate Link Tracking Setup

## Overview

DailyDealFeed uses a self-hosted JavaScript click tracking system. This approach was chosen over external services for the following reasons:

| Option | Decision | Why |
|--------|----------|-----|
| JoyLink.io | ❌ Not used | $20/mo + usage costs - overkill for starting out |
| Amazon Dashboard | ✅ Used as backup | Already tracks conversions & revenue via affiliate tag |
| Self-hosted JS | ✅ Primary | Free, no dependencies, full control, works on GitHub Pages |
| Bitly/Rebrandly | ❌ Not used | Limited free tier, adds external dependency |

## How It Works

### Architecture

```
User clicks "Go to Deal" button
        ↓
tracking.js captures click event
        ↓
Extracts: product name, price, discount, ASIN
        ↓
Records: timestamp, device type, traffic source
        ↓
Saves to localStorage (browser storage)
        ↓
User redirected to Amazon (no delay)
```

### Data Stored

```json
{
  "version": "1.0.0",
  "totalClicks": 150,
  "products": {
    "gaming-monitor-27-inch": {
      "name": "27 Inch Curved Gaming Monitor 200Hz",
      "price": "$118.74",
      "discount": "20% OFF",
      "clicks": 25,
      "firstClick": "2026-02-20T10:30:00Z",
      "lastClick": "2026-02-21T14:22:00Z"
    }
  },
  "daily": {
    "2026-02-21": { "clicks": 45, "products": {...} }
  },
  "sources": {
    "direct": 80,
    "instagram": 40,
    "tiktok": 30
  },
  "devices": {
    "mobile": 100,
    "desktop": 45,
    "tablet": 5
  }
}
```

## Files

| File | Purpose |
|------|---------|
| `js/tracking.js` | Core tracking library (auto-initializes) |
| `analytics.html` | Dashboard to view click data |

## Usage

### Automatic Tracking

The script auto-tracks clicks on:
- Links containing `amzn.to`
- Links containing `amazon.com`
- Elements with class `.btn-deal`

No manual integration needed - just include the script.

### Manual Tracking (Advanced)

```javascript
// Track a click manually
DealTracker.track({
  id: 'product-123',
  name: 'Cool Product',
  price: '$29.99',
  discount: '30% OFF'
});

// Get summary data
const summary = DealTracker.getSummary();
console.log(summary.topProducts);

// Export as JSON
const json = DealTracker.exportData();

// Download JSON file
DealTracker.downloadData();

// Import data (merges with existing)
DealTracker.importData(jsonString);

// Clear all data
DealTracker.clearData();
```

## Analytics Dashboard

Visit `/analytics.html` to see:

- **Total clicks** - All-time click count
- **Today's clicks** - Daily counter
- **7-day chart** - Visual trend
- **Top products** - Ranked by clicks
- **Traffic sources** - Where visitors come from
- **Device breakdown** - Mobile vs desktop

### Exporting Data

Click "Export JSON" to download a complete backup. Useful for:
- Keeping records (localStorage can be cleared)
- Analyzing in spreadsheets
- Importing to another browser/device

### Importing Data

Use "Import Data" to merge analytics from:
- Another browser
- Previous exports
- Multiple devices

Data is merged, not replaced - click counts add up.

## Limitations

1. **Client-side only** - Data lives in user's browser
   - Lost if browser data cleared
   - Not shared across devices
   - Solution: Export regularly

2. **No server-side storage** - GitHub Pages is static
   - Can't aggregate across all visitors
   - Each visitor has their own analytics
   - Solution: For site-wide stats, use Google Analytics events

3. **No conversion tracking** - We track clicks, not purchases
   - Amazon's dashboard shows actual conversions
   - Use both together for full picture

## Recommended Workflow

1. **Daily**: Check Amazon Associates dashboard for conversions/revenue
2. **Weekly**: Export analytics JSON for backup
3. **Monthly**: Review which products get most clicks, update content strategy

## Future Enhancements

If the site grows, consider:

1. **Cloudflare Workers backend** - Server-side storage, aggregate all visitors
2. **Google Analytics events** - Free, server-aggregated analytics
3. **JoyLink.io** - If revenue justifies $20/mo cost

## Comparison: Our Tracking vs Amazon Dashboard

| Metric | Our Tracking | Amazon Dashboard |
|--------|--------------|------------------|
| Click counts | ✅ Real-time | ⏰ 24h delay |
| Which products clicked | ✅ Yes | ❌ By clicks only, no product names |
| Traffic source | ✅ Yes | ❌ No |
| Device type | ✅ Yes | ❌ No |
| Conversions | ❌ No | ✅ Yes |
| Revenue | ❌ No | ✅ Yes |
| Cross-device | ❌ No | ✅ Yes |

**Use both together for best insights!**

---

*Setup completed: 2026-02-21*
