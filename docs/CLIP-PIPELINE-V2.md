# Clip Pipeline V2 — AFV-Style Viral Moments

## Problem
Stock clips and Giphy GIFs don't stop the scroll. They feel generic and produced.

## Solution
Source REAL viral moments from America's Funniest Home Videos style compilations:
1. Download full compilations via yt-dlp
2. Split into individual moments
3. Smart crop 16:9 → 9:16 (follow the subject)
4. Cut RIGHT BEFORE the action (cliffhanger effect)

## Pipeline Steps

### Step 1: Download via yt-dlp
```bash
yt-dlp -f 'bestvideo[height<=720]+bestaudio/best' \
  --merge-output-format mp4 \
  -o 'clips/raw/%(title).50s_%(id)s.%(ext)s' \
  "VIDEO_URL"
```

### Step 2: Timestamp best moments
Manually identify 2-4 second segments that:
- Have genuine reactions
- End right before the payoff
- Feel like real home videos

### Step 3: Smart 16:9 → 9:16 Crop
Follow the subject/action, don't just center crop.

### Step 4: Cliffhanger Cut
End 0.5s BEFORE the impact moment.
Viewer's brain fills in the rest → engagement.

## Quality Criteria
- [ ] Feels like a real home video
- [ ] 2-4 seconds duration
- [ ] Ends BEFORE the payoff
- [ ] Subject stays in frame after crop
- [ ] Makes viewer want to keep watching
