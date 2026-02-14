# Carrd Embed Setup — @dailydealfeed

How to add the product grid to your Carrd site.

---

## Prerequisites

1. **Carrd Pro** — You need Pro Standard ($19/year) or higher for custom embeds
2. **GitHub Pages enabled** — The products.json must be live at:
   ```
   https://perk4.github.io/dailydealfeed/products.json
   ```

---

## Step 1: Enable GitHub Pages

1. Go to your repo: https://github.com/perk4/openclaw-biz
2. Click **Settings** → **Pages** (left sidebar)
3. Under "Source", select **Deploy from a branch**
4. Choose **main** branch, **/ (root)** folder
5. Click **Save**
6. Wait ~2 minutes for deployment
7. Test: Visit https://perk4.github.io/dailydealfeed/products.json

---

## Step 2: Add Embed to Carrd

1. Open your Carrd site editor (dailydealfeed.carrd.co)
2. Click **+** to add a new element
3. Select **Embed** → **Code**
4. In the embed settings:
   - **Type:** Code
   - **Style:** Inline (not Hidden)
5. Paste the **entire contents** of `embed.html` into the code box
6. Adjust element width to **Full** or **Large**

---

## Step 3: Position & Style

**Recommended placement:**
- After your hero section / intro
- Before your social links footer

**Carrd container settings:**
- Width: Full or Container
- Padding: None (the embed has its own)
- Background: White or transparent

**Tips:**
- The embed is fully responsive — looks good on mobile
- Test on both desktop and mobile preview before publishing

---

## Step 4: Publish

1. Click **Publish** in Carrd
2. Test all product links
3. Check console (F12 → Console) for click tracking logs

---

## Updating Products

To add/edit products:

1. Edit `/root/clawd/projects/reels-affiliate/site/products.json`
2. Commit and push to GitHub
3. Wait 2-5 minutes for GitHub Pages to update
4. Hard refresh your Carrd page (Ctrl+Shift+R)

No need to touch the embed code — it fetches fresh data each load.

---

## Adding Affiliate Tags

When Amazon Associates is approved:

1. Get your affiliate tag (looks like `dailydeal0a-20`)
2. Update each product link in `products.json`:
   ```
   Before: https://www.amazon.com/dp/B07FDXY48N
   After:  https://www.amazon.com/dp/B07FDXY48N?tag=dailydeal0a-20
   ```
3. Push changes

---

## Troubleshooting

**Products not loading:**
- Check browser console for errors
- Verify GitHub Pages is enabled
- Check products.json URL is accessible
- CORS shouldn't be an issue (GitHub Pages allows cross-origin)

**Images broken:**
- Amazon image URLs can change
- Replace with new URLs from Amazon product pages
- Use the largest image (usually ending in `_SL1500_.jpg`)

**Styling issues in Carrd:**
- Make sure embed type is "Inline" not "Hidden"
- Try wrapping in a Container element
- Check Carrd's container width settings

---

## Files Reference

| File | Purpose | URL |
|------|---------|-----|
| `products.json` | Product data | https://perk4.github.io/dailydealfeed/products.json |
| `embed.html` | Carrd embed code | Paste directly into Carrd |
| `index.html` | Landing page | https://perk4.github.io/dailydealfeed/ |

---

## Future Upgrades

- [ ] Add GA4 event tracking
- [ ] Add UTM parameters to links
- [ ] Create "Featured Only" view
- [ ] Add product descriptions
- [ ] Seasonal collections (holiday picks, etc.)

---

_Last updated: 2026-02-14_
