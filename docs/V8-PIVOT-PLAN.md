# V8 Pivot Plan — Critical Feedback Integration

## What's Changing

### ❌ DEPRIORITIZED (Remove for now)
1. **Hook text overlay** — Gets cut off in 9:16 portrait, remove entirely
2. **Background music** — Focus on video quality first

### 🔴 P0: Smart Cropper Fix
**Problem:** Currently just doing center crop, not actually "smart"
**Problem:** Clips are too short
**Problem:** Not cutting at the right moment (before action)

**What we need:**
- Understand the "beat sheet" of the clip (setup → tension → action)
- Cut RIGHT BEFORE the action/payoff (cliffhanger effect)
- Longer clips that build anticipation (not just 3s)
- Vibe: shock and entertaining

**Technical approach:**
1. Analyze clip for motion peaks (where action happens)
2. Identify the "impact moment" 
3. Cut 0.5-1s BEFORE that moment
4. Duration: 4-6 seconds (enough setup, cliffhanger ending)
5. Smart crop that follows subject, not just center

### 🔴 P0: Script Rewrite
**Problem:** Current scripts sound like testimonials/reviews
**Example of WRONG:** "Okay this CeraVe moisturizer... I was skeptical but my skin has never felt this good"

**What we need:**
- Simple product intro format
- NOT testimonial/review style
- Include discount code or price

**New format:**
```
"Next up we have [PRODUCT NAME or TYPE]
use the code on screen to get X% off"
```

**Variations:**
- Use product TYPE instead of full name: "this monitor stand" not "HUANUO Monitor Stand"
- Pull best stat from Amazon description: "fits up to 27 inch monitors"
- Show discount code/price on screen overlay

**Examples:**
- "Next up we have this moisturizer, use the code on screen to get it for $18.96"
- "Next up we have this cleaning paste that works on literally everything, code on screen for 20% off"
- "Next up we have this waffle maker, under $10 with the code on screen"

### 📋 Video Structure (V8)

```
[0-4s]   AFV clip (cliffhanger cut, smart cropped)
[4-8s]   Product showcase with:
         - Product image
         - Price/discount code overlay
         - Simple voiceover: "Next up we have [product]..."
[8-10s]  CTA: "Link in bio"
```

**NO:**
- Hook text overlays
- Background music
- Testimonial-style scripts
- Generic "this changed everything" hooks

**YES:**
- Shocking/entertaining clip that ends before action
- Simple "next up we have" intro
- Discount code on screen
- Clean, quick format

---

## Implementation Tasks

### Task A: Script Rewriter
1. Read products.json for all 6 products
2. For each product:
   - Get product TYPE (not full name)
   - Find best stat from description
   - Generate simple "next up" script
   - Include price or discount code
3. Update script-map.json with new format
4. Remove testimonial/review language

### Task B: Smart Cropper V2
1. Analyze clip motion to find "impact moment"
2. Cut 4-6 seconds, ending before impact
3. Implement actual subject tracking (not center crop)
4. Test on AFV clips

### Task C: Editor Updates
1. Remove hook text overlay code
2. Remove background music mixing
3. Add discount code/price overlay
4. Use new script format
5. Simplify video structure

---

## Success Criteria

- [ ] Clips are 4-6 seconds, end BEFORE the action
- [ ] Smart crop follows subject, not just center
- [ ] Scripts say "Next up we have [product]"
- [ ] Discount code/price shown on screen
- [ ] No testimonial/review language
- [ ] No cut-off text overlays
- [ ] Clean, simple format

---

*Created: 2026-02-15 17:15 UTC*
