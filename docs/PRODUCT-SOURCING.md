# Product Sourcing Guide - DailyDealFeed

> **Created:** 2026-02-20
> **Purpose:** Document how to find trending Amazon products for short-form video content

---

## Overview

Finding the right products is crucial for DailyDealFeed's success. Products need to be:
- **Visually compelling** (good for 10-15 second videos)
- **Impulse-buy priced** ($15-100 sweet spot)
- **Well-reviewed** (4+ stars, ideally 4.5+)
- **Affiliate-eligible** on Amazon Associates

---

## Research Sources (Priority Order)

### 1. TikTok Direct Research
**Most valuable - see what's actually going viral**

- **Hashtags to monitor:**
  - `#TikTokMadeMeBuyIt` (the motherlode)
  - `#AmazonFinds`
  - `#AmazonMustHaves`
  - `#CreatorEssentials`
  - Category-specific: `#SkincareTikTok`, `#CleanTok`, `#BookTok`

- **TikTok Shop Tab:** Check bestsellers and trending items
- **Sound trends:** Products featured in trending sounds often blow up

### 2. Amazon Movers & Shakers
**Real-time trending data**

- URL: `amazon.com/gp/movers-and-shakers`
- Categories to prioritize:
  - Beauty & Personal Care
  - Home & Kitchen
  - Sports & Outdoors
  - Electronics (sub-$100 gadgets)

### 3. Aggregator Sites
**Pre-curated lists from editors who do this full-time**

- **Cosmopolitan** - `cosmopolitan.com/style-beauty/` (viral TikTok roundups)
- **BuzzFeed Shopping** - `buzzfeed.com/shopping` (Amazon trending lists)
- **The Strategist** - Higher-end but trend-forward
- **Wirecutter** - Quality-vetted picks

### 4. Trend Analysis Tools
**For data-driven product discovery**

- **Exploding Topics** - Early trend detection
- **Helium 10 TikTok Product Finder** - Cross-platform sales data
- **Google Trends** - Validate sustained interest

---

## Product Criteria Checklist

### Must-Haves ✅
- [ ] Available on Amazon with Prime shipping
- [ ] Price between $15-100 (impulse buy range)
- [ ] 4+ star rating with 100+ reviews minimum
- [ ] Eligible for Amazon Associates
- [ ] Strong product images (for visual content)

### Strong Signals 🔥
- [ ] Trending on multiple platforms (TikTok + Amazon)
- [ ] Solves a relatable problem
- [ ] Has a "wow factor" or satisfying demo
- [ ] Good for before/after content
- [ ] Seasonal relevance (summer products in spring, etc.)

### Red Flags 🚩
- [ ] Already oversaturated (every creator has covered it)
- [ ] Complicated to explain in 10 seconds
- [ ] No visual appeal (boring packaging, no demo potential)
- [ ] Controversial or frequently returned
- [ ] Price fluctuates wildly

---

## Category Playbook

### Skincare/Beauty (Highest Engagement)
- K-beauty products consistently perform
- Before/after transformations
- "Holy grail" product framing
- Price anchoring works ("this $20 serum vs $200 ones")

**Current trends:** Snail mucin, niacinamide, retinal serums, French pharmacy staples

### Home & Kitchen (Broadest Appeal)
- Problem-solving gadgets
- Organizational/satisfying content
- "Life hack" positioning

**Current trends:** Air fryers, cleaning hacks, aesthetic kitchenware

### Tech/Gadgets (High Shareability)
- Under $100 is key
- "I didn't know I needed this" angle
- Setup/aesthetic content

**Current trends:** Mini projectors, walking pads, retro cameras, wireless chargers

### Fashion/Lifestyle (Trend-Dependent)
- Move fast on trends
- Comfort + style combo
- Dupe culture is strong

**Current trends:** Cloud slides, platform slippers, scuba hoodies

---

## Research Workflow

### Daily (5-10 min)
1. Scroll TikTok FYP noting products with high engagement
2. Check Amazon Movers & Shakers in key categories
3. Note any products mentioned 3+ times

### Weekly (30 min)
1. Deep-dive on aggregator sites for curated roundups
2. Cross-reference TikTok trends with Amazon availability
3. Update prospect list with 10-15 candidates

### Monthly
1. Review which product categories performed best
2. Adjust category mix based on engagement data
3. Archive outdated trends, note emerging ones

---

## Product Data Template

When adding products to `next-batch.json`:

```json
{
  "asin": "B0XXXXXXXX",
  "name": "Product Name (keep concise)",
  "price": "$XX.XX",
  "category": "category-slug",
  "rating": "X.X stars",
  "whyItWorks": "2-3 sentences on trend + video potential",
  "hookStyle": "discovery|question|problem|direct-flex|story|social-proof|value|urgency",
  "bestStat": "Key selling point for voiceover",
  "affiliate_link": "https://www.amazon.com/dp/ASIN?tag=dailydealfeed-20"
}
```

---

## Avoiding Duplicates

Before adding products, check:
1. `products.json` - Current product roster
2. `output/approved/manifest.json` - Already-produced videos
3. `production/queue/queue.json` - Products in pipeline

---

## Seasonal Considerations

| Season | Hot Categories |
|--------|----------------|
| Winter (Dec-Feb) | Cozy home, skincare, indoor fitness |
| Spring (Mar-May) | Cleaning, organization, outdoor prep |
| Summer (Jun-Aug) | Travel, cooling gadgets, beach/pool |
| Fall (Sep-Nov) | Back-to-school, cozy fashion, holiday gifts |

---

## Notes

- **Quality over quantity** - 10 great products beat 30 mediocre ones
- **Test before committing** - Check product pages for good imagery
- **Watch for trends dying** - If it was viral 6 months ago, it may be oversaturated
- **Local vs. global** - Some TikTok trends are US-specific; verify Amazon availability

---

*Last updated: 2026-02-20 by product-scout subagent*
