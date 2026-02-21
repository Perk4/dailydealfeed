# Video Pipeline Improvement Plan

**Goal:** Achieve @codesinred-level video quality consistently
**Current Score:** 8.25/10
**Target Score:** 9.5/10
**Status:** 🔄 Investigation Complete — Ready for Phased Execution

---

## Executive Summary

The DailyDealFeed video pipeline is functional but has several gaps preventing it from reaching viral-quality content. The main issues are:

1. **Amazon Recorder Disabled** — Falling back to static images instead of dynamic product recordings
2. **Repetitive Hooks** — Same "Check this out" pattern, no variety
3. **TTS Fallback Risk** — espeak-ng robotic voice destroys credibility
4. **Missing Sound Effects** — No audio punctuation (cash register, swooshes)
5. **Static Overlays** — Hot pink sticker looks corporate, not organic

---

## Current Pipeline Flow

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        VIDEO PIPELINE v10                                │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  [1. PRODUCT INPUT]                                                      │
│       │                                                                  │
│       ▼                                                                  │
│  products.json / next-batch.json                                         │
│       │                                                                  │
│       ▼                                                                  │
│  [2. ORCHESTRATOR] ─────────────────────────────────────────────────────│
│       │                                                                  │
│       ├──► [2a. Amazon Recorder] ──► Product Video (DISABLED ⚠️)        │
│       │         └──► Falls back to static image                          │
│       │                                                                  │
│       ├──► [2b. Embed Generator] ──► embeds/product-X.html              │
│       │                                                                  │
│       └──► [2c. Editor.js] ◄─────────────────────────────────────────── │
│                   │                                                      │
│                   ├── Hook Clip (AFV/clips/)                            │
│                   ├── Product Segment (image/recording)                  │
│                   ├── TTS Voiceover (ElevenLabs → Deepgram → espeak)    │
│                   ├── Price Overlay (hot pink sticker)                   │
│                   ├── Music Mix (background track)                       │
│                   └── CTA Segment ("Link in bio")                        │
│                   │                                                      │
│                   ▼                                                      │
│  [3. OUTPUT]                                                             │
│       ├── output/video_X_timestamp.mp4                                   │
│       ├── output/thumb_X_timestamp.jpg                                   │
│       └── output/post_X_timestamp.json                                   │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Phase Breakdown

### Phase 1: Fix Critical Blockers 🔴 P0
**Agent:** `pipeline-critical-fixes`
**Effort:** 1-2 hours
**Success Criteria:** Pipeline runs end-to-end without falling back to broken states

| Task | Current State | Target State |
|------|---------------|--------------|
| Kill espeak-ng fallback | Falls back to robotic voice | Fail gracefully, block video |
| Fix Amazon Recorder | Disabled (line 73 editor.js) | Re-enable or improve fallback |
| Verify FFmpeg works | May be missing in container | Confirmed working |

**Deliverables:**
- [ ] espeak-ng fallback removed
- [ ] Amazon recorder status documented
- [ ] Pipeline health check passes

---

### Phase 2: Hook Variety System 🔴 P0
**Agent:** `hook-engineer`
**Effort:** 2-3 hours
**Success Criteria:** Videos use varied hooks based on product category

| Task | Current State | Target State |
|------|---------------|--------------|
| Hook template system | Single "Check this out" | 8+ category-aware templates |
| Hook selection logic | Random/hardcoded | Category + price aware |
| Hook text timing | May be delayed | Appears in first 500ms |

**Deliverables:**
- [ ] `scripts/lib/hooks.js` — Hook template library
- [ ] Category-aware hook selection in editor.js
- [ ] 3 test videos with varied hooks

---

### Phase 3: Sound Effects Library 🔴 P0
**Agent:** `audio-engineer`
**Effort:** 2-3 hours
**Success Criteria:** Every video has SFX every 2-4 seconds

| Task | Current State | Target State |
|------|---------------|--------------|
| SFX library | None | 5+ branded sounds |
| SFX insertion points | None | Price reveal, transitions, CTA |
| Audio mixing | Basic | Proper leveling (-15dB music) |

**Deliverables:**
- [ ] `assets/sfx/` — Sound effect files
- [ ] `scripts/lib/audio-mixer.js` — SFX insertion logic
- [ ] SFX integrated into editor.js

---

### Phase 4: Price Overlay Redesign 🟡 P1
**Agent:** `overlay-designer`
**Effort:** 1-2 hours
**Success Criteria:** Price display looks organic, not corporate

| Task | Current State | Target State |
|------|---------------|--------------|
| Price style | Hot pink sticker | Clean white text with shadow |
| Animation | Bounce-in | Subtle scale pop |
| Fire emoji 🔥 | Always present | Removed or context-dependent |

**Deliverables:**
- [ ] Updated overlay logic in editor.js
- [ ] Before/after comparison
- [ ] 3 test videos with new style

---

### Phase 5: TTS Quality Assurance 🟡 P1
**Agent:** `voice-engineer`
**Effort:** 2-3 hours
**Success Criteria:** No video ships with sub-par voice quality

| Task | Current State | Target State |
|------|---------------|--------------|
| TTS provider chain | ElevenLabs → Deepgram → espeak | ElevenLabs → Deepgram → BLOCK |
| Voice caching | Partial | Aggressive caching |
| Pre-generation | Optional | Required before editor |

**Deliverables:**
- [ ] TTS pre-generation in producer.js
- [ ] Voice quality gate (block if score < 7)
- [ ] Cache management script

---

### Phase 6: Pacing & Transitions 🟡 P1
**Agent:** `edit-engineer`
**Effort:** 2-3 hours
**Success Criteria:** Videos feel fast-paced like TikTok native content

| Task | Current State | Target State |
|------|---------------|--------------|
| Cut frequency | ~3-4 seconds | 1.5-2 seconds |
| Transitions | Basic crossfades | Hard cuts + zoom punches |
| Total length | 12 seconds | 10-12 seconds |

**Deliverables:**
- [ ] Updated timing constants in editor.js
- [ ] Transition variety system
- [ ] Rhythm template options

---

### Phase 7: Amazon Recording Revival 🟢 P2
**Agent:** `recorder-engineer`
**Effort:** 4-6 hours
**Success Criteria:** Dynamic product recordings work reliably

| Task | Current State | Target State |
|------|---------------|--------------|
| Playwright setup | May be broken | Working in container |
| Anti-detection | Basic | Enhanced stealth |
| Recording quality | Unknown | 1080p, smooth scroll |

**Deliverables:**
- [ ] Working amazon-recorder.js
- [ ] Container setup script
- [ ] 5 test recordings

---

### Phase 8: End-to-End Automation 🟢 P2
**Agent:** `automation-engineer`
**Effort:** 3-4 hours
**Success Criteria:** One command generates a complete episode of videos

| Task | Current State | Target State |
|------|---------------|--------------|
| Batch generation | Manual per-product | Batch all products |
| Quality gate | Manual review | Automated scoring |
| Episode integration | Separate | Unified workflow |

**Deliverables:**
- [ ] `scripts/generate-episode-videos.js`
- [ ] Quality scoring system
- [ ] Auto-approve threshold

---

## Success Metrics

| Metric | Current | Phase 1-3 | Phase 4-6 | Phase 7-8 |
|--------|---------|-----------|-----------|-----------|
| Pipeline success rate | ~70% | 95% | 98% | 99% |
| Video quality score | 8.25 | 8.75 | 9.25 | 9.5 |
| Time per video | ~2 min | ~1.5 min | ~1 min | ~45s |
| Human review needed | Always | Sometimes | Rarely | Exception only |

---

## Monitoring & Continuous Improvement

### Daily Cron (2 PM EST)
- Run pipeline healthcheck
- Generate 1 test video
- Log quality metrics
- Alert on failures

### Weekly Review
- Review generated videos
- Update style gaps doc
- Adjust priorities

---

## Agent Assignment Queue

| Priority | Phase | Agent Name | Status |
|----------|-------|------------|--------|
| P0 | 1 | `pipeline-critical-fixes` | ⏳ Ready |
| P0 | 2 | `hook-engineer` | ⏳ Ready |
| P0 | 3 | `audio-engineer` | ⏳ Ready |
| P1 | 4 | `overlay-designer` | ⏳ Pending |
| P1 | 5 | `voice-engineer` | ⏳ Pending |
| P1 | 6 | `edit-engineer` | ⏳ Pending |
| P2 | 7 | `recorder-engineer` | ⏳ Pending |
| P2 | 8 | `automation-engineer` | ⏳ Pending |

---

*Created: 2026-02-21*
*Last Updated: 2026-02-21*
