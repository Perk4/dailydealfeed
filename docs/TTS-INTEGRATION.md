# TTS Integration for DailyDealFeed

## Overview

Natural-sounding voiceovers are crucial for TikTok/Reels engagement. This document covers the TTS integration options for the video pipeline.

## TL;DR Recommendations

| Method | Quality | Cost | Best For |
|--------|---------|------|----------|
| **OpenClaw TTS** | ⭐⭐⭐⭐⭐ Natural | Free* | Agent-driven pipeline |
| **ElevenLabs API** | ⭐⭐⭐⭐⭐ Natural | ~$0.30/1k chars | Automated scripts |
| **Deepgram Aura-1** | ⭐⭐⭐ Decent | ~$0.015/1k chars | Budget option |
| **espeak-ng** | ⭐ Robotic | Free | Last resort only |

*OpenClaw TTS uses ElevenLabs backend, covered by subscription

---

## Option 1: OpenClaw TTS (Agent-Driven)

**Best for:** When the main OpenClaw agent orchestrates video creation.

### How It Works

OpenClaw has a built-in `tts` tool that uses ElevenLabs backend. It returns a `MEDIA:` path pointing to a local audio file:

```
MEDIA:/tmp/tts-XXXXXX/voice-TIMESTAMP.mp3
```

### Integration Approach

1. **Pre-generate voiceover** via OpenClaw agent before calling editor.js
2. **Pass the audio path** in the input JSON as `voiceover_audio`

```javascript
// Example pipeline (run by main agent)
const voiceoverPath = "/tmp/tts-fqFMPA/voice-1234567890.mp3"; // From TTS tool

const input = {
  product_id: "123",
  product_name: "LED Moon Light",
  product_price: "$20",
  // ... other fields
  voiceover_audio: voiceoverPath  // ← Pre-generated TTS
};

// Then call editor.js with this input
```

### Agent Workflow

```
1. Scout product
2. Generate script
3. Call TTS tool: tts(text="Your script here...")
4. Get MEDIA:/path/to/audio.mp3
5. Strip "MEDIA:" prefix → /path/to/audio.mp3
6. Pass to editor.js via voiceover_audio field
7. Editor uses the pre-generated audio
```

### Advantages
- Natural ElevenLabs voice
- No additional API keys needed
- Integrated in OpenClaw workflow

### Limitations
- Requires agent orchestration
- Can't be used in fully automated scripts

---

## Option 2: ElevenLabs Direct API

**Best for:** Standalone script execution, cron jobs, CI/CD pipelines.

### Setup

1. Get API key from [ElevenLabs](https://elevenlabs.io)
2. Add to environment:

```bash
export ELEVENLABS_API_KEY="your-api-key-here"
```

Or add to `/root/dailydealfeed/.env`:
```
ELEVENLABS_API_KEY=your-api-key-here
```

### Usage

The editor.js automatically tries ElevenLabs when:
- `ELEVENLABS_API_KEY` is set
- No `voiceover_audio` is provided

```javascript
// Input JSON - ElevenLabs will be used automatically
const input = {
  product_id: "123",
  product_name: "LED Moon Light",
  product_price: "$20",
  hook_angle: "Finally fixed my room situation",
  // Optional voice customization:
  tts_voice: "drew",       // Energetic male (good for reels)
  tts_style: "energetic"   // 'energetic', 'natural', or 'reels'
};
```

### Available Voices

| Voice | Type | Best For |
|-------|------|----------|
| `default` (sam) | Young male | General use |
| `drew` | Energetic male | High-energy reels |
| `bella` | Soft female | Friendly content |
| `josh` | Deep male | Professional |
| `domi` | Young female | Trendy content |

### Voice Styles

| Style | Description |
|-------|-------------|
| `energetic` | Fast, punchy, influencer style (default) |
| `reels` | Optimized for short-form video |
| `natural` | More conversational |

### Direct Module Usage

```javascript
const { generateElevenLabsTTS } = require('./lib/tts-elevenlabs');

await generateElevenLabsTTS(
  "This product is amazing!", 
  "/tmp/voiceover.mp3",
  { voice: "drew", style: "energetic" }
);
```

### Cost

- ~$0.30 per 1,000 characters on Creator plan
- Average reel script: 50-100 characters → ~$0.015-0.03 per video
- Monthly estimate (100 videos): ~$3

---

## Option 3: Deepgram Aura-1 (Budget)

**Best for:** High-volume, budget-conscious production.

### Setup

Already deployed at: `https://dailydealfeed-tts.prtl.workers.dev`

### How It's Used

Editor.js falls back to Deepgram when:
1. No `voiceover_audio` provided
2. ElevenLabs not configured or fails

### Available Speakers

`angus`, `asteria`, `arcas`, `orion`, `orpheus`, `athena`, `luna`, `zeus`, `perseus`, `helios`

Default: `luna` (female)

### Quality Notes

- Decent quality, noticeably synthetic
- Good for budget/testing
- May not pass "real person" test
- Works well with music overlay masking

### Cost

- ~$0.015 per 1,000 characters
- Very budget-friendly for high volume

---

## Fallback Chain

Editor.js uses this priority:

```
1. voiceover_audio (pre-generated, e.g., OpenClaw TTS)
   ↓ not provided
2. ElevenLabs API (if ELEVENLABS_API_KEY set)
   ↓ not configured or fails
3. Deepgram via Cloudflare Worker
   ↓ fails
4. espeak-ng (robotic, always works)
```

---

## Recommended Setup for Production

### For Agent-Driven Pipeline (Recommended)

```markdown
1. Main agent scouts product
2. Main agent generates script
3. Main agent calls: tts(text="script here")
4. Pass MEDIA path to editor.js
5. High-quality voiceover guaranteed
```

### For Automated/Cron Pipeline

```bash
# Set in environment or .env
export ELEVENLABS_API_KEY="your-key"

# Run pipeline
node scripts/editor.js --product-id 123
# → Automatically uses ElevenLabs
```

---

## Testing TTS Quality

### Quick Test Commands

```bash
# Test ElevenLabs
export ELEVENLABS_API_KEY="your-key"
node scripts/lib/tts-elevenlabs.js "This is a test" /tmp/test-11labs.mp3

# Test via editor (full pipeline)
node scripts/editor.js --test
```

### A/B Testing Voices

Edit `tts_voice` in input JSON to compare:
- `drew` - Most TikTok-native male voice
- `bella` - Natural female voice
- `sam` - Young, dynamic (default)

---

## Troubleshooting

### "ELEVENLABS_API_KEY not set"
Add to environment or `.env` file.

### "ElevenLabs API error (401)"
Check API key is valid and has credits.

### Audio sounds robotic
Falling back to espeak-ng. Check:
1. Is ELEVENLABS_API_KEY set?
2. Is Cloudflare worker responding?

### Audio too fast/slow
Adjust `tts_style`:
- `natural` for slower pace
- `energetic` for faster delivery

---

## Future Improvements

1. **Voice cloning** - Train custom voice on influencer samples
2. **Emotion detection** - Match voice tone to script sentiment
3. **Multi-speaker** - Different voices for hook vs product info
4. **Local caching** - Cache common phrases to reduce API calls

---

## Files Reference

| File | Purpose |
|------|---------|
| `scripts/editor.js` | Main video editor with TTS integration |
| `scripts/lib/tts-elevenlabs.js` | ElevenLabs API wrapper |
| `workers/tts-worker.js` | Cloudflare Worker for Deepgram |

---

*Last updated: 2025-02-15*
