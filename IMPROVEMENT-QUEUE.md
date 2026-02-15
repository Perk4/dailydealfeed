# Improvement Queue — Video Quality Focus

## Current Priority: Make Videos Actually Good

**North Star:** Would a random person think this is a real TikTok or an ad?

---

## In Progress 🔄

15. [ ] **Clip Quality** — Source even better viral moments
16. [ ] **Voice Variety** — Test different TTS voices/styles per product (blocked: needs ELEVENLABS_API_KEY)

## Next Up ⏳

17. [ ] **Music Matching** — Right track for right product vibe
18. [ ] **Full QA Pass** — Score all videos, identify weakest links
19. [ ] **V6.0 Batch** — Regenerate with all refinements

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

| Dimension | V5.0 | Current | Target |
|-----------|------|---------|--------|
| Hook impact | 7 | 8 ✅ | 9+ |
| Voice naturalness | 9 | 7 ⚠️ | 9 |
| Script authenticity | 7 | 9 ✅ | 9+ |
| Edit flow | 7 | 8 ✅ | 8+ |
| Overall watchability | 7 | 7.5 | 9+ |

**Latest Test:** video_1_1771169882743.mp4 (CeraVe Moisturizer) — Avg Score: 7.8/10

| Dimension | Score | Notes |
|-----------|-------|-------|
| Hook impact | 7.5/10 | shock-m002.mp4 — curated clip, better than old stock |
| Voice naturalness | 7/10 | Deepgram Luna - serviceable, still detectable as AI |
| Script authenticity | 9/10 | ✅ "Okay I finally caved..." — genuine friend energy |
| Edit flow | 8/10 | ✅ v2.0-organic: crossfades, subtle zoom, good pacing |
| Overall watchability | 7.5/10 | Would pass casual scroll, not scroll-stopper |

**Bottleneck:** Voice naturalness (7/10) blocked by missing ELEVENLABS_API_KEY

**Clip Quality:** New clips downloaded (react-m002-m004, reveal-m001-m003, shock-m001-m004) — clip-sourcing-v2 subagent stalled but partial progress captured

**The test:** Would you actually watch this? Would you share it?

---

*Updated: 2026-02-15 15:40 UTC*
