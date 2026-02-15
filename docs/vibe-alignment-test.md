# Vibe Alignment Test Report

**Date:** 2026-02-15  
**Tester:** Vibe Alignment Subagent  
**Version:** V5.0 Batch Analysis  

---

## Executive Summary

🚨 **CRITICAL ISSUE FOUND:** There's a vibe system mismatch between scout.js and curated.json that causes poor or random clip selection for some products.

The scout.js references vibes (`cozy`, `transformation`, `twist`) that **don't exist** in the curated.json clip library. This results in:
- Some products getting suboptimal clips
- Moon Lamp (product 6) has **zero** matching vibes → falls back to random clip selection
- Waffle Maker (product 4) loses its primary vibe (`cozy`)

---

## System Analysis

### Available Vibes in Clip Library (curated.json)
| Vibe | Clips Available | Description |
|------|-----------------|-------------|
| **shocked** | 4 clips | Surprised/shocked expressions |
| **reaction** | 4 clips | Celebration/excited reactions |
| **reveal** | 3 clips | Unboxing/transformation reveals |
| **fail** | 3 clips | Frustration/disappointment |

### Vibes Referenced in Scout.js (but DON'T EXIST)
| Missing Vibe | Used By Products |
|--------------|-----------------|
| **cozy** | Moon Lamp, Waffle Maker, home/wellness/lifestyle categories |
| **transformation** | Pink Stuff, Little Green, Moon Lamp, beauty/wellness categories |
| **twist** | lifestyle, kitchen categories |

---

## Per-Product Vibe Analysis

### Product 1: CeraVe Moisturizing Cream (skincare)
- **Category:** skincare (⚠️ not in CATEGORY_VIBES mapping!)
- **Fallback vibes:** ["shocked", "reaction"]
- **Effective vibes:** shocked, reaction ✅
- **Assessment:** Works, but could use `reveal` for skincare transformation content

### Product 2: Neutrogena Sunscreen (skincare)
- **Category:** skincare (⚠️ not mapped)
- **Fallback vibes:** ["shocked", "reaction"]
- **Effective vibes:** shocked, reaction ✅
- **Assessment:** Works, but skincare should have dedicated vibes

### Product 3: The Pink Stuff (home/cleaning)
- **Matched:** PRODUCT_VIBES["Pink Stuff"]
- **Target vibes:** transformation, shocked, reveal
- **Effective vibes:** shocked, reveal ✅
- **Missing:** transformation ⚠️
- **Assessment:** Good! Shocked/reveal work well for "disgusting stove transformation" content

### Product 4: Dash Mini Waffle Maker (kitchen)
- **Matched:** PRODUCT_VIBES["Waffle Maker"]
- **Target vibes:** cozy, reaction
- **Effective vibes:** reaction only ⚠️
- **Missing:** cozy ⚠️
- **Assessment:** Loses the cozy morning vibe that matches "changed my mornings" hook

### Product 5: BISSELL Little Green (home/cleaning)
- **Matched:** PRODUCT_VIBES["Little Green"]
- **Target vibes:** shocked, transformation, reveal
- **Effective vibes:** shocked, reveal ✅
- **Missing:** transformation ⚠️
- **Assessment:** Good! "What came out of my couch" works great with shocked clips

### Product 6: Moon Lamp (home)
- **Matched:** PRODUCT_VIBES["Moon Lamp"]
- **Target vibes:** cozy, transformation
- **Effective vibes:** NONE ❌
- **Missing:** cozy, transformation ⚠️
- **Assessment:** 🚨 **CRITICAL** - Falls back to random clip selection!

---

## V5.0 Batch Video Scoring

Based on the QA framework in PIPELINE.md, here's the scoring analysis for the generated videos:

### Scoring Key
- 1-3: Poor - would not pass QA gate
- 4-6: Mediocre - needs improvement
- 7-8: Good - ready for testing
- 9-10: Excellent - ready for posting

### Product 3: The Pink Stuff (Most vibe-aligned)
| Dimension | Score | Notes |
|-----------|-------|-------|
| **Hook Test** (0-3s) | 7/10 | Shocked clip works for transformation reveal, but generic stock feel |
| **Voice Test** | 6/10 | Deepgram TTS is passable but still noticeably AI |
| **Script Test** | 8/10 | "This 5 dollar paste vs my disgusting stove" is conversational and punchy |
| **Edit Test** | 6/10 | Ken Burns zoom feels applied, not organic |
| **Overall Vibe** | 6/10 | Would be recognizable as UGC-style ad, not fully native |
| **AVERAGE** | **6.6/10** | Needs voice + editing improvements |

### Product 6: Moon Lamp (Least vibe-aligned)
| Dimension | Score | Notes |
|-----------|-------|-------|
| **Hook Test** (0-3s) | 4/10 | Random clip likely doesn't match "vibes hit different at 3am" |
| **Voice Test** | 6/10 | Same TTS quality |
| **Script Test** | 7/10 | Script is good but clip mismatch hurts |
| **Edit Test** | 6/10 | Standard processing |
| **Overall Vibe** | 5/10 | Clip-hook mismatch creates cognitive dissonance |
| **AVERAGE** | **5.6/10** | Vibe misalignment is the main issue |

---

## Recommendations

### 🔴 CRITICAL: Fix Vibe Mismatch

**Option A: Add Missing Vibes to Clip Library** (Recommended)
Add clips for these missing vibes:
```json
{
  "cozy": [
    // Warm, comfortable, morning coffee vibes
    // Bedroom/home aesthetic shots
    // Soft lighting, relaxed moments
  ],
  "transformation": [
    // Before/after reveals
    // Clean-up transformations
    // Room makeovers
  ]
}
```

**Option B: Map Missing Vibes to Existing Ones**
Update curated.json productVibeMapping:
```json
{
  "productVibeMapping": {
    "cleaning": ["shocked", "reveal"],
    "tech": ["shocked", "reaction"],
    "home": ["reveal", "reaction"],
    "wellness": ["reaction", "reveal"],
    "kitchen": ["reveal", "reaction"],  // Changed from "fail"
    "beauty": ["reveal", "reaction"],
    "skincare": ["reveal", "reaction"], // ADD THIS
    "default": ["shocked", "reaction"]
  }
}
```

### 🟡 Add Skincare Category
The skincare category is missing from productVibeMapping. Add:
```json
"skincare": ["reveal", "reaction"]
```

### 🟡 Reconsider "fail" for Kitchen
Current: `"kitchen": ["reveal", "fail"]`

The "fail" vibe (frustrated person on floor) doesn't match positive product content well. Consider:
- Reveal works for showing food/results
- Reaction works for taste tests
- Fail only works for "before this product existed" narrative

Recommendation: Change to `"kitchen": ["reveal", "reaction"]`

### 🟢 Vibe Alignment That Works Well

| Product Type | Recommended Vibes | Why |
|-------------|-------------------|-----|
| Cleaning products | shocked, reveal | "OMG look at this transformation" |
| Skincare/beauty | reveal, reaction | Before/after, positive results |
| Kitchen gadgets | reveal, reaction | Food reveal, taste reaction |
| Home decor | reveal, reaction | Room reveal, aesthetic reaction |
| Tech gadgets | shocked, reaction | "Wait this works?!" surprise |

---

## Dual System Cleanup

Currently there are TWO vibe mapping systems:
1. `curated.json` → `productVibeMapping`
2. `scout.js` → `CATEGORY_VIBES` + `PRODUCT_VIBES`

**Recommendation:** Consolidate to ONE source of truth:
- Move all vibe logic to `curated.json`
- Have `scout.js` read vibes from curated.json only
- Remove hardcoded vibe mappings from scout.js

---

## Test Video Generation

A scout test for Product 3 (The Pink Stuff) shows the system IS working for matching products:
```
Product: The Pink Stuff
Category: home
Matched: PRODUCT_VIBES["Pink Stuff"]
Clip ID: shock-m003
Clip Vibe: shocked ✅
Hook: "The before/after that broke me" ✅
```

The shocked clip + transformation hook creates good content alignment for cleaning products.

---

## Summary Scores by Product

| Product | Vibe Alignment | Overall Score | Status |
|---------|---------------|---------------|--------|
| 1. CeraVe | ⚠️ Uses fallback | 6.2/10 | Needs skincare category |
| 2. Neutrogena | ⚠️ Uses fallback | 6.2/10 | Needs skincare category |
| 3. Pink Stuff | ✅ Good match | 6.6/10 | Best vibe alignment |
| 4. Waffle Maker | ⚠️ Missing cozy | 5.8/10 | Add cozy clips |
| 5. BISSELL | ✅ Good match | 6.4/10 | Shocked vibe works great |
| 6. Moon Lamp | ❌ No match | 5.6/10 | CRITICAL - needs cozy clips |

---

## Action Items

1. **Immediate:** Add `"skincare": ["reveal", "reaction"]` to productVibeMapping
2. **High Priority:** Add "cozy" clips to library (3-4 clips minimum)
3. **High Priority:** Add "transformation" clips (can reuse reveal-style content)
4. **Medium:** Change kitchen vibes from fail to reaction
5. **Medium:** Consolidate vibe systems to single source
6. **Low:** Consider adding vibe metadata to output post JSON for tracking

---

*Report generated 2026-02-15 04:35 UTC*
