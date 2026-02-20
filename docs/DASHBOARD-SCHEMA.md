# Dashboard Schema - DailyDealFeed Analytics

## Overview

Schema for displaying engagement metrics from embed page tracking.

## Metrics to Display

### 1. Key Performance Indicators (KPIs)

| Metric | Formula | Target | Display |
|--------|---------|--------|---------|
| **Total Views** | sum(views) | - | Number, trend arrow |
| **Total Clicks** | sum(clicks) | - | Number, trend arrow |
| **Overall CTR** | clicks/views × 100 | ≥3% | Percentage, color-coded |
| **Top Product** | max(clicks) | - | Product name + ID |
| **Top Referrer** | max(referrer_views) | - | Domain name |

### 2. Time Series Charts

#### Daily Views & Clicks (Line Chart)
```
Period: Last 30 days
X-axis: Date (YYYY-MM-DD)
Y-axis (left): Views
Y-axis (right): Clicks
Colors: Views = Blue, Clicks = Orange
```

#### CTR Trend (Area Chart)
```
Period: Last 14 days
X-axis: Date
Y-axis: CTR percentage
Target line: 3% (green dashed)
```

### 3. Product Performance Table

| Column | Type | Sort | Notes |
|--------|------|------|-------|
| Rank | Number | - | By clicks |
| Product | String | - | Truncated to 40 chars |
| ASIN | String | - | Link to Amazon |
| Views | Number | ↓↑ | - |
| Clicks | Number | ↓↑ | - |
| CTR | Percent | ↓↑ | Color: red <2%, yellow 2-4%, green >4% |
| Revenue* | Currency | ↓↑ | Estimated from Amazon API |

### 4. Referrer Breakdown (Pie Chart)

```json
{
  "segments": [
    { "label": "TikTok", "value": 45, "color": "#000000" },
    { "label": "Twitter/X", "value": 25, "color": "#1DA1F2" },
    { "label": "Direct", "value": 15, "color": "#666666" },
    { "label": "Instagram", "value": 10, "color": "#E4405F" },
    { "label": "Other", "value": 5, "color": "#CCCCCC" }
  ]
}
```

### 5. Device Distribution (Donut Chart)

```json
{
  "segments": [
    { "label": "Mobile", "value": 85, "color": "#4CAF50" },
    { "label": "Desktop", "value": 15, "color": "#2196F3" }
  ]
}
```

## Aggregation Periods

### Hourly (Real-time)
- **Retention:** 24 hours
- **Use case:** Live monitoring
- **Granularity:** 1 hour

### Daily
- **Retention:** 90 days
- **Use case:** Daily reports, trend analysis
- **Granularity:** 1 day

### Weekly
- **Retention:** 1 year
- **Use case:** Week-over-week comparison
- **Aggregation:** Monday-Sunday

### Monthly
- **Retention:** Forever
- **Use case:** Long-term trends, seasonality
- **Aggregation:** Calendar month

## Data Structures

### DailyMetrics
```typescript
interface DailyMetrics {
  date: string;          // YYYY-MM-DD
  views: number;
  clicks: number;
  ctr: number;           // Calculated
  uniqueSessions: number;
  avgDuration: number;   // seconds
  products: {
    [productId: string]: {
      views: number;
      clicks: number;
      ctr: number;
    };
  };
  referrers: {
    [domain: string]: number;
  };
  devices: {
    mobile: number;
    desktop: number;
  };
}
```

### ProductMetrics
```typescript
interface ProductMetrics {
  productId: string;
  asin: string;
  name: string;
  lifetimeViews: number;
  lifetimeClicks: number;
  lifetimeCtr: number;
  last7Days: {
    views: number;
    clicks: number;
    ctr: number;
  };
  trend: 'up' | 'down' | 'stable';  // vs previous period
}
```

### AggregatedReport
```typescript
interface AggregatedReport {
  period: 'daily' | 'weekly' | 'monthly';
  startDate: string;
  endDate: string;
  totals: {
    views: number;
    clicks: number;
    ctr: number;
    estimatedRevenue: number;
  };
  topProducts: ProductMetrics[];
  topReferrers: Array<{ domain: string; count: number }>;
  deviceSplit: { mobile: number; desktop: number };
  dailyBreakdown: DailyMetrics[];
}
```

## Dashboard Layout

```
┌─────────────────────────────────────────────────────────────────┐
│                    DailyDealFeed Analytics                       │
├──────────┬──────────┬──────────┬──────────┬─────────────────────┤
│  VIEWS   │  CLICKS  │   CTR    │ TOP PROD │    TOP REFERRER     │
│  12,450  │    389   │  3.12%   │ Prod #7  │    tiktok.com       │
│   ↑ 12%  │   ↑ 8%   │  ↑ 0.3%  │ 45 clicks│     420 views       │
├──────────┴──────────┴──────────┴──────────┴─────────────────────┤
│                                                                  │
│  [========== Views & Clicks Over Time (30 days) ==========]     │
│                                                                  │
├─────────────────────────────────┬────────────────────────────────┤
│      Referrer Sources           │       Device Distribution      │
│         (Pie Chart)             │         (Donut Chart)          │
├─────────────────────────────────┴────────────────────────────────┤
│                                                                  │
│  [============= Product Performance Table ==================]   │
│  Rank │ Product                      │ Views │ Clicks │ CTR     │
│  ──────────────────────────────────────────────────────────────  │
│   1   │ COSRX Snail Mucin...         │  1,234│    45  │ 3.6% 🟢 │
│   2   │ Stanley Tumbler...           │    987│    32  │ 3.2% 🟢 │
│   3   │ CeraVe Moisturizing...       │    654│    12  │ 1.8% 🔴 │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Future Visualization Ideas

### 1. Heatmap Calendar
- GitHub-style contribution graph
- Color intensity = engagement level
- Quick visual of best/worst days

### 2. Funnel Visualization
```
Impressions (Social) ─────────────────▶ 100,000
         │
         ▼ (2% click to embed)
    Embed Views ──────────────────────▶   2,000
         │
         ▼ (5% CTR)
    Amazon Clicks ────────────────────▶     100
         │
         ▼ (3% conversion)
    Purchases ────────────────────────▶       3
```

### 3. Real-time Activity Feed
```
🔴 LIVE
├─ 10s ago: Product #12 viewed (twitter.com)
├─ 45s ago: Product #7 CLICKED! 🎉 (direct)
├─ 1m ago: Product #3 viewed (tiktok.com)
└─ 2m ago: Product #7 viewed (tiktok.com)
```

### 4. Geographic Heat Map
- Based on referrer TLD patterns
- Or optional IP geo-lookup (privacy tradeoff)

### 5. Video Engagement Timeline
- Scrubber showing engagement dropoff
- Mark average click moment
- Identify optimal video length

## Implementation Notes

### Technology Options
1. **Static JSON + JavaScript** - Simple, GitHub Pages compatible
2. **Cloudflare Workers** - Real-time, serverless
3. **Grafana** - Full-featured, requires hosting
4. **Retool** - Low-code, good for internal dashboards

### Recommended Stack
- **Data collection:** Beacon API → Cloudflare Worker
- **Storage:** Cloudflare KV or D1 (SQLite)
- **Dashboard:** Static HTML + Chart.js (for GitHub Pages)

---

*Schema version: 1.0 | Last updated: 2026-02-20*
