# Staging Pipeline Plan

## Problem Statement
Current pipeline produces videos without validating components first, leading to:
- Broken Amazon pages (404s, wrong products)
- Bad hook clips (AI-generated, wrong aspect ratio, low engagement)
- Unprofessional price overlays
- Wasted resources on bad outputs

## Solution: Two-Stage Validation Pipeline

```
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 1: COMPONENT STAGING                                      │
│  Each component validated BEFORE video production                │
└─────────────────────────────────────────────────────────────────┘
        │                              │
        ▼                              ▼
┌───────────────────┐        ┌───────────────────┐
│  PRODUCT STAGING  │        │   CLIP STAGING    │
│  staging/products/│        │   staging/clips/  │
│                   │        │                   │
│  Checklist:       │        │  Checklist:       │
│  ✓ ASIN valid     │        │  ✓ 9:16 aspect    │
│  ✓ Page loads     │        │  ✓ >720p quality  │
│  ✓ Images exist   │        │  ✓ Has audio      │
│  ✓ Price accurate │        │  ✓ 4-6s duration  │
│  ✓ In stock       │        │  ✓ High engagement│
│                   │        │  ✓ Not AI-gen     │
│  Status: ✅/❌    │        │  Status: ✅/❌    │
└───────────────────┘        └───────────────────┘
        │                              │
        └──────────┬───────────────────┘
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 2: VIDEO PRODUCTION                                       │
│  Only approved products + clips enter pipeline                   │
│  production/queue/                                               │
└─────────────────────────────────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────────────┐
│  STAGE 3: OUTPUT QA                                              │
│  Final video evaluation before publishing                        │
│  output/approved/ vs output/rejected/                            │
└─────────────────────────────────────────────────────────────────┘
```

## Directory Structure
```
/root/dailydealfeed/
├── staging/
│   ├── products/
│   │   ├── pending/      # Products to validate
│   │   ├── approved/     # Ready for video
│   │   └── rejected/     # Failed validation
│   ├── clips/
│   │   ├── pending/      # Clips to evaluate
│   │   ├── approved/     # High-quality clips
│   │   └── rejected/     # Low-quality clips
│   └── staging-status.json
├── production/
│   ├── queue/            # Approved product+clip pairs
│   └── in-progress/      # Currently generating
└── output/
    ├── approved/         # Ready to post
    └── rejected/         # Failed QA
```

## Validation Scripts

### 1. Product Validator (`scripts/validate-product.js`)
```javascript
async function validateProduct(asin) {
  const checks = {
    asin_format: /^B[A-Z0-9]{9}$/.test(asin),
    page_loads: false,
    images_exist: false,
    price_found: false,
    in_stock: false
  };
  
  // Use Playwright to actually load Amazon page
  // Verify product exists and images load
  // Return pass/fail with reasons
}
```

### 2. Clip Evaluator (`scripts/evaluate-clip.js`)
```javascript
async function evaluateClip(clipPath) {
  const scores = {
    aspect_ratio: 0,    // Must be 9:16
    resolution: 0,      // Must be >720p
    has_audio: 0,       // Needs sound
    duration: 0,        // 4-6 seconds ideal
    engagement: 0,      // Scene changes, motion
    not_ai: 0           // Human detection
  };
  
  // Calculate total score out of 10
  // Reject if < 7/10
}
```

### 3. Production Queue Manager (`scripts/queue-manager.js`)
```javascript
async function buildQueue() {
  const approvedProducts = loadApprovedProducts();
  const approvedClips = loadApprovedClips();
  
  // Match products to clips by vibe
  // Only create queue items with valid pairs
}
```

## Cron Jobs

### Staging Validation (every 30 min)
- Check staging/products/pending/ for new products
- Validate each and move to approved/ or rejected/
- Check staging/clips/pending/ for new clips
- Evaluate each and move to approved/ or rejected/

### Production Run (every hour)
- Build queue from approved components
- Generate videos for queue items
- Run QA on outputs
- Report results to Discord

## Success Metrics
- 0% broken Amazon pages in final videos
- 0% AI-generated or low-quality hooks
- 100% of clips are proper 9:16
- >8/10 average QA score on outputs
