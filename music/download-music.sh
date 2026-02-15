#!/bin/bash
# Download royalty-free background music for DailyDealFeed videos
# Run from the music/ directory

set -e
cd "$(dirname "$0")"

echo "🎵 DailyDealFeed Music Downloader"
echo "================================="
echo ""

# Check for required tools
if ! command -v curl &> /dev/null; then
    echo "❌ curl is required but not installed"
    exit 1
fi

# Create temporary sample tracks using FFmpeg (if available)
if command -v ffmpeg &> /dev/null; then
    echo "🔧 FFmpeg found - creating sample placeholder tracks..."
    
    # Track 1: Upbeat Synth (20s)
    ffmpeg -y -f lavfi -i "anoisesrc=d=20:c=pink:r=44100,volume=0.3,lowpass=f=2000" \
      -f lavfi -i "sine=frequency=440:duration=20,volume=0.1" \
      -filter_complex "[0:a][1:a]amix=inputs=2[out]" -map "[out]" \
      -t 20 -c:a libmp3lame -q:a 4 track01_upbeat_synth.mp3 2>/dev/null && \
      echo "✅ Created track01_upbeat_synth.mp3"
    
    # Track 2: Lo-fi Beat (20s)
    ffmpeg -y -f lavfi -i "anoisesrc=d=20:c=brown:r=44100,volume=0.2,highpass=f=300" \
      -f lavfi -i "sine=frequency=330:duration=20,volume=0.15" \
      -filter_complex "[0:a][1:a]amix=inputs=2[out]" -map "[out]" \
      -t 20 -c:a libmp3lame -q:a 4 track02_lofi_beat.mp3 2>/dev/null && \
      echo "✅ Created track02_lofi_beat.mp3"
    
    # Track 3: Ambient Mood (20s)
    ffmpeg -y -f lavfi -i "anoisesrc=d=20:c=white:r=44100,volume=0.15,lowpass=f=500" \
      -f lavfi -i "sine=frequency=220:duration=20,volume=0.1" \
      -filter_complex "[0:a][1:a]amix=inputs=2,afade=t=in:ss=0:d=2,afade=t=out:st=18:d=2[out]" -map "[out]" \
      -t 20 -c:a libmp3lame -q:a 4 track03_ambient_mood.mp3 2>/dev/null && \
      echo "✅ Created track03_ambient_mood.mp3"
    
    # Track 4: Energetic (20s)
    ffmpeg -y -f lavfi -i "anoisesrc=d=20:c=pink:r=44100,volume=0.25,bandpass=f=800:w=200" \
      -f lavfi -i "sine=frequency=523:duration=20,volume=0.1" \
      -filter_complex "[0:a][1:a]amix=inputs=2[out]" -map "[out]" \
      -t 20 -c:a libmp3lame -q:a 4 track04_energetic.mp3 2>/dev/null && \
      echo "✅ Created track04_energetic.mp3"
    
    # Track 5: Chill Wave (20s)
    ffmpeg -y -f lavfi -i "anoisesrc=d=20:c=brown:r=44100,volume=0.2,lowpass=f=1000" \
      -f lavfi -i "sine=frequency=392:duration=20,volume=0.12" \
      -filter_complex "[0:a][1:a]amix=inputs=2,atremolo=f=0.5:d=0.5[out]" -map "[out]" \
      -t 20 -c:a libmp3lame -q:a 4 track05_chill_wave.mp3 2>/dev/null && \
      echo "✅ Created track05_chill_wave.mp3"
    
    echo ""
    echo "⚠️  These are placeholder tracks (synthetic sounds)."
    echo "   Replace with real royalty-free tracks from:"
    echo "   - https://pixabay.com/music/search/tiktok/"
    echo "   - https://uppbeat.io/"
    echo "   - https://www.chosic.com/free-music/all/"
else
    echo "⚠️  FFmpeg not found - cannot create sample tracks"
    echo ""
    echo "To add background music:"
    echo "1. Visit https://pixabay.com/music/search/tiktok/"
    echo "2. Download 5 upbeat, trendy tracks"
    echo "3. Rename them: track01_*.mp3, track02_*.mp3, etc."
    echo "4. Place in this folder"
fi

echo ""
echo "📁 Current music folder contents:"
ls -la *.mp3 2>/dev/null || echo "   (no MP3 files yet)"
echo ""
echo "📖 See README.md for download instructions"
