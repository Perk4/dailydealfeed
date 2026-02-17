# DailyDealFeed Roadmap

**Last Updated:** 2026-02-17 03:12 UTC

---

## 📊 Current Status

| Metric | Value |
|--------|-------|
| **Pipeline Version** | V10.0 |
| **QA Score** | 8.25/10 |
| **Videos Ready** | 6 |
| **Clips in Library** | 44 (35 new from YouTube/TikTok) |
| **Bottleneck** | 🔴 Voice (7/10) — needs ELEVENLABS_API_KEY |

---

## 🚀 Completed Work (Today - Feb 15)

### Agents Spawned & Completed

| Agent | Task | Status | Output |
|-------|------|--------|--------|
| `v8-script-rewriter` | Rewrite scripts to "Next up we have..." format | ✅ Done | `script-map.json` updated |
| `editor-v8-updater` | Remove hook overlay, add price display | ✅ Done | `editor.js` V8 |
| `smart-cropper-v2` | Motion tracking, 4-6s clips, cliffhanger cuts | ✅ Done | `smart-crop-v2.js`, `cliffhanger-cut-v2.js` |
| `voiceover-timing-fix` | Delay voiceover until product shows | ✅ Done | `editor.js` V9 |
| `shorts-clip-downloader` | Download 9:16 clips from YouTube/TikTok | ✅ Done | 9 clips in `clips/shorts/` |
| `script-neutralizer` | Remove ALL testimonial language | ✅ Done | `script-map.json` v4.0 |
| `product-display-redesign` | Sticker-style price overlay + Amazon recording plan | ✅ Done | `editor.js` V10, `docs/AMAZON-SCREEN-RECORDING-PLAN.md` |
| `clip-downloader-v2` | Download clips from Steven's new links | ✅ Done | 35 clips (6 YT + 29 TikTok) |
| `clip-ingestion-pipeline` | Build production clip ingestion system | 🔄 In Progress | `scripts/ingest-clips.js` (6 phases) |

### Version History

| Version | Changes | Score |
|---------|---------|-------|
| V7.0 | AFV clips, cliffhanger cuts | 8.6/10 |
| V8.0 | Removed hook overlay, simplified scripts | 7.4/10 ⚠️ |
| V8.1 | Restored music, varied openers | 8.2/10 |
| V9.0 | Voiceover timing fix (hook audio first) | 8.25/10 |
| V10.0 | Neutral scripts, sticker overlay, 35 new clips | 8.25/10 |

---

## 🔄 In Progress

### 1. Clip Ingestion Pipeline ✅ COMPLETE
**Goal:** Production-ready `ingest-clips.js` for automated clip acquisition

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Foundation + Download | ✅ Done |
| 2 | Quality Filtering | ✅ Done |
| 3 | Cliffhanger Detection | ✅ Done |
| 4 | Auto Vibe Tagging | ✅ Done |
| 5 | Unified Library Integration | ✅ Done (71 clips) |
| 6 | CLI Polish + Documentation | ✅ Done |

### 2. Amazon Screen Recorder ✅ COMPLETE
- `scripts/amazon-recorder.js` — records Amazon mobile page
- Test recordings: CeraVe (239KB), Pink Stuff (218KB)
- Ready to integrate with editor.js

### 3. Orchestrator System ✅ COMPLETE
- `scripts/orchestrator.js` — coordinates parallel product processing
- `scripts/generate-embed.js` — creates Carrd embed pages for GitHub Pages
- Workflow: Product Selected → [Parallel] Amazon Recording + Embed Gen → [Sequential] Video Generation
- CLI: `node orchestrator.js <ASIN>` or `--process-queue`

---

## 🚧 Blocked

### Voice Quality (7/10 → 9/10)
- **Blocker:** `ELEVENLABS_API_KEY` not set in `.env`
- **Current:** Deepgram Luna (serviceable but sounds AI)
- **Fix:** Add ElevenLabs key to unlock natural voices
- **Impact:** Entire pipeline stuck at 8.25/10 until resolved

---

## 📋 TODO (Prioritized)

### P0 — Must Do Now
1. [ ] **Set ELEVENLABS_API_KEY** — Unblock voice quality
2. [ ] **Complete clip ingestion pipeline** — Agent working on it

### P1 — This Week
3. [ ] **Amazon mobile screen recording** — Replace static product images
   - Plan ready: `docs/AMAZON-SCREEN-RECORDING-PLAN.md`
   - Uses Playwright with mobile viewport
4. [ ] **Test first real post** — Manual post to validate engagement

### P2 — Next Week
5. [ ] **A/B testing framework** — Compare hooks, scripts, music
6. [ ] **Analytics dashboard** — Track views, engagement, conversions
7. [ ] **Auto-posting** — Integrate with IG/TikTok APIs when available

### P3 — Future
8. [ ] **Product scouting automation** — Auto-find trending Amazon products
9. [ ] **Competitor analysis** — Monitor what's working in the niche
10. [ ] **Multi-account support** — Scale to additional handles

---

## 📁 Key Files

| File | Purpose |
|------|---------|
| `scripts/editor.js` | Video generation (V10) |
| `scripts/orchestrator.js` | End-to-end product orchestration |
| `scripts/generate-embed.js` | Carrd embed page generator |
| `scripts/amazon-recorder.js` | Amazon mobile UI recording |
| `scripts/scout.js` | Product + clip matching |
| `scripts/script-map.json` | Neutral scripts (v4.0) |
| `scripts/ingest-clips.js` | Clip ingestion (WIP) |
| `clips/library.json` | Unified clip manifest (WIP) |
| `clips/shorts-manifest.json` | YouTube/TikTok clips |
| `docs/AMAZON-SCREEN-RECORDING-PLAN.md` | Product display plan |
| `embeds/` | Generated product embed pages |
| `output/` | Generated videos |

---

## 💡 Key Decisions Made

1. **AFV clips > stock footage** — +139% quality improvement
2. **Neutral scripts only** — No testimonials, no personal claims
3. **Voiceover after hook** — Hook plays with original audio first
4. **Sticker-style price** — Hot pink, fire emoji, bounce animation
5. **9:16 clips from Shorts/TikTok** — Skip smart cropper until fixed

---

## 📈 Quality Targets

| Dimension | Current | Target |
|-----------|---------|--------|
| Hook | 8/10 ✅ | 9/10 |
| Voice | 7/10 ⚠️ | 9/10 |
| Script | 9/10 ✅ | 9/10 |
| Edit | 8.5/10 ✅ | 9/10 |
| **Overall** | **8.25/10** | **9/10** |

---

## 🔗 Links

- **Preview:** https://perk4.github.io/dailydealfeed/preview.html
- **Repo:** https://github.com/Perk4/dailydealfeed
- **IG Handle:** @dailydealfeed
- **TikTok Handle:** @dailydealfeed
- **Amazon Store ID:** dailydealfeed-20

---

*This roadmap is the single source of truth. Update it as work progresses.*
