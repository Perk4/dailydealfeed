# TTS Setup Guide

**Last Updated:** 2026-02-21
**Version:** V14

---

## Overview

DailyDealFeed uses text-to-speech for voiceovers. The TTS system has a priority chain:

1. **Pre-generated audio** — Best quality, use when available
2. **ElevenLabs** — Premium quality, requires API key
3. **Cloudflare Workers AI** — Good quality, cloud-based
4. **Deepgram** — Alternative cloud TTS
5. ~~espeak-ng~~ — **BLOCKED** (robotic, quality gate rejects)

---

## Configuration

### In editor.js
```javascript
const TTS_CONFIG = {
  voice: 'en-us',
  speed: 150,          // Words per minute
  pitch: 50,           // 0-99
  useExternalTTS: true, // Try external TTS first
  useOpenClawTTS: true  // Prefer OpenClaw TTS
};
```

---

## Provider Setup

### 1. ElevenLabs (Recommended)

**Quality:** ⭐⭐⭐⭐⭐ (Best)
**Cost:** ~$0.30/1000 characters

```bash
# Set environment variable
export ELEVENLABS_API_KEY="your-key-here"
```

Or add to `.env`:
```
ELEVENLABS_API_KEY=your-key-here
```

**Voices:**
- Rachel (energetic, young)
- Drew (casual, conversational)
- Charlotte (British, warm)

### 2. Cloudflare Workers AI

**Quality:** ⭐⭐⭐⭐ (Good)
**Cost:** Free tier available

Uses Cloudflare account credentials. If running in Cloudflare Workers, auto-authenticates.

### 3. Pre-generated Audio

**Quality:** ⭐⭐⭐⭐⭐ (Custom)
**Cost:** One-time

For batch production, pre-generate voiceovers:
```bash
# Generate voiceover externally and provide path
node scripts/editor.js --input '{
  "product_id": "1",
  "voiceover_audio": "/path/to/voiceover.mp3",
  ...
}'
```

---

## Quality Gate

**As of V14**, the TTS system will **refuse to generate videos** if no quality provider is available:

```javascript
// If all quality providers fail:
throw new Error('TTS_QUALITY_GATE: No quality TTS provider available.');
```

This ensures no video ships with robotic audio.

---

## Testing TTS

### Check Provider Availability
```bash
# Test if ElevenLabs is configured
echo $ELEVENLABS_API_KEY

# Test TTS generation
node -e "
const editor = require('./scripts/editor');
// Editor will log TTS provider used
"
```

### Generate Test Voiceover
```bash
# Using the generate-voiceover script
node scripts/generate-voiceover.js "This is a test voiceover"
```

---

## Troubleshooting

### Error: TTS_QUALITY_GATE
**Cause:** No quality TTS provider available
**Fix:** 
1. Set `ELEVENLABS_API_KEY` environment variable
2. Or ensure Cloudflare Workers AI is accessible
3. Or pre-generate audio and pass `voiceover_audio` path

### Error: Empty audio file
**Cause:** TTS provider returned error
**Fix:** Check API key validity, network connectivity

### Robotic voice in old videos
**Cause:** Generated before V14 quality gate
**Fix:** Re-generate with quality TTS provider

---

## Recommended Setup

For production, use this priority:

1. **Batch pre-generate** voiceovers with ElevenLabs
2. **Cache aggressively** — save every unique script
3. **Review before publishing** — listen to each video

### Pre-generation Workflow
```bash
# 1. Generate scripts for batch
node scripts/create-episode.js --scripts-only

# 2. Send to ElevenLabs batch API
# 3. Download and save to assets/voiceovers/

# 4. Run editor with pre-generated audio
node scripts/editor.js --product-id 1 --voiceover assets/voiceovers/product-1.mp3
```

---

## Future Improvements

- [ ] Add voice cloning (train on real recordings)
- [ ] Implement A/B testing different voices
- [ ] Add emotion/energy detection
- [ ] Cache voiceovers by script hash

---

*TTS quality is critical — viewers detect bad audio instantly.*
