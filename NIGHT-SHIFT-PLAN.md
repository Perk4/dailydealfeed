# Night Shift Progressive Improvement Plan
**Date:** 2026-02-20
**Manager:** Clawd (Biz Manager)
**Method:** Subagent phases with success criteria handoffs

---

## Current State
- ✅ 21 videos approved, 1 needs review
- ✅ Logging system in place (117 points)
- ✅ Amazon 404 validation active
- ⏳ Embed pages need regeneration with new videos

---

## Phase 1: Post-Production Polish (30 min)
**Subagent:** `polish-agent`
**Priority:** HIGH

### Tasks
1. Regenerate all embed pages with new video files
2. Fix the 1 "needs-review" item (investigate why)
3. Generate thumbnails for all 21 videos
4. Create `output/manifest.json` with all approved videos

### Success Criteria
- [ ] 21 embed pages in `docs/` with working video URLs
- [ ] All items in queue are `completed` (0 needs-review)
- [ ] Thumbnails exist for each video
- [ ] manifest.json lists all approved videos with metadata

### Handoff
→ Push to GitHub, report URLs for spot-check

---

## Phase 2: Content Optimization (45 min)
**Subagent:** `content-optimizer`
**Priority:** MEDIUM

### Tasks
1. Analyze video scripts for engagement patterns
2. A/B test script variations (hook styles)
3. Create script templates based on best performers
4. Document "voice guidelines" in `docs/VOICE-GUIDE.md`

### Success Criteria
- [ ] 3+ script templates created
- [ ] Voice guide documented
- [ ] Top 5 hook styles identified with examples

### Handoff
→ Templates ready for next batch

---

## Phase 3: Pipeline Hardening (60 min)
**Subagent:** `reliability-engineer`
**Priority:** MEDIUM

### Tasks
1. Add retry logic for transient failures
2. Create health check script (`scripts/healthcheck.js`)
3. Add queue stuck-item recovery
4. Document failure modes in `docs/FAILURE-MODES.md`

### Success Criteria
- [ ] `--retry` flag works on queue-manager
- [ ] healthcheck.js reports pipeline status
- [ ] Stuck items auto-recover after 5 min
- [ ] Failure modes documented

### Handoff
→ Pipeline more resilient for unattended runs

---

## Phase 4: Analytics Foundation (45 min)
**Subagent:** `analytics-engineer`
**Priority:** LOW

### Tasks
1. Create tracking pixel system for embeds
2. Add click tracking to Amazon links
3. Design metrics dashboard schema
4. Create `scripts/analytics.js` for reporting

### Success Criteria
- [ ] Embeds include tracking capability
- [ ] Click data can be collected
- [ ] Dashboard schema documented

### Handoff
→ Ready to measure post engagement

---

## Phase 5: Fresh Product Scout (30 min)
**Subagent:** `product-scout`
**Priority:** MEDIUM

### Tasks
1. Scout 10 new trending products for next batch
2. Validate Amazon links before adding
3. Check for good review scores (4+ stars)
4. Add to queue with proper metadata

### Success Criteria
- [ ] 10 new products validated and queued
- [ ] All have valid Amazon links
- [ ] Diverse categories represented

### Handoff
→ Queue ready for next video batch

---

## Execution Schedule

| Time (UTC) | Phase | Subagent | Duration |
|------------|-------|----------|----------|
| 03:40 | Phase 1 | polish-agent | 30 min |
| 04:15 | Phase 2 | content-optimizer | 45 min |
| 05:00 | Phase 3 | reliability-engineer | 60 min |
| 06:00 | Phase 4 | analytics-engineer | 45 min |
| 06:45 | Phase 5 | product-scout | 30 min |
| 07:15 | Review | Manager checkpoint | 15 min |

---

## Manager Responsibilities

### Per-Phase
1. Spawn subagent with clear task brief
2. Monitor for completion announcement
3. Verify success criteria met
4. Handle any blockers/escalations
5. Approve handoff before next phase

### Rollback Rules
- If subagent fails 2x on same task → skip and log
- If critical path blocked → wake Steven
- If unclear requirements → pause and ask

### Reporting
After each phase, post to Discord:
```
✅ Phase X Complete
- [success criteria checklist]
- Commits: [hashes]
- Next: Phase Y at HH:MM
```

---

## Notes
- Container resets → install ffmpeg at start of each phase
- Push changes frequently (don't accumulate)
- Log everything to `memory/2026-02-20.md`
