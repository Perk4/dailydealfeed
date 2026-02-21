# Daily Promo Code Monitoring Checklist

**Purpose:** Systematic daily routine to find and verify promo codes for DailyDealFeed products.

---

## Morning Routine (15 min) ☀️

### 1. Check SimplyCodes
**URL:** https://simplycodes.com/

SimplyCodes is powered by 9M+ real shoppers with real-time code verification.

**Steps:**
1. Install browser extension (Chrome/Firefox)
2. Search for categories we cover: electronics, home, beauty, etc.
3. Filter by "recently verified" codes
4. Note codes with high success rates

**Pro tip:** The extension auto-activates on shopping sites and shows verified codes at checkout.

---

### 2. Check Vipon
**URL:** https://www.myvipon.com/

Vipon connects Amazon sellers with shoppers via promo codes (50-100% off).

**Steps:**
1. Browse by category
2. Look for codes on products matching our feed
3. Request codes for interesting products
4. Note: Some codes have limited claims - act fast!

**Caveat:** Some user reports of codes not working. Always verify before posting.

---

### 3. Check Amazon Associates Promo Hub
**URL:** https://affiliate-program.amazon.com → Promotions tab

**Steps:**
1. Log into Associates account
2. Navigate to "Promo Codes" section
3. Check "Recommended Promo Codes" feature
4. Look for brand-specific promo pages
5. Generate affiliate links for valid codes

**Note:** Promo codes are updated daily. Check frequently for new additions.

---

### 4. Check Deal Aggregator Sites
**Priority sites to monitor:**

| Site | URL | Focus |
|------|-----|-------|
| Rebaid | rebaid.com | Rebates & steep discounts |
| JumpSend | jumpsend.com | Product launch codes |
| Snagshout | snagshout.com | Instant claim deals |
| AMZDiscover | amzdiscover.com | Seller promo discovery |
| Krazy Coupon Lady | krazycouponlady.com | Curated Amazon deals |

---

### 5. Amazon Product Page Check
For each product we're considering:

1. Visit the Amazon product page
2. Look for:
   - ☑️ **Clippable coupons** (checkbox below price)
   - 🏷️ **Subscribe & Save** discounts
   - 📦 **Lightning deals** or limited-time offers
   - 💰 **Multi-buy promotions**
3. Check "Other Sellers" for better prices

---

## Afternoon Verification (10 min) 🔍

### 1. Test Morning Codes
- Attempt to apply codes at checkout (don't complete purchase)
- Verify discount percentage is accurate
- Check expiration dates

### 2. Update Product Files
When a valid code is found:

```json
{
  "asin": "B0XXXXXXXX",
  "title": "Product Name",
  "price": 29.99,
  "promo_code": "SAVE20",
  "discount_percent": 20,
  "code_source": "SimplyCodes",
  "verified_date": "2026-02-21",
  "expires": "2026-03-01"
}
```

### 3. Mark Expired Codes
- Remove or flag codes that no longer work
- Update the `verified_date` on codes that still work

---

## Weekly Deep Dive (30 min) 📊

### Monday: Community Scan
- Browse Facebook deal groups for new codes
- Check r/AmazonDiscounts and r/GetADiscount
- Look for seller-posted codes

### Wednesday: Seller Research
- Identify sellers whose products we feature
- Check their Amazon storefronts for promotions
- Look for social media presence (might post codes there)

### Friday: Performance Review
- Which codes performed best this week?
- Which sources provided the most valid codes?
- Update source rankings in this document

---

## Quick Reference: Code Sources Ranked

Based on reliability and freshness:

1. **Amazon Associates Promo Hub** ⭐⭐⭐⭐⭐ - Official, always works
2. **SimplyCodes** ⭐⭐⭐⭐ - Community-verified, high accuracy
3. **Amazon clippable coupons** ⭐⭐⭐⭐ - Native, easy to verify
4. **Krazy Coupon Lady** ⭐⭐⭐⭐ - Curated, usually tested
5. **Vipon** ⭐⭐⭐ - Hit or miss, codes expire fast
6. **Rebaid/JumpSend** ⭐⭐⭐ - Good discounts, limited availability
7. **Facebook Groups** ⭐⭐ - Manual effort, varies by group

---

## Code Verification Checklist

Before adding any code to our feed:

- [ ] Code applies at Amazon checkout
- [ ] Discount percentage is accurate
- [ ] Expiration date is known (or tested)
- [ ] Source is documented
- [ ] Code isn't limited to specific accounts

---

## Tracking Spreadsheet

Maintain a running log in `docs/code-tracking.csv`:

```
date,asin,code,source,discount,verified,expires,notes
2026-02-21,B0ABC123,SAVE15,SimplyCodes,15%,yes,2026-03-01,Works on all variants
```

---

*Last updated: 2026-02-21 by discount-strategist*
