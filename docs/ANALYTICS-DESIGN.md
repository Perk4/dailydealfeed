# Analytics Design - DailyDealFeed Embed Tracking

## Overview

Lightweight, privacy-conscious analytics for measuring engagement on GitHub Pages embed pages.

## Metrics to Track

### Core Metrics
| Metric | Description | Collection Method |
|--------|-------------|-------------------|
| **Page Views** | Embed page loads | Client-side beacon on load |
| **Click-throughs** | Amazon link clicks | onclick handler |
| **Referrer** | Where traffic comes from | document.referrer |
| **Session Duration** | Time on page before click | timestamp diff |

### Derived Metrics
- **Click-through Rate (CTR)**: clicks / views × 100
- **Engagement Rate**: (clicks + video plays) / views
- **Conversion Path**: referrer → view → click

## Privacy-Conscious Approach

### What We DO Collect
- Product ID (from page URL)
- Timestamp (rounded to hour for anonymity)
- Referrer domain (not full URL)
- Device category (mobile/desktop, from user-agent)
- Session ID (random, non-persistent, page-session only)

### What We DO NOT Collect
- IP addresses
- Personal identifiers (cookies, fingerprints)
- Full user agents
- Cross-session tracking
- Geographic location (unless from referrer)

### Compliance
- No cookies required
- No GDPR/CCPA consent needed (no PII)
- Data retained for 90 days max
- Aggregated after 7 days

## Storage Options

### Option 1: JSON Log Files (Implemented)
**Pros:** Simple, works with GitHub Actions, no external services
**Cons:** Requires periodic collection, limited real-time

```
data/
  clicks/
    2026-02-20.json
    2026-02-21.json
```

### Option 2: Beacon Endpoint (Future)
**Pros:** Real-time, scalable
**Cons:** Requires server/Cloudflare Worker

```javascript
navigator.sendBeacon('/track', JSON.stringify(event));
```

### Option 3: Google Analytics (Not Recommended)
**Pros:** Full-featured
**Cons:** Privacy concerns, tracking scripts, GDPR issues

## Implementation

### Client-Side Tracking Code

```javascript
// Minimal tracking snippet (< 500 bytes gzipped)
(function() {
  var pid = location.pathname.match(/product-(\d+)/)?.[1];
  if (!pid) return;
  
  var sid = Math.random().toString(36).slice(2);
  var t0 = Date.now();
  
  // Track view on load
  track('view', pid, sid);
  
  // Track clicks on Amazon links
  document.querySelectorAll('.buy-btn').forEach(function(btn) {
    btn.addEventListener('click', function(e) {
      track('click', pid, sid, {
        duration: Math.round((Date.now() - t0) / 1000)
      });
    });
  });
  
  function track(event, productId, sessionId, extra) {
    var data = {
      e: event,
      p: productId,
      s: sessionId,
      t: Math.floor(Date.now() / 3600000) * 3600000, // Round to hour
      r: document.referrer ? new URL(document.referrer).hostname : '',
      d: /Mobile/.test(navigator.userAgent) ? 'm' : 'd'
    };
    if (extra) Object.assign(data, extra);
    
    // Send via image pixel (works everywhere, no CORS)
    new Image().src = 'https://your-endpoint.com/t.gif?' + 
      new URLSearchParams(data).toString();
  }
})();
```

### Data Schema

```json
{
  "event": "click",
  "product_id": "12",
  "session_id": "a7x9k2m",
  "timestamp": 1708401600000,
  "referrer": "twitter.com",
  "device": "mobile",
  "duration_sec": 45
}
```

### Aggregated Daily Report

```json
{
  "date": "2026-02-20",
  "products": {
    "1": { "views": 150, "clicks": 12, "ctr": 8.0 },
    "2": { "views": 89, "clicks": 5, "ctr": 5.6 }
  },
  "referrers": {
    "twitter.com": 120,
    "direct": 45,
    "tiktok.com": 200
  },
  "devices": {
    "mobile": 340,
    "desktop": 25
  },
  "totals": {
    "views": 365,
    "clicks": 17,
    "ctr": 4.66
  }
}
```

## Tracking Flow

```
User arrives at embed page
         │
         ▼
    [Page Load]
         │
         ├──► Track "view" event
         │    - product_id
         │    - timestamp
         │    - referrer
         │
         ▼
    [User watches video]
         │
         ▼
    [User clicks "Shop on Amazon"]
         │
         ├──► Track "click" event
         │    - product_id
         │    - session duration
         │    - timestamp
         │
         ▼
    [Redirect to Amazon with affiliate tag]
```

## Future Enhancements

1. **Video engagement tracking**
   - Play/pause events
   - Watch percentage
   - Completion rate

2. **A/B testing integration**
   - Track by hook variant
   - Compare conversion by video style

3. **Real-time dashboard**
   - WebSocket updates
   - Live view counter

4. **Attribution**
   - Multi-touch attribution
   - Campaign parameters (utm_*)

## Files Created

- `docs/ANALYTICS-DESIGN.md` - This design document
- `docs/DASHBOARD-SCHEMA.md` - Dashboard visualization schema
- `scripts/analytics.js` - CLI for processing click data
- `docs/track.js` - Client-side tracking snippet (embedded in pages)

---

*Last updated: 2026-02-20*
