# DailyDealFeed Infrastructure Plan

## Overview
Build production-ready infrastructure in phases, with success criteria validation before proceeding.

---

## Phase 1: Directory Structure & Manifests
**Goal:** Create all staging/production directories with proper manifests

### Deliverables:
- [ ] `staging/products/{pending,approved,rejected}/`
- [ ] `staging/clips/{pending,approved,rejected}/`
- [ ] `production/{queue,in-progress,completed}/`
- [ ] `output/{approved,rejected}/`
- [ ] `staging/products/manifest.json` — validated products list
- [ ] `staging/clips/manifest.json` — evaluated clips list

### Success Criteria:
```bash
# All directories exist
test -d staging/products/approved && test -d staging/clips/approved && test -d production/queue && test -d output/approved
# Manifests have data
test -s staging/products/manifest.json && test -s staging/clips/manifest.json
# At least 5 products validated
jq '.products | length >= 5' staging/products/manifest.json
# At least 50 clips approved
jq '.clips | length >= 50' staging/clips/manifest.json
```

---

## Phase 2: Validation Scripts
**Goal:** Create robust validation scripts that actually work

### Deliverables:
- [ ] `scripts/validate-product.js` — validates ASIN via Playwright
- [ ] `scripts/evaluate-clip.js` — scores clips on 6 dimensions
- [ ] `scripts/stage-products.js` — batch product validation
- [ ] `scripts/stage-clips.js` — batch clip evaluation

### Success Criteria:
```bash
# Scripts exist and are executable
test -f scripts/validate-product.js && test -f scripts/evaluate-clip.js
# Product validator works (test with known good ASIN)
node scripts/validate-product.js B00PBX3L7K | jq '.valid == true'
# Clip evaluator works (test with known good clip)
node scripts/evaluate-clip.js clips/processed/afv-001.mp4 | jq '.total_score >= 6'
```

---

## Phase 3: Queue Manager
**Goal:** Create queue manager that pairs products with clips and generates videos

### Deliverables:
- [ ] `scripts/queue-manager.js` — full queue management
- [ ] Vibe matching (product category → clip vibe)
- [ ] QA scoring for outputs
- [ ] Queue status tracking

### Success Criteria:
```bash
# Queue manager exists
test -f scripts/queue-manager.js
# Can build queue from approved components
node scripts/queue-manager.js --build-queue | jq '.queue | length >= 5'
# Can generate a single video
node scripts/queue-manager.js --generate-one && test -f output/approved/*.mp4
```

---

## Phase 4: Integration Test
**Goal:** End-to-end test of full pipeline

### Deliverables:
- [ ] Generate 3 test videos through full pipeline
- [ ] All videos pass QA (score >= 8/10)
- [ ] Videos committed and pushed to GitHub
- [ ] Preview page updated

### Success Criteria:
```bash
# At least 3 videos in approved output
ls output/approved/*.mp4 | wc -l >= 3
# All videos have proper specs
for f in output/approved/*.mp4; do
  ffprobe -v quiet -show_entries stream=width,height "$f" | grep -q "1080" && grep -q "1920"
done
# Preview page accessible
curl -s https://perk4.github.io/dailydealfeed/preview.html | grep -q "video"
```

---

## Phase Status Tracking

| Phase | Status | Started | Completed | Agent |
|-------|--------|---------|-----------|-------|
| 1 | pending | - | - | - |
| 2 | pending | - | - | - |
| 3 | pending | - | - | - |
| 4 | pending | - | - | - |

---

## Cron Schedule

1. `infra-phase-checker` — every 15 min during build
   - Checks current phase success criteria
   - Spawns next phase agent if current passes
   - Reports to Discord

2. `progressive-improvement` — every 30 min (enabled after Phase 4)
   - Generates 1-2 videos
   - Runs QA
   - Reports quality trends
