# Clip Ingestion Pipeline

The clip ingestion pipeline automates downloading, processing, and organizing video clips for DailyDealFeed reels.

## Quick Start

```bash
# Ingest a single clip
node scripts/ingest-clips.js --url "https://youtube.com/shorts/abc123"

# Check library stats
node scripts/ingest-clips.js --list

# Batch ingest from file
node scripts/ingest-clips.js --batch urls.txt
```

## Features

### 1. Download from Multiple Sources
- **YouTube Shorts** - High quality vertical videos
- **TikTok** - Viral clips with trending content
- Uses `yt-dlp` for reliable downloads

### 2. Auto-Segmentation
- Long videos (>10s) are automatically split into ~6s segments
- Each segment is validated independently
- Invalid segments are moved to `clips/rejected/`

### 3. Quality Filtering
Every clip is validated for:
- **Resolution** - Minimum 720p
- **Aspect Ratio** - 9:16 portrait format (±10%)
- **Duration** - 3-10 seconds
- **Audio** - Must have audio track

Quality score (0-10) is calculated and stored.

### 4. Cliffhanger Detection
Automatically finds "impact moments" using:
- **Audio peaks** - Loud moments (laughs, crashes, reactions)
- **Scene changes** - Visual transitions

Clips are trimmed 0.5s before impact for maximum engagement.

### 5. Auto Vibe Tagging
Each clip is automatically tagged with a vibe:
- `funny` - Laugh tracks, comedy, memes
- `fail` - Crashes, falls, fails
- `satisfying` - ASMR, smooth, perfect moments
- `wholesome` - Cute, sweet, heartwarming
- `shocking` - Unexpected, surprising, WTF moments

Tagging uses:
- Keyword analysis (title, URL)
- Audio pattern analysis
- Duration heuristics

### 6. Unified Library
All clips are stored in a single `clips/library.json`:
```json
{
  "version": "1.0",
  "updated_at": "2026-02-16T00:15:00Z",
  "clips": [
    {
      "id": "clip_you_abc123",
      "file": "clips/processed/abc123.mp4",
      "source": "youtube_shorts",
      "source_url": "https://...",
      "vibe": "funny",
      "duration": 5.2,
      "resolution": "1080x1920",
      "has_audio": true,
      "cliffhanger_applied": true,
      "quality_score": 8.5,
      "ingested_at": "2026-02-16T00:15:00Z"
    }
  ]
}
```

## CLI Reference

### Basic Commands

```bash
# Single URL ingestion
node scripts/ingest-clips.js --url "URL"
node scripts/ingest-clips.js -u "URL"

# Batch ingestion from file
node scripts/ingest-clips.js --batch urls.txt
node scripts/ingest-clips.js -b urls.txt

# Show library statistics
node scripts/ingest-clips.js --list
node scripts/ingest-clips.js -l

# Migrate legacy manifests to unified library
node scripts/ingest-clips.js --migrate
```

### Options

| Flag | Short | Description |
|------|-------|-------------|
| `--url <URL>` | `-u` | YouTube Shorts or TikTok URL to ingest |
| `--batch <file>` | `-b` | File with URLs (one per line) |
| `--vibe <type>` | `-v` | Manual vibe override (funny/fail/satisfying/wholesome/shocking) |
| `--dry-run` | `-n` | Preview only, don't download |
| `--force` | `-f` | Re-ingest even if already in library |
| `--list` | `-l` | Show library statistics |
| `--migrate` | | Migrate legacy manifests |
| `--help` | `-h` | Show help |

### Testing Commands

```bash
# Test quality validation on existing file
node scripts/ingest-clips.js --file clip.mp4 --test-validate

# Test cliffhanger detection
node scripts/ingest-clips.js --file clip.mp4 --test-cliffhanger

# Test auto vibe tagging
node scripts/ingest-clips.js --file clip.mp4 --test-vibe
```

## Batch File Format

Create a text file with one URL per line:

```text
# comments start with #
https://youtube.com/shorts/abc123
https://youtube.com/shorts/def456
https://tiktok.com/@user/video/123
```

Run with:
```bash
node scripts/ingest-clips.js --batch urls.txt --vibe funny
```

## Directory Structure

```
clips/
├── library.json          # Unified clip library (primary)
├── raw/                   # Downloaded originals
├── processed/             # Validated, cliffhanger-cut clips
├── rejected/              # Failed validation
├── shorts/                # Legacy YouTube Shorts
├── cache/                 # Curated clip downloads
├── curated.json           # Legacy: Stock footage clips
├── shorts-manifest.json   # Legacy: YouTube Shorts
├── processed-manifest.json # Legacy: AFV clips
└── viral-handpicked.json  # Legacy: Curated viral clips
```

## Integration with scout.js

The scout agent automatically uses the unified library:

```javascript
const { loadUnifiedLibrary } = require('./scout');

// Scout prioritizes clips:
// 1. Unified library (cliffhanger clips)
// 2. AFV clips (pre-cut fails)
// 3. YouTube Shorts
// 4. Curated stock clips
```

Scout matches product vibes to clip vibes:
- Product `shocked` → Clip `shocking`, `fail`
- Product `reveal` → Clip `shocking`
- Product `reaction` → Clip `funny`
- Product `cozy` → Clip `wholesome`

## Integration with editor.js

The editor uses local clip paths from the library:

```javascript
const result = scout(productId);
const clipPath = result.clip_local_path;  // Ready for ffmpeg
```

## Pipeline Flow

```
URL Input
    ↓
📥 Download (yt-dlp)
    ↓
📊 Extract Metadata (ffprobe)
    ↓
✂️  Segment if >10s (ffmpeg)
    ↓
🔍 Quality Validation
    ↓ (pass)           ↓ (fail)
🎬 Cliffhanger      ❌ Reject
    ↓
🏷️  Auto Vibe Tag
    ↓
✅ Add to library.json
```

## Maintenance

### Migrate Legacy Clips
If you have clips in old manifests, run:
```bash
node scripts/ingest-clips.js --migrate
```

### Check Library Health
```bash
node scripts/ingest-clips.js --list
```

### Re-process Existing Clips
```bash
# Re-ingest with force flag
node scripts/ingest-clips.js --url "URL" --force
```

### Clear Rejected Clips
```bash
rm -rf clips/rejected/*
```

## Troubleshooting

### "yt-dlp not found"
```bash
# Install yt-dlp
pip install yt-dlp
# Or download binary
curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o yt-dlp
chmod +x yt-dlp
```

### "ffprobe failed"
```bash
# Install ffmpeg
apt install ffmpeg
```

### "No valid segments"
Check rejected folder for details:
```bash
cat clips/rejected/*.rejection.json
```

### Clip already exists
Use `--force` to re-ingest:
```bash
node scripts/ingest-clips.js --url "URL" --force
```

## Best Practices

1. **Batch ingest** when adding multiple clips
2. **Use manual vibe** when auto-detection is wrong: `--vibe funny`
3. **Preview first** with `--dry-run`
4. **Check stats** regularly with `--list`
5. **Keep library lean** - remove unused clips
