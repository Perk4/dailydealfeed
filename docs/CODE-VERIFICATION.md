# Promo Code Verification Guide

*How to verify Amazon promo codes actually work before promoting*

---

## Why Verification Matters

- Bad codes = frustrated followers = lost trust
- Amazon codes can expire without notice
- Some codes are product-specific or one-time use
- Redemption limits can be hit quickly

---

## ✅ Verification Methods

### Method 1: Browser Cart Test (Best)

**Steps:**
1. Add product to Amazon cart (use incognito/private browser)
2. Go to checkout
3. Find "Gift cards & promotional codes" box
4. Enter the promo code
5. Check if discount applies to subtotal

**What to Look For:**
- ✅ "Promotional code applied" message
- ✅ Discount shows on subtotal
- ❌ "The promotional code you entered is not valid" = code is dead
- ❌ "This promotional code is not applicable" = wrong product

**Important:** Don't actually complete purchase. Just verify code works.

### Method 2: SimplyCodes Health Check

**URL:** https://simplycodes.com/store/amazon.com

**Look For:**
- Health percentage (aim for 90%+)
- "Last used" timestamp (recent = good)
- User verification count
- Recent verification activity

**Example Good Code:**
```
Health: 99%
Last used: 30min ago
Uses today: 28
Verifications: 8
```

### Method 3: Amazon "Apply Code" Button

Some products have an "Apply promo code" link directly on the product page:

1. Go to product page
2. Look below the price for "Apply $X.XX coupon" or "Apply XX% promo code"
3. Click it — if it applies, you see updated price
4. This confirms the code works for that exact product

### Method 4: Community Validation

**Check:**
- Slickdeals comments (users report if codes work)
- Reddit r/couponing or r/AmazonDeals threads
- Facebook deal group discussions
- SimplyCodes user verification reports

---

## ⚠️ Common Code Failure Reasons

### 1. Code Expired
- Most seller codes last 7-30 days
- Lightning deals: hours only
- Check expiration date if provided

### 2. Redemption Limit Reached
- Sellers set max redemptions (e.g., 100 uses)
- Hot codes can be exhausted in hours
- "This promotional code has been fully redeemed"

### 3. Wrong Product Variation
- Code may only work on specific:
  - Color
  - Size
  - Sold by (Amazon vs 3rd party seller)
  - Fulfilled by (FBA vs merchant)

### 4. One-Time Use Only
- Some codes are single-use per account
- Can't re-test with same account

### 5. Prime Exclusive
- Some deals only work for Prime members
- "This promotion is only available to Prime members"

### 6. Cart Minimum Not Met
- Some codes require $X minimum purchase
- "Minimum purchase of $25 required"

---

## 🛠️ Verification Checklist

Before promoting any code, verify:

- [ ] Code applies successfully in cart
- [ ] Discount amount matches claimed savings
- [ ] No weird restrictions (Prime only, specific seller, etc.)
- [ ] Code works on the exact ASIN you're promoting
- [ ] Check if code was verified by others recently
- [ ] Note expiration date (if available)

---

## 📋 Code Documentation Template

When you find a working code, document it:

```json
{
  "code": "SAVE20NOW",
  "discount": "20%",
  "product_asin": "B00PBX3L7K",
  "product_name": "COSRX Snail Mucin",
  "source": "SimplyCodes",
  "verified_date": "2026-02-21",
  "verified_by": "cart_test",
  "health_score": "95%",
  "expiration": "2026-03-01",
  "restrictions": "None found",
  "notes": "Works on all sizes"
}
```

---

## 🔄 Ongoing Verification Process

### Daily (5 minutes)
1. Check SimplyCodes for new high-health codes
2. Quick scan Vipon for category-relevant deals
3. Check Amazon Today's Deals for clippable coupons

### Before Publishing Content
1. Re-verify any codes being featured
2. Check for new codes on that specific product
3. Verify affiliate link still works

### Weekly
1. Audit products.json for expired codes
2. Remove dead codes from product files
3. Search for replacement codes
4. Update code expiration estimates

---

## 🚨 Red Flags (Skip These Codes)

Don't promote codes from:
- Sites with no verification system
- Blog posts older than 2 weeks
- Sources that don't show "last verified" dates
- Random comment sections
- Codes that seem "too good to be true" (90% off brand new products)

**If something seems off, it probably is.**

---

## 📁 Code Storage Structure

Keep verified codes in product files:

```json
{
  "id": "1",
  "name": "COSRX Snail Mucin",
  "asin": "B00PBX3L7K",
  "price": "$21.99",
  "promo_codes": [
    {
      "code": "SNAIL15",
      "discount": "15%",
      "verified": "2026-02-21",
      "expires": "2026-03-15",
      "source": "SimplyCodes"
    }
  ],
  "clippable_coupon": true,
  "coupon_amount": "$3.00"
}
```

---

## 🤖 Automation Ideas

For future development:
1. **Daily Code Scanner** — Script that checks SimplyCodes API for new codes in target categories
2. **Expiration Tracker** — Alert when codes are expiring soon
3. **Cart Test Bot** — Automated verification using Playwright/Selenium
4. **Price + Code Monitor** — Track both price drops AND new codes

---

## Summary

| Source | Reliability | Update Speed | Best For |
|--------|-------------|--------------|----------|
| SimplyCodes | ⭐⭐⭐⭐⭐ | Real-time | Primary verification |
| Amazon Cart Test | ⭐⭐⭐⭐⭐ | Instant | Final confirmation |
| Vipon | ⭐⭐⭐⭐ | Hourly | New seller codes |
| Slickdeals | ⭐⭐⭐⭐ | Community-speed | Hot deals |
| Random blogs | ⭐⭐ | Outdated | Avoid |

---

*Document created by code-hunter subagent*
