# Issues Queue

> Pipeline issues identified and tracked for @dailydealfeed

## Active Issues

| ID | Issue | Priority | Status | Agent | Evidence |
|----|-------|----------|--------|-------|----------|
| 2 | CRF 18 Insufficient for 1 Mbps | 🔴 Critical | Agent Spawned | fix-video-minrate | 40% pass rate post-CRF18-fix |

## Format for New Issues
```
### ISSUE-[NUMBER]: [TITLE]
**Identified:** [date]
**Priority:** 🔴 Critical | 🟡 High | 🟢 Medium
**Component:** Video | Embed | Recording | QA | Pipeline

**Problem:**
[Description of the issue]

**Evidence:**
[How we know this is a problem - logs, metrics, failed outputs]

**Root Cause:**
[Why this is happening]

**Proposed Fix:**
[What we think will solve it]

**Status:** 
- [ ] Identified
- [ ] Agent Spawned
- [ ] Fix Implemented
- [ ] Verified Working
- [ ] Closed

**Resolution:**
[What actually fixed it + evidence it's fixed]
```

---

## Issue History

### ISSUE-1: Video Bitrate Marginal - 59% Rejection Rate
**Identified:** 2026-02-17 07:57 UTC
**Priority:** 🔴 Critical
**Component:** Video

**Problem:**
Videos being generated with CRF 23 produce marginal bitrates around 0.9-1.1 Mbps. The QA threshold is 1 Mbps, causing 59% of videos to fail (44 rejected, 30 approved).

**Evidence:**
- Approved video: 1.11 Mbps (video_11_1771314779962.mp4)
- Rejected video: 0.90 Mbps (video_9_1771282492403.mp4)
- x264 options in videos confirm `crf=23.0`
- 44 rejected / 74 total = 59% rejection rate

**Root Cause:**
CRF 23 is too high (lower quality) for consistent bitrate above 1 Mbps threshold.

**Proposed Fix:**
Lower CRF from 23 to 18 in smart-crop-v2.js and any other encoding configs to ensure bitrates consistently above 1.5 Mbps.

**Status:** 
- [x] Identified
- [x] Agent Spawned (fix-video-bitrate @ 2026-02-17 07:57 UTC)
- [x] Fix Implemented (commit a3f9a85 @ 2026-02-17 08:01 UTC)
- [x] Verified - FAILED
- [ ] Closed

**Resolution:**
CRF 18 insufficient. Post-fix: 2 approved, 3 rejected (40% pass rate).
Video bitrates still marginal (759-912 kbps). Need more aggressive fix.
→ Escalated to ISSUE-2

---

### ISSUE-2: CRF 18 Insufficient for 1 Mbps Target
**Identified:** 2026-02-17 08:57 UTC
**Priority:** 🔴 Critical
**Component:** Video

**Problem:**
CRF 18 produces video stream bitrates of 759-912 kbps. With ~200kbps audio, total format bitrate is 936-1109 kbps. QA threshold is 1 Mbps. This creates a coin-flip situation where ~40% of videos fail.

**Evidence:**
```
rejected - video_5: video=759kbps format=960kbps (FAIL)
approved - video_4: video=904kbps format=1107kbps (PASS)
rejected - video_3: video=833kbps format=936kbps (FAIL)
approved - video_2: video=867kbps format=1069kbps (PASS)
```

**Root Cause:**
CRF encoding is content-adaptive. Different product recordings compress differently. CRF 18 is too conservative for consistent 1 Mbps output.

**Proposed Fix:**
Use ffmpeg's `-minrate 1.5M -maxrate 3M -bufsize 3M` with CRF to set a bitrate floor. This ensures minimum quality while still allowing CRF to optimize.

**Status:** 
- [x] Identified
- [x] Agent Spawned (fix-video-minrate @ 2026-02-17 08:57 UTC)
- [ ] Fix Implemented
- [ ] Verified Working
- [ ] Closed

**Resolution:**
*Pending*

