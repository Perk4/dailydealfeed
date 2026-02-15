# Video Production Pipeline — Perfection Plan

## Current Status: v3.0
- ✅ 6 videos generated
- ✅ 9:16 vertical format (1080x1920)
- ✅ Deepgram Luna TTS voiceover
- ✅ Real Amazon product images
- ⚠️ Quality needs refinement

---

## Pipeline Components

### 1. 🔍 SCOUT — Viral Clip Sourcing
**Current:** Giphy reaction GIFs
**Problem:** Generic, not "Worldstar/AFV viral" level
**Target:** Shocking 2-4 second clips that hook instantly

**Improvements needed:**
- [ ] Source from Pexels/Pixabay video (direct download URLs)
- [ ] Curate "shock value" clips manually
- [ ] Match clip emotion to product category
- [ ] A/B test different hook styles

**Owner:** Scout Agent
**Metric:** Hook retention (first 3 sec watch rate)

---

### 2. ✍️ WRITER — Hook & Caption Generation
**Current:** Template-based hooks
**Problem:** Can feel formulaic
**Target:** "Chill friend energy" that stops the scroll

**Improvements needed:**
- [ ] Train on top-performing TikTok hooks
- [ ] Add personality variations (curious, shocked, excited)
- [ ] Test hook length (short punchy vs longer story)
- [ ] Include trending audio references in captions

**Owner:** Writer Agent
**Metric:** Caption engagement (saves, shares)

---

### 3. 🎬 PRODUCER — Product Data
**Current:** Rainforest API for Amazon data
**Problem:** ~50% ASIN hit rate
**Target:** 100% real product images + prices

**Improvements needed:**
- [ ] Verify ASINs before adding to catalog
- [ ] Fallback: Browser screenshot of Amazon page
- [ ] Track price changes for "PRICE DROP" hooks
- [ ] Add review count/rating to display

**Owner:** Producer Agent
**Metric:** Image accuracy (real Amazon vs placeholder)

---

### 4. 🎞️ EDITOR — Video Assembly
**Current:** FFmpeg with text overlays
**Problem:** Static, lacks dynamic energy
**Target:** TikTok-native feel with motion

**Improvements needed:**
- [ ] Add subtle zoom/pan on product images
- [ ] Text animation (fade in, slide up)
- [ ] Background music layer (low volume under TTS)
- [ ] Transition effects between segments
- [ ] Progress bar / timer indicator
- [ ] End card with swipe-up gesture animation

**Owner:** Editor Agent
**Metric:** Watch time, completion rate

---

### 5. 🎙️ TTS — Voiceover
**Current:** Deepgram Aura-1 (Luna voice)
**Problem:** Good but can sound slightly robotic
**Target:** Natural, conversational tone

**Improvements needed:**
- [ ] Test different voices (asteria, athena for variety)
- [ ] Add pauses for emphasis (... in script)
- [ ] Speed variation (faster hook, slower CTA)
- [ ] Consider ElevenLabs for premium quality

**Owner:** TTS Worker
**Metric:** Voice naturalness rating

---

### 6. 📱 PUBLISHER — Distribution
**Current:** Manual posting
**Target:** Semi-automated with approval gate

**Improvements needed:**
- [ ] Queue system for pending posts
- [ ] Scheduling (optimal post times)
- [ ] Cross-post to IG + TikTok simultaneously
- [ ] Caption hashtag optimization
- [ ] Performance tracking webhook

**Owner:** Publisher Agent (TODO)
**Metric:** Post frequency, reach

---

### 7. 🔗 LINK SITE — Bio Link
**Current:** Mobile-first glassmorphism design
**Problem:** Needs conversion optimization
**Target:** Easy tap → Amazon purchase

**Improvements needed:**
- [ ] Add product category filters
- [ ] "Hot deals" / "Price drop" badges
- [ ] Recently viewed tracking
- [ ] UTM parameters for tracking
- [ ] A/B test card layouts

**Owner:** Builder Agent
**Metric:** Click-through rate, conversion

---

## Quality Checklist (per video)

Before publishing, verify:
- [ ] Video is 9:16 vertical (1080x1920)
- [ ] Hook plays in first 3 seconds
- [ ] Product image is real Amazon photo
- [ ] Price is current and accurate
- [ ] TTS audio is clear and synced
- [ ] CTA "Link in bio" is visible
- [ ] No copyright issues with clip/music

---

## Agent Cadence

| Agent | Trigger | Output |
|-------|---------|--------|
| Scout | New product added | Matched viral clip |
| Writer | Scout output | Hook + captions |
| Producer | Product ID | Amazon data + image |
| Editor | All inputs ready | Final video file |
| Publisher | Human approval | Live post |

**Boardroom:** Hourly check-in for progress/blockers

---

## Next Sprint Priorities

1. **Fix video playback on preview** — Dynamic loading from GitHub
2. **Add motion to videos** — Zoom, pan, text animation
3. **Background music** — Royalty-free trending sounds
4. **Better viral clips** — Manual curation of 20 "A-tier" hooks
5. **Publisher agent** — Build posting queue + scheduling

---

*Last updated: 2026-02-15*
