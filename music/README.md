# Background Music for DailyDealFeed Videos

## Overview
This folder contains royalty-free background music tracks for product videos.
Music plays at **20-30% volume** underneath TTS voiceover for a professional sound.

## 🎵 Required Tracks (5 minimum)

Download upbeat, TikTok-style tracks (15-30 seconds each):

| Filename | Style | Use Case |
|----------|-------|----------|
| `track01_trending.mp3` | Upbeat/Trendy | Product reveals |
| `track02_chill.mp3` | Lo-fi Chill | Lifestyle products |
| `track03_energetic.mp3` | High Energy | Flash deals |
| `track04_minimal.mp3` | Minimal/Clean | Tech products |
| `track05_fun.mp3` | Fun/Quirky | Novelty items |

## 📥 Recommended Sources (Royalty-Free, No Attribution Required)

### Pixabay Music (Best for TikTok vibes)
- **URL:** https://pixabay.com/music/search/tiktok%20viral/
- **License:** Pixabay License (free for commercial, no attribution)
- **Tip:** Search "trending" or "tiktok" for upbeat tracks
- Filter by duration: 15-30 seconds

### Uppbeat (Free tier available)
- **URL:** https://uppbeat.io/
- **License:** Free with attribution on free tier
- **Tip:** Great for modern, trendy sounds

### YouTube Audio Library
- **URL:** https://studio.youtube.com/channel/UC/music
- **License:** Free for YouTube (check each track)
- **Tip:** Filter by "Mood: Bright/Happy"

### Free Music Archive
- **URL:** https://freemusicarchive.org/
- **License:** Creative Commons (varies by track)
- **Tip:** Look for CC0 or CC-BY tracks

### Chosic
- **URL:** https://www.chosic.com/free-music/all/
- **License:** Creative Commons
- **Tip:** Good categorization by mood

## 🔧 Download Script

Run this to download sample tracks from Pixabay (requires manual steps):

```bash
# Option 1: Manual download from Pixabay
# 1. Go to https://pixabay.com/music/search/tiktok%20viral/
# 2. Download 5 tracks you like
# 3. Rename them: track01_*.mp3, track02_*.mp3, etc.
# 4. Place in this folder

# Option 2: Use yt-dlp for YouTube Audio Library
yt-dlp -x --audio-format mp3 "YOUTUBE_AUDIO_LIBRARY_URL" -o "track01_trending.mp3"
```

## 🎚️ Technical Requirements

- **Format:** MP3 (128-320kbps)
- **Duration:** 15-30 seconds (loops for longer videos)
- **Style:** Upbeat, modern, TikTok-friendly
- **Volume:** Tracks should be normalized (the editor will lower to 20%)

## 🔄 How Music is Used

The `editor.js` script:
1. Randomly selects a track from this folder
2. Loops it to match video duration (if needed)
3. Mixes at 20% volume under TTS voiceover
4. Outputs final video with voiceover + background music

```javascript
// From editor.js - music mixing
ffmpeg -i video.mp4 -i music.mp3 \
  -filter_complex "[1:a]volume=0.2,aloop=loop=-1:size=44100*20[music];[0:a][music]amix=inputs=2:duration=first" \
  -c:v copy output.mp4
```

## ⚠️ Copyright Notes

- **ALWAYS** verify the license before downloading
- Keep a record of where each track came from
- For Pixabay: No attribution required
- For CC-BY: Credit the artist in video description
- **AVOID:** Tracks with NC (Non-Commercial) restriction

## 📝 Track Sources Log

| Track | Source | License | Artist |
|-------|--------|---------|--------|
| track01_*.mp3 | | | |
| track02_*.mp3 | | | |
| track03_*.mp3 | | | |
| track04_*.mp3 | | | |
| track05_*.mp3 | | | |

*Fill this in as you download tracks*
