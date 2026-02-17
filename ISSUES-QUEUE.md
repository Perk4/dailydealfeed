# Issues Queue

> Pipeline issues identified and tracked for @dailydealfeed

## Active Issues

| ID | Issue | Priority | Status | Agent | Evidence |
|----|-------|----------|--------|-------|----------|
| - | *No active issues* | - | - | - | - |

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
- [ ] Verified Working
- [ ] Closed

**Resolution:**
*Pending*

