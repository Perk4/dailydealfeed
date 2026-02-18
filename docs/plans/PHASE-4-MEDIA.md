# Phase 4: Media Processing Pipeline

_Cloudflare Migration — R2 Video Storage & Queue-Driven Processing_

## Overview

Phase 4 implements a complete video processing pipeline using Cloudflare Workers, R2, and Queues. This system handles video uploads, metadata extraction, QA validation, and CDN delivery.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      MEDIA PROCESSING PIPELINE                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────┐    ┌───────────────┐    ┌──────────────────────┐  │
│  │ Client  │───▶│ media-worker  │───▶│ dailydeal-media (R2) │  │
│  └─────────┘    └───────────────┘    └──────────────────────┘  │
│       │                │                        │               │
│       │                ▼                        │               │
│       │         ┌─────────────┐                │               │
│       │         │ MEDIA_KV    │◀───────────────┘               │
│       │         │ (state)     │                                 │
│       │         └─────────────┘                                 │
│       │                │                                        │
│       │                ▼                                        │
│       │    ┌────────────────────────┐                          │
│       │    │ migration-stage-queue  │                          │
│       │    └────────────────────────┘                          │
│       │                │                                        │
│       │                ▼                                        │
│       │    ┌────────────────────────────────────────┐          │
│       │    │           QUEUE PIPELINE               │          │
│       │    │  ┌─────────────────────────────────┐   │          │
│       │    │  │ video_uploaded                  │   │          │
│       │    │  │     ↓                           │   │          │
│       │    │  │ metadata_extract (via FFmpeg)   │   │          │
│       │    │  │     ↓                           │   │          │
│       │    │  │ qa_validate                     │   │          │
│       │    │  │     ↓                           │   │          │
│       │    │  │ qa_complete → [transcode?]      │   │          │
│       │    │  │     ↓                           │   │          │
│       │    │  │ cdn_purge                       │   │          │
│       │    │  └─────────────────────────────────┘   │          │
│       │    └────────────────────────────────────────┘          │
│       │                                                         │
│       │    ┌──────────────────────────────────┐                │
│       └───▶│ Local FFmpeg Service (optional)  │                │
│            │ - ffprobe for metadata           │                │
│            │ - ffmpeg for transcoding         │                │
│            └──────────────────────────────────┘                │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Upload Worker (`media-processor`)

**Endpoints:**

| Method | Path | Description |
|--------|------|-------------|
| POST | `/upload/init` | Initialize upload, get pre-signed URL(s) |
| PUT | `/upload/{id}/file` | Direct file upload (simple) |
| PUT | `/upload/{id}/part/{n}` | Multipart part upload |
| POST | `/upload/{id}/complete` | Complete multipart upload |
| GET | `/upload/{id}` | Get upload status |
| GET | `/media/{key}` | Serve media with CDN headers |
| GET | `/health` | Health check |

**Upload Flow:**

```
1. Client → POST /upload/init
   {
     "filename": "product-video.mp4",
     "contentType": "video/mp4",
     "size": 52428800,
     "metadata": { "productId": "abc123" }
   }

2. Server → Response
   {
     "uploadId": "upload_abc123",
     "uploadUrl": "/upload/abc123/file",  // For simple upload
     // OR for large files:
     "multipartUploadId": "xyz789",
     "partUrls": [
       { "partNumber": 1, "url": "/upload/abc123/part/1" },
       ...
     ],
     "expiresAt": 1708200000000
   }

3. Client → PUT /upload/{id}/file (or parts)

4. Server → Queues processing → QA validation → Complete
```

### 2. Queue Consumer

**Message Types:**

| Type | Source | Action |
|------|--------|--------|
| `video_uploaded` | Upload worker | Trigger metadata extraction |
| `metadata_extract` | FFmpeg callback | Parse FFprobe, queue QA |
| `qa_validate` | Pipeline | Run validation checks |
| `qa_complete` | QA stage | Mark complete or failed |
| `transcode_request` | QA (if needed) | Delegate to FFmpeg |
| `transcode_complete` | FFmpeg callback | Update metadata |
| `cdn_purge` | Transcode | Purge CDN cache |

### 3. QA Validation Module

**Validation Checks:**

| Check | Criteria | Action on Fail |
|-------|----------|----------------|
| `bitrate_max` | ≤ 20,000 kbps | Flag for transcoding |
| `bitrate_min` | ≥ 500 kbps | Warning |
| `resolution_min` | ≥ 480x360 | Warning |
| `resolution_max` | ≤ 4096x2160 | Flag for transcoding |
| `aspect_ratio` | Standard ratios | Warning |
| `duration_min` | ≥ 1 second | Fail |
| `duration_max` | ≤ 600 seconds | Fail |
| `codec_supported` | H.264/H.265/VP9/AV1 | Flag for transcoding |
| `framerate_range` | 24-60 fps | Warning |

### 4. CDN Cache Rules

```javascript
const CDN_CACHE_RULES = {
  'videos/':     { ttl: 86400,    cacheControl: 'public, max-age=3600, s-maxage=86400' },
  'processed/':  { ttl: 31536000, cacheControl: 'public, max-age=31536000, immutable' },
  'thumbnails/': { ttl: 2592000,  cacheControl: 'public, max-age=604800, s-maxage=2592000' },
};
```

## Workers ↔ Local FFmpeg Coordination

The media worker is designed to work with an optional local FFmpeg service for metadata extraction and transcoding. This pattern allows:

1. **Workers handle orchestration** - All state management, queue coordination, and API responses
2. **Local service handles heavy lifting** - FFprobe for metadata, FFmpeg for transcoding
3. **Webhook callbacks** - FFmpeg service calls back to worker endpoints when complete

### FFmpeg Service Contract

**Metadata Request:**
```json
{
  "action": "probe",
  "uploadId": "upload_abc123",
  "key": "videos/2026/02/18/upload_abc123.mp4",
  "bucket": "dailydeal-media",
  "callbackUrl": "https://media-processor.workers.dev/callback/metadata"
}
```

**Metadata Callback:**
```json
{
  "uploadId": "upload_abc123",
  "key": "videos/2026/02/18/upload_abc123.mp4",
  "ffprobeResult": {
    "format": { "duration": 120.5, "size": 52428800, "bit_rate": 3470000 },
    "streams": [
      { "codec_type": "video", "codec_name": "h264", "width": 1920, "height": 1080 },
      { "codec_type": "audio", "codec_name": "aac", "channels": 2 }
    ]
  }
}
```

**Transcode Request:**
```json
{
  "action": "transcode",
  "uploadId": "upload_abc123",
  "key": "videos/2026/02/18/upload_abc123.mp4",
  "bucket": "dailydeal-media",
  "outputFormat": "mp4",
  "preset": "web_optimized",
  "callbackUrl": "https://media-processor.workers.dev/callback/transcode"
}
```

## R2 Storage Structure

```
dailydeal-media/
├── videos/
│   └── YYYY/MM/DD/
│       └── upload_xxx.mp4       # Original uploads
├── processed/
│   └── YYYY/MM/DD/
│       └── upload_xxx_1080p.mp4 # Transcoded versions
└── thumbnails/
    └── YYYY/MM/DD/
        └── upload_xxx_thumb.jpg # Generated thumbnails
```

## KV State Management

**Keys:**
- `upload:{uploadId}` - Upload state (TTL: 24h during processing)
- `qa:{uploadId}` - QA report (TTL: 7 days)
- `upload:{uploadId}:part:{n}` - Multipart part info (TTL: 24h)

## Configuration

**Environment Variables:**

| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_FILE_SIZE_MB` | 500 | Maximum upload size |
| `PRESIGNED_URL_EXPIRY_SECS` | 3600 | URL expiration |
| `MULTIPART_CHUNK_SIZE_MB` | 100 | Chunk size trigger |
| `SUPPORTED_FORMATS` | mp4,mov,webm,avi,mkv | Allowed extensions |
| `MAX_BITRATE_KBPS` | 20000 | QA bitrate max |
| `MIN_BITRATE_KBPS` | 500 | QA bitrate min |
| `QA_WEBHOOK_ENABLED` | true | Send QA reports |
| `QA_WEBHOOK_URL` | - | Webhook destination |
| `FFMPEG_WEBHOOK_URL` | - | Local FFmpeg service |

## Deployment

```bash
# Create KV namespace
wrangler kv namespace create MEDIA_KV
# Update wrangler.toml with returned ID

# Deploy to staging
cd src/media-worker
npm install
wrangler deploy --env staging

# Verify
curl https://media-processor-staging.workers.dev/health

# Deploy to production
wrangler deploy --env production
```

## Verification Commands

```bash
# List R2 buckets
wrangler r2 bucket list

# Check queue
wrangler queues list

# Test upload init
curl -X POST https://media-processor.workers.dev/upload/init \
  -H "Content-Type: application/json" \
  -d '{"filename":"test.mp4","contentType":"video/mp4","size":1024}'

# Check upload status
curl https://media-processor.workers.dev/upload/{uploadId}
```

## Phase 5 Handoff

Phase 5 (Steering Controller) can integrate with media pipeline via:

1. **Upload trigger** - Initiate video uploads via Discord commands
2. **QA webhook** - Receive QA reports for approval workflow
3. **Status queries** - Check upload/processing status
4. **KV state** - Read upload states for dashboard

## Files Created

```
src/media-worker/
├── wrangler.toml       # Worker configuration
├── package.json        # Dependencies
├── tsconfig.json       # TypeScript config
└── src/
    ├── index.ts        # Main entry, HTTP router
    ├── types.ts        # TypeScript types
    ├── upload.ts       # Upload handling
    ├── queue.ts        # Queue consumer
    └── qa.ts           # QA validation
```

## Status

✅ **Complete** - Ready for deployment and Phase 5 integration
