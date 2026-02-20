# Failure Modes Documentation

Reference guide for @dailydealfeed pipeline failures, root causes, and recovery procedures.

---

## 1. FFmpeg Failures

### 1.1 FFmpeg Not Found
**Symptoms:** `spawn ffmpeg ENOENT` or `ffmpeg: command not found`

**Root Cause:** FFmpeg not installed or not in PATH.

**Recovery:**
```bash
# Check installation
which ffmpeg
ffmpeg -version

# Install if missing (Ubuntu/Debian)
apt-get update && apt-get install -y ffmpeg
```

**Prevention:** Include ffmpeg check in startup/healthcheck.

---

### 1.2 FFmpeg Timeout
**Symptoms:** Process killed after 5 minutes, `ETIMEDOUT` or `SIGTERM`

**Root Cause:** 
- Video processing taking too long
- Complex filters on underpowered hardware
- Large input files

**Recovery:**
1. Check logs for the stuck item
2. Reset item to pending: `node queue-manager.js --recover-stuck`
3. Item will retry with exponential backoff

**Prevention:**
- Set reasonable timeouts (5 min default)
- Pre-validate clip duration/resolution
- Use hardware acceleration when available

---

### 1.3 FFmpeg Invalid Input
**Symptoms:** `Invalid data found when processing input`, exit code 1

**Root Cause:**
- Corrupt video file
- Unsupported codec
- Incomplete download

**Recovery:**
1. Re-download/re-process the clip
2. Validate with: `ffprobe <file>`
3. Convert to standard format: `ffmpeg -i input.mp4 -c:v libx264 output.mp4`

**Prevention:** QA clips before adding to manifest.

---

## 2. Queue Processing Failures

### 2.1 Stuck Items (In-Progress > 5 min)
**Symptoms:** Item shows `in-progress` but no output produced

**Root Cause:**
- Process crash without cleanup
- Network timeout during download
- System resource exhaustion

**Recovery:**
```bash
# Automatic recovery
node queue-manager.js --recover-stuck

# Or with healthcheck
node scripts/healthcheck.js --fix
```

**Prevention:** 
- Heartbeat monitoring
- Automatic stuck detection (built into queue-manager)
- Retry logic with backoff

---

### 2.2 Queue Corruption
**Symptoms:** `SyntaxError: Unexpected token`, empty queue

**Root Cause:**
- Process killed during write
- Disk full
- Concurrent writes

**Recovery:**
1. Check for backup: `queue.json.bak`
2. Rebuild queue: `node queue-manager.js --build-queue`

**Prevention:**
- Atomic writes (write to temp, then rename)
- Disk space monitoring
- File locking for concurrent access

---

### 2.3 All Items Failed
**Symptoms:** Queue shows 100% failed status

**Root Cause:** Systemic issue (missing dependency, config error)

**Recovery:**
1. Run healthcheck: `node scripts/healthcheck.js --verbose`
2. Fix underlying issue
3. Reset failed items: manually set status to `pending` in queue.json
4. Re-run: `node queue-manager.js --generate-all`

**Prevention:** Validate system state before batch runs.

---

## 3. Asset Failures

### 3.1 Product Image Download Failed
**Symptoms:** `Failed to download product image`, blank overlay

**Root Cause:**
- Amazon rate limiting (429)
- Image URL expired
- Network issues

**Recovery:**
1. Wait 5-10 minutes for rate limit
2. Refresh product URLs
3. Retry with backoff

**Prevention:**
- Cache images locally
- Implement exponential backoff
- Pre-download images during staging

---

### 3.2 Clip File Missing
**Symptoms:** `ENOENT: no such file or directory`

**Root Cause:**
- Clip path in manifest doesn't exist
- Clips deleted or moved
- Relative path resolution issue

**Recovery:**
1. Verify clip exists: `ls -la staging/clips/`
2. Update manifest with correct paths
3. Re-download missing clips

**Prevention:**
- Validate paths during manifest build
- Use absolute paths or consistent working directory

---

### 3.3 Font/Asset Missing
**Symptoms:** `Font file not found`, missing text overlays

**Root Cause:** Required fonts not installed

**Recovery:**
```bash
# Install common fonts
apt-get install -y fonts-liberation fonts-dejavu
fc-cache -fv
```

**Prevention:** Bundle fonts with project or check at startup.

---

## 4. TTS/Audio Failures

### 4.1 TTS API Failure
**Symptoms:** No voiceover, `TTS generation failed`

**Root Cause:**
- API rate limit
- Invalid API key
- Network timeout

**Recovery:**
1. Check API credentials in `.env`
2. Verify API quota/limits
3. Retry after cooldown

**Prevention:**
- Cache TTS audio
- Implement retry with backoff
- Monitor API usage

---

### 4.2 Audio Sync Issues
**Symptoms:** Voice doesn't match video timing

**Root Cause:**
- TTS duration longer than clip
- Incorrect audio offset

**Recovery:**
1. Regenerate with shorter script
2. Adjust timing parameters
3. Use speed adjustment in FFmpeg

**Prevention:**
- Estimate TTS duration before generation
- Build buffer time into clips

---

## 5. QA Failures

### 5.1 Duration Too Short/Long
**Symptoms:** QA rejects video for duration

**Root Cause:** 
- Clip trimming error
- Missing segments

**Recovery:** Regenerate video, verify input clip duration.

**Prevention:** Pre-validate clip lengths.

---

### 5.2 Bitrate Too Low
**Symptoms:** `Bitrate below threshold`

**Root Cause:**
- Aggressive compression
- Low-quality source

**Recovery:** 
- Use higher quality source
- Adjust FFmpeg encoding params

**Prevention:** Source high-quality clips (720p+).

---

### 5.3 Silent Audio
**Symptoms:** `Audio silent or missing`

**Root Cause:**
- TTS failed silently
- Audio stream not merged
- Volume too low

**Recovery:**
1. Check TTS cache
2. Verify audio stream: `ffprobe -show_streams video.mp4`
3. Regenerate with audio

**Prevention:** Validate audio presence in QA.

---

## 6. System Failures

### 6.1 Disk Full
**Symptoms:** `ENOSPC: no space left on device`

**Root Cause:** Output videos filling disk

**Recovery:**
1. Clear old videos: `rm -rf output/rejected/*`
2. Archive completed videos
3. Expand disk

**Prevention:**
- Monitor disk space (healthcheck)
- Automatic cleanup of old files
- Set disk alerts at 80%

---

### 6.2 Memory Exhaustion
**Symptoms:** `JavaScript heap out of memory`, process killed

**Root Cause:**
- Processing too many items concurrently
- Memory leak in long-running process

**Recovery:**
1. Restart process
2. Process items one at a time
3. Increase Node memory: `NODE_OPTIONS=--max-old-space-size=4096`

**Prevention:**
- Sequential processing (not parallel)
- Periodic process restart for long runs
- Monitor memory usage

---

### 6.3 Network Timeout
**Symptoms:** `ETIMEDOUT`, `ECONNRESET`

**Root Cause:**
- Unstable connection
- CDN/API unreachable
- DNS issues

**Recovery:**
1. Verify network: `ping google.com`
2. Retry failed items
3. Check firewall/proxy settings

**Prevention:**
- Retry with exponential backoff
- Timeout handling
- Cache remote assets locally

---

## Quick Reference: Recovery Commands

| Issue | Command |
|-------|---------|
| Health check | `node scripts/healthcheck.js --verbose` |
| Fix stuck items | `node scripts/healthcheck.js --fix` |
| Recover stuck (queue) | `node queue-manager.js --recover-stuck` |
| Rebuild queue | `node queue-manager.js --build-queue` |
| Generate with retry | `node queue-manager.js --generate-all --retry` |
| Check queue status | `node queue-manager.js --status` |

---

## Monitoring Checklist

For unattended night runs, verify before starting:

- [ ] `node scripts/healthcheck.js` passes all checks
- [ ] Disk space > 1GB free
- [ ] All clips exist and are valid
- [ ] API keys configured (TTS, etc.)
- [ ] No stuck items in queue

---

*Last updated: 2026-02-20*
