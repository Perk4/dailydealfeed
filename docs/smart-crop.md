# Smart Crop for TikTok/Reels

Converts 16:9 landscape videos to 9:16 portrait while keeping the subject in frame.

## Installation

```bash
# Requires FFmpeg
apt-get install -y ffmpeg

# Script location
/root/dailydealfeed/scripts/smart-crop.js
```

## Usage

```bash
# Basic usage - outputs to inputfile_portrait.mp4
node smart-crop.js video.mp4

# Custom output path
node smart-crop.js video.mp4 output.mp4

# Higher quality (lower CRF = better quality, larger file)
node smart-crop.js video.mp4 --quality 18

# Skip analysis, use simple center crop
node smart-crop.js video.mp4 --fallback center

# Show verbose progress
node smart-crop.js video.mp4 -v
```

## How It Works

### 1. Video Analysis
- Samples video every 2 seconds
- Uses FFmpeg's `cropdetect` filter to find where content edges are
- Identifies the center of interesting content in each segment

### 2. Position Smoothing
- Smooths crop position over 3-segment windows
- Prevents jarring jumps between positions
- Falls back to center if no significant variation detected

### 3. Crop & Scale
- Calculates crop width: `height * 9/16` (portrait aspect)
- Applies horizontal crop at detected position
- Scales to 1080x1920 for TikTok/Reels

## Output Specs

| Property | Value |
|----------|-------|
| Resolution | 1080x1920 |
| Aspect Ratio | 9:16 |
| Codec | H.264 (libx264) |
| Audio | AAC 128kbps |
| Default Quality | CRF 23 |

## API Usage

```javascript
const { smartCrop, centerCrop, getVideoInfo } = require('./scripts/smart-crop.js');

// Smart crop with motion analysis
const result = await smartCrop('input.mp4', 'output.mp4', {
  verbose: true,
  quality: 20
});

// Simple center crop (faster, no analysis)
const result2 = await centerCrop('input.mp4', 'output.mp4');

// Get video info
const info = getVideoInfo('video.mp4');
// { width: 1920, height: 1080, duration: 30, fps: 30, codec: 'h264' }
```

## What Works

✅ **Center-weighted detection**: When content is spread across frame, crops from center
✅ **Content edge detection**: Uses `cropdetect` to find where actual content is
✅ **Smooth transitions**: Averages position over time to avoid jarring cuts
✅ **Fallback mode**: `--fallback center` for reliable center crop
✅ **Portrait handling**: Videos already portrait get padded, not cropped

## What Doesn't Work (Limitations)

❌ **Dynamic following**: Can't smoothly pan across frame during playback (FFmpeg limitation)
❌ **Face detection**: Would need OpenCV integration (future enhancement)
❌ **Very dark videos**: `cropdetect` struggles with low contrast
❌ **Multiple subjects**: Always picks single center point, can't track individuals

## Future Improvements

1. **Face detection**: Integrate OpenCV for face-based centering
2. **Person detection**: Use ML models to find humans in frame
3. **Dynamic panning**: Generate keyframes and use `zoompan` filter
4. **Saliency maps**: Use ML-based attention prediction

## Troubleshooting

### "cropdetect failed"
Video may be too dark or uniform. Try `--fallback center`.

### Output looks stretched
Input video may have unusual aspect ratio. Check with:
```bash
ffprobe -v error -show_entries stream=width,height,sample_aspect_ratio input.mp4
```

### Encoding too slow
Use faster preset by editing `CONFIG.preset` in script:
- `ultrafast`: Fastest, larger files
- `medium`: Default balance
- `slow`: Better quality, slower

## Test Videos

Test clips are in `/root/dailydealfeed/test-clips/`:
- `test-landscape.mp4` - Static 16:9 test
- `test-motion.mp4` - Moving elements test
- `*_portrait.mp4` - Output files
