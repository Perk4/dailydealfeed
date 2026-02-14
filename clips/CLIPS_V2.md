# DailyDealFeed Clips Library V2

> **Scout V2 Upgrade** - Viral-style hooks instead of generic Giphy GIFs

## Overview

This is the upgraded clip sourcing system for @dailydealfeed videos. Instead of generic Giphy GIFs, we now use curated viral-style video clips that are:

- **2-4 seconds long** - Perfect hook length
- **Attention-grabbing** - Shock, surprise, fails, reactions
- **Properly licensed** - All clips are royalty-free for commercial use
- **Locally cached** - Fast access, no API dependencies

## Sources

All clips come from reputable free stock video sites:

| Source | License | URL |
|--------|---------|-----|
| **Mixkit** | Free commercial use (Mixkit License) | https://mixkit.co |
| **Pexels** | Free commercial use | https://pexels.com |
| **Coverr** | Free commercial use | https://coverr.co |
| **Pixabay** | Royalty-free, no attribution | https://pixabay.com |

## Clip Categories (Vibes)

### shocked (6 clips)
WTF moments, jaw drops, hands-on-head reactions
- Best for: Tech gadgets, surprising products, before/afters

### fail (4 clips)
Relatable fails, domino effects, office drama
- Best for: Problem → solution products, cleaning transformations

### reveal (4 clips)
Discovery moments, satisfying reveals, surprise reactions
- Best for: Room reveals, aesthetic products, unboxing energy

### reaction (5 clips)
Excited reactions, positive responses, shared moments
- Best for: Review-style hooks, "worth the hype" products

### twist (5 clips)
Quirky moments, unexpected scenes, lifestyle vibes
- Best for: Unique products, life hacks, fun gadgets

### cozy (3 clips)
Relaxed vibes, comfort, pleasant scenes
- Best for: Comfort products, home items, cozy aesthetics

### transformation (3 clips)
Before/after energy, slow-mo satisfying, change moments
- Best for: Cleaning products, beauty items, glow-ups

## Usage

### Basic Scout (select product + match clip)
```bash
node scripts/scout.js --pretty
```

### View library stats
```bash
node scripts/scout.js --clip-stats
```

### Scout for specific product
```bash
node scripts/scout.js --product-id 5 --pretty
```

### Pre-cache all clips
The video sites (Mixkit, Pexels) require browser-based downloads. Options:

**Option 1: Use yt-dlp (recommended)**
```bash
pip install yt-dlp
node scripts/scout.js --cache-all
```

**Option 2: Manual download**
```bash
node scripts/scout.js --cache-all  # Lists URLs if yt-dlp not installed
```
Then visit each URL and download to `clips/cache/{clip-id}.mp4`

**Option 3: Use streaming URLs directly**
The video pipeline can use `clip_url` directly without local caching.
FFmpeg and most video editors can stream from URLs.

## Output Format

The scout now returns clip info in addition to product info:

```json
{
  "product_id": "1",
  "product_name": "LED Moon Night Light",
  "clip_id": "cozy-002",
  "clip_name": "Woman singing mirror",
  "clip_url": "https://assets.mixkit.co/videos/...",
  "clip_local_path": "/root/dailydealfeed/clips/cache/cozy-002.mp4",
  "clip_source": "mixkit",
  "clip_vibe": "cozy",
  "clip_duration": 4,
  "clip_hook_style": "lifestyle",
  "hook_angle": "POV: Your room transformation at 3am"
}
```

## Clip Matching Logic

1. **Product-specific vibes** - Each product has preferred vibes defined
2. **Category fallback** - If no product config, uses category defaults
3. **Rotation** - Avoids recently-used clips (last 10)
4. **Local cache** - Downloads on first use, cached thereafter

## Adding New Clips

Edit `clips/clips.json`:

```json
{
  "vibe_name": [
    {
      "id": "vibe-001",
      "name": "Descriptive name",
      "source": "mixkit",
      "sourceId": "12345",
      "url": "https://assets.mixkit.co/videos/preview/mixkit-...-large.mp4",
      "duration": 4,
      "vibe": "Description of the vibe",
      "hookStyle": "reveal_reaction"
    }
  ]
}
```

### Hook Styles
- `reveal_reaction` - Discovery/wow moment
- `problem_intro` - Sets up a problem
- `positive_reveal` - Happy surprise
- `transformation` - Before/after energy
- `lifestyle` - Relatable daily moment
- `dramatic_intro` - Bold opening
- `empathy_hook` - Relatable struggle
- `satisfaction` - Satisfying payoff

## Future Enhancements

- [ ] More clips per category (target: 50+ total)
- [ ] Seasonal clip packs (holiday, summer, etc.)
- [ ] A/B test different clip styles per product
- [ ] Auto-trim clips to exact 2-3 second hooks
- [ ] Integration with video editor pipeline

## Notes

- All clips are preview quality (720p) - sufficient for reel hooks
- Clips are cached in `clips/cache/` directory
- Clear cache to re-download: `rm -rf clips/cache/*`
- The legacy `meme_url` field is kept for backwards compatibility
