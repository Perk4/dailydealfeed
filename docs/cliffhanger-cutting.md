# Cliffhanger Cutting — The Psychology of Engagement

## The Core Principle

**Cut RIGHT BEFORE the payoff.**

The human brain *needs* closure. When you show buildup but cut before the payoff, viewers:
1. Watch longer, hoping to see what happens
2. Loop the video (TikTok/Reels auto-loop = more views)
3. Engage more (comments like "WAIT WHAT HAPPENED?!")
4. Share to discuss what they think happened

This is why "wait for it" TikToks go viral — but the clever ones loop *before* "it" happens.

## Optimal Lead Times

Based on content type:

| Content Type | Lead Time | Why |
|-------------|-----------|-----|
| **Physical comedy** (falls, hits) | 0.5s | Need time to register what's about to happen |
| **Reactions** (face reveals) | 0.3s | Tighter cut = more tension |
| **Suspense moments** | 0.7s | Let tension build |
| **Quick actions** | 0.25s | Don't over-anticipate |

### The Sweet Spot: 0.4-0.5 seconds

For most AFV-style content, **0.5s** is the magic number. It's enough time that:
- Viewer sees what's coming
- Brain starts predicting the outcome
- Cut happens before prediction is confirmed

## Examples

### Example 1: Kid Swings Bat
- **Raw clip:** 10 seconds
- **Impact moment:** 6.0s (bat connects/misses)
- **Lead time:** 0.5s
- **Duration:** 3.0s
- **Output:** 2.5s → 5.5s

Viewer sees: kid winding up, starting swing...
Viewer doesn't see: the miss/hit
Result: "Did they hit it?!" → loops, comments, engagement

### Example 2: Cat Jumps Toward Table
- **Impact moment:** 4.2s (lands or knocks stuff over)
- **Lead time:** 0.5s
- **Output:** ends at 3.7s

Viewer sees: cat crouching, launching...
Viewer doesn't see: the landing
Result: Maximum chaos anticipation

### Example 3: Reaction Video
- **Impact moment:** 8.0s (person's face when they see surprise)
- **Lead time:** 0.3s (tighter for reactions)
- **Output:** ends at 7.7s

Viewer sees: person turning around...
Viewer doesn't see: full reaction
Result: Imagination fills in (often funnier than reality)

## Usage

### Single Clip
```bash
node scripts/cliffhanger-cut.js input.mp4 output.mp4 --impact 6.0 --lead 0.5 --duration 3.0
```

### From Timestamps File
```bash
node scripts/cliffhanger-cut.js --batch afv-timestamps.json --source ./raw --output ./cliffhangers
```

### Test Different Lead Times
```bash
node scripts/cliffhanger-cut.js --test-leads input.mp4 --impact 6.0 --output ./tests
```

## Timestamp File Format

`afv-timestamps.json`:
```json
[
  {
    "id": "bat-swing-kid",
    "file": "raw_clip_001.mp4",
    "start": 2.0,
    "end": 8.0,
    "impact_moment": 6.0,
    "lead_time": 0.5,
    "duration": 3.0,
    "type": "physical"
  }
]
```

## Quality Checklist

After cutting, ask yourself:

- [ ] Does the clip end mid-action? (not before, not after)
- [ ] Can you SEE what's about to happen?
- [ ] Do you feel the urge to see what happens next?
- [ ] Would you loop this to see if you missed something?

If yes to all → perfect cliffhanger.

## Anti-Patterns

❌ **Cutting too early:** Viewer doesn't understand what's happening
❌ **Cutting too late:** Viewer sees the payoff (no hook)
❌ **No buildup:** Clip starts mid-action with no context
❌ **Too long:** Attention lost before the cliffhanger moment

## The 3-Second Rule

For short-form (TikTok, Reels, Shorts):
- 3 seconds is often optimal
- 2-4 seconds is the safe range
- Under 2s feels too abrupt
- Over 5s loses attention before the hook
