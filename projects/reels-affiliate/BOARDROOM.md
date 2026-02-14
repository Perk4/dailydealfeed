# Reels Affiliate Boardroom

**Project:** Automated Instagram/TikTok Reels for @dailydealfeed affiliate products
**Repo:** github.com/Perk4/dailydealfeed
**Status:** 🟢 Active — Phase 1 Planning
**ClawDeck:** [Board 4 - Influencer Marketing](https://clawdeck-lqis.onrender.com/boards/4)

---

## Pipeline Overview

```
Product → Meme → Script → Assets → Assembly → Post
   🔍       🔍       ✍️       🎬        🎞️       📱
 Scout    Scout   Writer  Producer   Editor  Publisher
```

**Full automation target:**
1. Select product from products.json
2. Find trending meme clip (2-4 seconds)
3. Write voiceover script with hook + CTA
4. Get product shot from Amazon
5. Assemble video with discount overlay
6. Post to IG/TikTok @dailydealfeed

---

## Agent Roles

| Agent | Emoji | Responsibility | Deliverable |
|-------|-------|----------------|-------------|
| **Scout** | 🔍 | Product selection + meme hunting | `{product_id, meme_url, hook_angle}` |
| **Writer** | ✍️ | Voiceover script + captions | `{script, cta, ig_caption, tiktok_caption}` |
| **Producer** | 🎬 | Amazon asset collection | `{product_image, price, discount_code}` |
| **Editor** | 🎞️ | Video assembly + TTS | `{final_video_path, thumbnail}` |
| **Publisher** | 📱 | Post to platforms | `{post_urls, posted_at}` |
| **Biz** | 🅱️ | Orchestration + QA | Final approval at each stage |

---

## Handoff Ritual

Each stage:
1. Agent receives input from previous stage
2. Produces deliverable matching success criteria
3. **Biz validates** before passing to next agent
4. ❌ Fail → Feedback loop, retry with notes
5. ✅ Pass → Handoff to next agent

**Success criteria defined per-ticket on ClawDeck.**

---

## Active Tickets (ClawDeck Board 4)

| ID | Ticket | Priority | Status |
|----|--------|----------|--------|
| 28 | 🔍 Scout: Product & Meme Selection | High | inbox |
| 29 | ✍️ Writer: Script & CTA Generator | High | inbox |
| 30 | 🎬 Producer: Amazon Asset Collector | Medium | inbox |
| 31 | 🎞️ Editor: Video Assembly Pipeline | Medium | inbox |
| 32 | 📱 Publisher: IG/TikTok Posting | Low | inbox |
| 33 | 🔧 Setup: Add missing secrets | High | inbox |

---

## Credentials Status

| Secret | Status | Notes |
|--------|--------|-------|
| AGENTMAIL_API_KEY | ✅ Available | In Cloudflare secrets |
| AGENTMAIL | ❌ Missing | Need email address |
| AGENTMAIL_PW | ❌ Missing | Need password |
| AMAZON_STORE_ID | ❌ Missing | For affiliate links |
| IG/TikTok | ℹ️ | Uses @dailydealfeed + agentmail creds |

---

## Resources

| Resource | Location |
|----------|----------|
| Products JSON | `products.json` (15 products ready) |
| Landing Page | perk4.github.io/dailydealfeed |
| Instagram | @dailydealfeed |
| TikTok | @dailydealfeed |
| Carrd | dailydealfeed.carrd.co |

---

## Next Steps

1. **Human:** Add missing secrets to Cloudflare (ticket #33)
2. **Biz:** Assign Scout ticket to myself, build selection logic
3. **Biz:** Test meme sourcing APIs/methods
4. **Biz:** Spawn first sub-agent run once secrets ready

---

_Last updated: 2026-02-14 14:10 UTC_
