# Improvement Queue — Video Quality Focus

## Current Priority: Make Videos Actually Good

**North Star:** Would a random person think this is a real TikTok or an ad?

---

## In Progress 🔄

16. [ ] **Voice Variety** — Test different TTS voices/styles per product (blocked: needs ELEVENLABS_API_KEY)

## Recently Completed ✅

17. [x] **Music Matching** — Vibe-based track selection verified (2026-02-15 17:12 UTC)
    - CeraVe → track05_dynamic_healing (wellness) ✅
    - Pink Stuff → track03_born_norilsk (cleaning) ✅
    - Moon Lamp → track05_dynamic_healing (cozy) ✅
    - selectMusicByVibe() scoring keywords, categories, vibes correctly

15. [x] **Clip Quality** — AFV cliffhanger clips integrated (2026-02-15 16:10 UTC)
    - Downloaded 15 AFV clips, processed to 3s cliffhangers
    - V7.0 test: 8.6/10 vs V6.0's 3.6/10 (+139% improvement)
    - Scout.js now prioritizes AFV clips by vibe matching

## Next Up ⏳

18. [~] **Full QA Pass** — In progress (2026-02-15 18:10 UTC)
    - BISSELL Little Green (video_5): 8.0/10 avg
      - Hook: 8.5/10 ("What came out of my couch...I'm disturbed" - curiosity hook)
      - Voice: 7/10 (Deepgram Luna - serviceable but detectable)
      - Script: 8.5/10 ("Okay I need to show you..." - natural friend energy)
      - Edit: 8/10 (v2.0-organic, crossfades, subtle zoom)
      - Watchability: 8/10 (solid, voice is bottleneck)
    - CeraVe Moisturizing Cream (video_1_1771178994263): 7.4/10 avg
      - Hook: 8/10 (afv-001 clip - good cliffhanger)
      - Voice: 7/10 (Deepgram Luna - still the bottleneck)
      - Script: 7/10 ("Next up we have..." - generic opener, less personality)
      - Edit: 7.5/10 (v8-simplified, crossfades but NO MUSIC)
      - Watchability: 7.5/10 (music disabled = feels emptier)
    - **Issues Found:**
      - Script-map.json uses generic "Next up we have..." template (regression)
      - v8-simplified disabled background music (was working in v7)
      - Voice blocked by missing ELEVENLABS_API_KEY
    - **Next Action:** Restore music integration + vary script openers

19. [ ] **V7.0 Batch** — Regenerate with all refinements (music vibe matching + AFV clips)

## Completed ✅

1. [x] Script rewrite — conversational tone
2. [x] Voice quality — OpenClaw TTS recommended
3. [x] Viral clips — 15 handpicked
4. [x] Edit pacing — dynamic timing
5. [x] TTS integration — ElevenLabs fallback chain
6. [x] Music downloaded — 5 royalty-free tracks
7. [x] All improvements integrated
8. [x] Clips cached locally
9. [x] V5.0 batch generated
10. [x] Product-clip matching
11. [x] OpenClaw TTS integration
12. [x] **Script Polish** — All scripts use voice memo style (2026-02-15)
13. [x] **Edit Refinement** — v2.0-organic style: 5% zoom, 0.15s text delay, crossfades (2026-02-15)
14. [x] **Hook Optimization** — Conversational hooks under 20 words, distinct angles (2026-02-15)

## Deprioritized (Later)

- [ ] Posting queue — wait until videos are ready
- [ ] A/B test framework — need real data first
- [ ] Analytics dashboard — after we start posting
- [x] Auto-scaling — completed (scripts/auto-scaler.js)

### Auto-Scaling System (2026-02-15 14:32 UTC)
**Created:** `scripts/auto-scaler.js` — On-demand video generation

**Commands:** status, generate, fill, batch, quota, config

**Bug Fixes:** Editor now uses cached MP4 clips properly

**Test Video:** video_3_1771165864725.mp4 (10s, voiceover, music)

---

## Quality Targets

| Dimension | V5.0 | V7.0 (AFV) | Target |
|-----------|------|------------|--------|
| Hook impact | 7 | 8.5 ✅ | 9+ |
| Voice naturalness | 9 | 7 ⚠️ | 9 |
| Script authenticity | 7 | 9 ✅ | 9+ |
| Edit flow | 7 | 8 ✅ | 8+ |
| Overall watchability | 7 | 8.5 ✅ | 9+ |

**Latest Test:** video_1_1771178994263.mp4 (CeraVe Moisturizer) — Avg Score: 7.4/10

| Dimension | Score | Notes |
|-----------|-------|-------|
| Hook impact | 8/10 | afv-001 — decent cliffhanger |
| Voice naturalness | 7/10 | Deepgram Luna - still detectable |
| Script authenticity | 7/10 | ⚠️ "Next up we have..." — generic, lacks personality |
| Edit flow | 7.5/10 | ⚠️ v8-simplified disabled music (regression) |
| Overall watchability | 7.5/10 | Weaker than v7.0 — music + script variety needed |

**Regression Alert:** v8-simplified removed music integration. Previous v7.0 scored 8.2/10 with music.

**Bottleneck:** Voice naturalness (7/10) blocked by missing ELEVENLABS_API_KEY

**Clip Quality:** New clips downloaded (react-m002-m004, reveal-m001-m003, shock-m001-m004) — clip-sourcing-v2 subagent stalled but partial progress captured

**The test:** Would you actually watch this? Would you share it?

---

*Updated: 2026-02-15 16:10 UTC*
