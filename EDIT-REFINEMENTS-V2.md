# Edit Refinements v2.0 - "Organic Mode"

**Date:** 2026-02-15  
**Problem:** Videos felt too "produced" — not organic TikTok feel (scored 7/10)  
**Solution:** Subtler edits that mirror real TikTok content patterns

---

## Changes Made

### 1. ✅ Zoom Intensity Reduced (58% reduction)
- **Before:** Ken Burns zoom 1.0 → 1.12 (12% zoom)
- **After:** Ken Burns zoom 1.0 → 1.05 (5% zoom)
- **Why:** Real TikTok zooms are reactive and subtle, not constant aggressive push-in

### 2. ✅ Text Delay Added (0.15s after audio)
- **Before:** Text appeared immediately/uniformly with segment start
- **After:** Text appears 0.15s AFTER the spoken word
- **Why:** TikTok pattern: text follows audio, feels spontaneous like someone added captions reactively
- Price text now appears 0.25s after product name (staggered for natural feel)

### 3. ✅ Crossfade Transitions (0.3s fades)
- **Before:** Hard cuts between hook → product → CTA segments
- **After:** 0.3s fade transitions between all segments
- **Why:** Smoother flow, less jarring, more professional without being over-produced
- **Technical:** Normalized all streams to 25fps with settb for compatible xfade

### 4. ✅ Progress Bar Disabled
- **Before:** Always-on thin progress bar at bottom
- **After:** Disabled by default (`progressBarEnabled: false`)
- **Why:** Progress bars can feel gimmicky/distracting on short-form content. Native TikTok doesn't add them.

### 5. ✅ Music Volume Lowered (25% reduction)
- **Before:** 20% volume under voiceover, 50% without
- **After:** 15% volume under voiceover, 40% without
- **Why:** Music should enhance, not compete with voice. Subtler background keeps focus on content.

### 6. ✅ Camera Shake Reduced (25% reduction)
- **Before:** 4px shake intensity on hook segment
- **After:** 3px shake intensity
- **Why:** Energy should feel natural, not manufactured

### 7. ✅ Text Animations Refined
- Fade-in duration reduced: 0.5s → 0.35-0.4s (snappier)
- Slide distance reduced: 30-40px → 20-30px (subtler)
- Result: Text feels like it "pops" rather than slowly animates in

---

## Configuration (EDIT_STYLE object)

```javascript
const EDIT_STYLE = {
  zoomIntensity: 0.05,       // 1.0 to 1.05 zoom (was 0.12)
  textDelaySeconds: 0.15,    // Text appears AFTER audio cue
  progressBarEnabled: false, // Disabled for organic feel
  crossfadeDuration: 0.3,    // Fade between segments
  shakeIntensity: 3,         // Reduced camera shake
};

const MUSIC_CONFIG = {
  volume: 0.15,              // 15% under voiceover (was 0.20)
  // ...
};
```

---

## Test Video Generated

**File:** `output/video_3_refined_1771166079659.mp4`
- Product: The Pink Stuff ($4.79)
- Duration: 9.4s
- Resolution: 1080x1920 (9:16)
- Voiceover: Yes (Deepgram luna voice)
- Music: track04_upbeat_corporate.mp3 @ 15%
- Edit Style: v2.0-organic

---

## TikTok Patterns Studied

Real viral TikTok content tends to:
1. **Text after audio** — Captions appear slightly after the word is spoken (like auto-captions)
2. **Reactive zooms** — Zoom on emphasis, not constant slow push
3. **Fast/slow rhythm** — Quick hooks, slightly longer product reveals, snappy CTAs
4. **No progress bars** — Native TikTok UI handles progress
5. **Music as texture** — Background ambiance, not competing sound

---

## Metadata Tracking

All generated videos now include `edit_style` in post JSON:

```json
{
  "edit_style": {
    "version": "2.0-organic",
    "zoom_intensity": 0.05,
    "text_delay": 0.15,
    "progress_bar": false,
    "crossfade": 0.3,
    "music_volume": 0.15
  }
}
```

This allows A/B testing different edit styles and tracking what performs best.

---

## Next Steps

1. Test refined video on TikTok/IG for engagement comparison
2. Consider adding more pacing variation (hook_duration variance)
3. Experiment with different crossfade transitions (wipe, dissolve)
4. Add optional emphasis zooms triggered by script keywords
