# Pipeline Critical Fixes — Phase 1 Complete

**Date:** 2026-02-21
**Agent:** Biz (direct execution)
**Status:** ✅ Complete

---

## Summary

Fixed critical blockers in the video pipeline to ensure quality output.

---

## 1. espeak-ng Fallback — BLOCKED ✅

### Problem
The TTS system had a fallback chain that could produce robotic audio:
```
ElevenLabs → Deepgram → Cloudflare Workers AI → espeak-ng (robotic!)
```

If all quality providers failed, espeak-ng would produce obviously synthetic audio that destroys viewer trust.

### Fix Applied
**File:** `scripts/editor.js` (lines 775-791)

Changed from:
```javascript
// Last resort: espeak-ng
logger.tts('WARN', `Falling back to espeak-ng...`);
return generateTTSEspeak(voiceoverText, outputPath);
```

To:
```javascript
// BLOCKED: espeak-ng produces robotic voice
logger.tts('ERROR', `All quality TTS providers failed - BLOCKING video generation`);
throw new Error('TTS_QUALITY_GATE: No quality TTS provider available.');
```

### Result
Videos will now **fail to generate** rather than ship with bad audio. This protects brand quality.

---

## 2. Amazon Recorder — DOCUMENTED ⚠️

### Status
**Disabled since V13** (line 73 of editor.js)

```javascript
// V13: Disabled amazon-recorder - using static image fallback
const recordAmazonProduct = async () => ({ success: false, message: 'Disabled - using static fallback' });
```

### Why Disabled
The Amazon recorder uses Playwright to capture mobile product page scrolling. It was likely disabled due to:
1. Container environment lacking browser dependencies
2. Amazon anti-bot detection
3. Reliability issues

### Current Behavior
Falls back to static product images with Ken Burns zoom effect.

### Recommendation
- **Short-term:** Continue with static images (works reliably)
- **Long-term:** Phase 7 will address Amazon recording revival with proper browser setup

---

## 3. FFmpeg — INSTALLED ✅

### Before
```
sh: 1: ffmpeg: not found
```

### After
```
ffmpeg version 4.4.2-0ubuntu0.22.04.1
```

### Installed Via
```bash
apt-get update && apt-get install -y ffmpeg
```

---

## 4. Healthcheck — PASSING ✅

```json
{
  "healthy": true,
  "checks": {
    "ffmpeg": { "ok": true, "version": "4.4.2-0ubuntu0.22.04.1" },
    "directories": { "ok": true, "present": 7 },
    "queueFile": { "ok": true, "stats": { "total": 22, "completed": 21 } },
    "stuckItems": { "ok": true, "count": 0 }
  }
}
```

---

## Files Changed

| File | Change |
|------|--------|
| `scripts/editor.js` | Blocked espeak-ng fallback, throws error instead |

---

## Remaining Blockers

1. **No quality TTS configured** — Need ElevenLabs API key or Cloudflare Workers AI
2. **Amazon Recorder disabled** — Using static images (acceptable for now)

---

## Next Phase

**Phase 2: Hook Variety System** — Implement category-aware hook templates to replace repetitive "Check this out" hooks.

---

*Phase 1 complete. Pipeline will now fail safely rather than produce low-quality output.*
