# DailyDealFeed Improvement Plan

**Goal:** Match @codesinred quality across all dimensions
**Benchmark:** https://codesinred.com/ (1413 episodes, 4+ years)
**Status:** 🔄 In Progress

---

## Overview

We're rebuilding DailyDealFeed to match the quality and consistency of @codesinred. This plan breaks work into phases, each handled by a dedicated sub-agent.

---

## Phase 1: Link Site Redesign 🏗️
**Status:** 🔄 In Progress
**Agent:** `site-architect`

### Objective
Transform our basic GitHub Pages embeds into a professional episode-based deal site like codesinred.com.

### Success Criteria
- [ ] Episode-based structure (collapsible sections)
- [ ] Product cards with: image, sale price, original price, % OFF, promo code
- [ ] Navigation: Home, Top Deals, About, Disclaimer
- [ ] Mobile-responsive design
- [ ] Newsletter signup placeholder
- [ ] Clean, professional aesthetic

### Deliverables
- `index.html` — Homepage with episode layout
- `styles.css` — Matching their clean design
- `about.html`, `disclaimer.html` — Standard pages
- Episode template system

---

## Phase 2: Promo Code Sourcing 🏷️
**Status:** ⏳ Pending
**Agent:** `code-hunter`

### Objective
Build a system to find and track Amazon promo codes for products.

### Success Criteria
- [ ] Identify 3-5 reliable promo code sources
- [ ] Create process doc for finding codes
- [ ] Add codes to 10+ products in queue
- [ ] Verify codes work before adding

### Deliverables
- `docs/PROMO-CODE-SOURCES.md` — Where to find codes
- Updated `production/queue/` with codes
- Verification process documented

---

## Phase 3: Affiliate Link Tracking 📊
**Status:** ⏳ Pending
**Agent:** `tracking-engineer`

### Objective
Set up proper affiliate link tracking (like their joylink.io).

### Success Criteria
- [ ] Research link shortener/tracking options
- [ ] Implement click tracking for all product links
- [ ] Dashboard or report for tracking performance
- [ ] Integration with product cards

### Deliverables
- Link tracking system (self-hosted or service)
- Analytics integration
- `docs/TRACKING-SETUP.md`

---

## Phase 4: Video Style Analysis 🎬
**Status:** ⏳ Pending
**Agent:** `video-analyst`

### Objective
Analyze @codesinred video style and document exactly what makes them work.

### Success Criteria
- [ ] Download/review 10 recent videos
- [ ] Document: hooks, audio, text overlays, transitions, CTAs
- [ ] Identify gaps vs our current 8.25/10 pipeline
- [ ] Create style guide for matching their quality

### Deliverables
- `docs/CODESINRED-VIDEO-STYLE.md` — Complete breakdown
- `docs/VIDEO-STYLE-GAPS.md` — What we need to fix
- Recommendations for pipeline changes

---

## Phase 5: Episode Production System 📦
**Status:** ⏳ Pending
**Agent:** `episode-producer`

### Objective
Create a system for producing daily episodes (batch of 6-8 products).

### Success Criteria
- [ ] Episode numbering system
- [ ] Batch production workflow
- [ ] Site auto-update when new episode ready
- [ ] 3x/day posting schedule support

### Deliverables
- `scripts/create-episode.js` — Generate new episodes
- Episode template
- Posting checklist
- First 3 test episodes created

---

## Phase 6: Pipeline Integration 🔧
**Status:** ⏳ Pending
**Agent:** `integration-engineer`

### Objective
Connect all components into a smooth end-to-end workflow.

### Success Criteria
- [ ] Product → Video → Episode → Post flow works
- [ ] Site updates automatically with new episodes
- [ ] Promo codes integrated
- [ ] Tracking integrated
- [ ] Manual posting checklist ready

### Deliverables
- Updated `scripts/orchestrator.js`
- End-to-end test of full workflow
- `docs/POSTING-WORKFLOW.md`

---

## Progress Tracking

| Phase | Agent | Status | Started | Completed |
|-------|-------|--------|---------|-----------|
| 1. Site Redesign | site-architect | 🔄 | 2026-02-21 | - |
| 2. Promo Codes | code-hunter | ⏳ | - | - |
| 3. Link Tracking | tracking-engineer | ⏳ | - | - |
| 4. Video Analysis | video-analyst | ⏳ | - | - |
| 5. Episode System | episode-producer | ⏳ | - | - |
| 6. Integration | integration-engineer | ⏳ | - | - |

---

## Lessons Learned

*Will be updated as phases complete*

---

## Communication

- Sub-agents report to Biz (main agent)
- Biz updates humans in #claw-groupchat
- Clarifying questions go through Biz → humans
- Progress updates every phase completion

---

*Last Updated: 2026-02-21 02:30 UTC*
