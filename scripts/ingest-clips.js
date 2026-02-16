#!/usr/bin/env node
/**
 * Clip Ingestion Pipeline - Complete v2.0
 * Downloads clips, extracts metadata, segments long videos, validates quality,
 * detects cliffhanger moments, auto-tags vibes, and manages unified library
 * 
 * Usage: 
 *   node scripts/ingest-clips.js --url "https://youtube.com/shorts/xxx"
 *   node scripts/ingest-clips.js --batch urls.txt
 *   node scripts/ingest-clips.js --list
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// Config
const PROJECT_ROOT = path.resolve(__dirname, '..');
const YT_DLP = path.join(PROJECT_ROOT, 'yt-dlp');
const CLIPS_DIR = path.join(PROJECT_ROOT, 'clips');
const RAW_DIR = path.join(CLIPS_DIR, 'raw');
const PROCESSED_DIR = path.join(CLIPS_DIR, 'processed');
const REJECTED_DIR = path.join(CLIPS_DIR, 'rejected');
const LIBRARY_PATH = path.join(CLIPS_DIR, 'library.json');

// Ensure directories exist
[RAW_DIR, PROCESSED_DIR, REJECTED_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// ============================================================================
// PHASE 4: AUTO VIBE TAGGING
// ============================================================================

const VIBE_KEYWORDS = {
  funny: ['laugh', 'comedy', 'meme', 'hilarious', 'lol', 'funny', 'joke', 'prank', 'blooper', 'outtake'],
  fail: ['fail', 'crash', 'fall', 'oops', 'wrong', 'accident', 'mistake', 'epic fail', 'wipeout', 'slip'],
  satisfying: ['satisfying', 'asmr', 'oddly', 'clean', 'perfect', 'smooth', 'soothing', 'relax', 'peaceful'],
  wholesome: ['cute', 'aww', 'sweet', 'heart', 'love', 'adorable', 'precious', 'wholesome', 'heartwarming', 'baby'],
  shocking: ['wait', 'what', 'unexpected', 'plot twist', 'omg', 'shocking', 'surprise', 'unbelievable', 'crazy']
};

// Audio analysis thresholds for vibe detection
const AUDIO_VIBE_HINTS = {
  // High volume spikes with quick drops = fail/shocking
  highVariance: ['fail', 'shocking'],
  // Steady moderate audio = satisfying
  steady: ['satisfying', 'wholesome'],
  // Frequent peaks = funny (laugh track patterns)
  frequentPeaks: ['funny']
};

/**
 * Auto-tag vibe based on metadata, source URL, title, and audio analysis
 * @param {object} metadata - Clip metadata
 * @param {string} sourceUrl - Source URL
 * @param {string} title - Video title
 * @param {string} filePath - Path to video file for audio analysis
 * @returns {object} - { vibe: string, confidence: number, reason: string }
 */
function autoTagVibe(metadata, sourceUrl, title = '', filePath = null) {
  const scores = {
    funny: 0,
    fail: 0,
    satisfying: 0,
    wholesome: 0,
    shocking: 0
  };
  
  const reasons = [];
  const searchText = `${sourceUrl} ${title}`.toLowerCase();
  
  // Check keywords in URL and title
  for (const [vibe, keywords] of Object.entries(VIBE_KEYWORDS)) {
    for (const keyword of keywords) {
      if (searchText.includes(keyword.toLowerCase())) {
        scores[vibe] += 2;
        reasons.push(`keyword "${keyword}" → ${vibe}`);
      }
    }
  }
  
  // Source-based heuristics
  if (sourceUrl.includes('youtube.com/shorts') || sourceUrl.includes('youtu.be')) {
    // YouTube Shorts tend to be funny/fail content
    scores.funny += 0.5;
    scores.fail += 0.3;
  }
  if (sourceUrl.includes('tiktok.com')) {
    // TikTok has more variety
    scores.funny += 0.3;
    scores.satisfying += 0.3;
  }
  
  // Duration-based hints
  if (metadata.duration) {
    if (metadata.duration < 4) {
      // Very short = likely punchline/fail
      scores.fail += 0.5;
      scores.shocking += 0.3;
    } else if (metadata.duration > 8) {
      // Longer = could be satisfying/wholesome
      scores.satisfying += 0.3;
      scores.wholesome += 0.2;
    }
  }
  
  // Audio analysis (if file provided)
  if (filePath && fs.existsSync(filePath)) {
    try {
      const audioHint = analyzeAudioForVibe(filePath);
      if (audioHint) {
        scores[audioHint.vibe] += audioHint.weight;
        reasons.push(`audio pattern → ${audioHint.vibe}`);
      }
    } catch (e) {
      // Audio analysis failed, continue without it
    }
  }
  
  // Find the highest scoring vibe
  let topVibe = 'funny'; // Default
  let topScore = scores.funny;
  
  for (const [vibe, score] of Object.entries(scores)) {
    if (score > topScore) {
      topScore = score;
      topVibe = vibe;
    }
  }
  
  // Calculate confidence (0-1)
  const totalScore = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = totalScore > 0 ? Math.min(1, topScore / Math.max(totalScore, 1)) : 0.5;
  
  return {
    vibe: topVibe,
    confidence: parseFloat(confidence.toFixed(2)),
    reason: reasons.length > 0 ? reasons.join(', ') : 'default heuristics',
    scores: scores
  };
}

/**
 * Analyze audio characteristics for vibe hints
 * @param {string} filePath - Path to video file
 * @returns {object|null} - { vibe: string, weight: number }
 */
function analyzeAudioForVibe(filePath) {
  // Get audio statistics
  const cmd = `ffprobe -v quiet -select_streams a:0 -show_entries stream=codec_name -of default=noprint_wrappers=1:nokey=1 "${filePath}"`;
  
  try {
    const hasAudio = execSync(cmd, { encoding: 'utf-8', timeout: 5000 }).trim();
    if (!hasAudio) {
      return null;
    }
    
    // Analyze volume levels
    const volumeCmd = `ffmpeg -i "${filePath}" -af "volumedetect" -f null - 2>&1`;
    const result = execSync(volumeCmd, { encoding: 'utf-8', timeout: 30000 });
    
    // Parse mean volume and max volume
    const meanMatch = result.match(/mean_volume:\s*([-\d.]+)\s*dB/);
    const maxMatch = result.match(/max_volume:\s*([-\d.]+)\s*dB/);
    
    if (meanMatch && maxMatch) {
      const meanVol = parseFloat(meanMatch[1]);
      const maxVol = parseFloat(maxMatch[1]);
      const variance = Math.abs(maxVol - meanVol);
      
      // High variance (sudden loud moments) = fail/shocking
      if (variance > 15) {
        return { vibe: 'shocking', weight: 0.8 };
      } else if (variance > 10) {
        return { vibe: 'fail', weight: 0.6 };
      } else if (variance < 5 && meanVol > -30) {
        // Consistent audio = satisfying
        return { vibe: 'satisfying', weight: 0.4 };
      }
    }
  } catch (e) {
    // Ignore errors
  }
  
  return null;
}

// ============================================================================
// PHASE 5: UNIFIED LIBRARY
// ============================================================================

/**
 * Generate a unique clip ID
 * @param {string} source - Source type (youtube_shorts, tiktok, afv, etc.)
 * @param {string} sourceId - Original source ID
 * @returns {string} - Unique clip ID
 */
function generateClipId(source, sourceId) {
  const prefix = source.replace('_', '').substring(0, 3);
  const hash = crypto.createHash('md5').update(sourceId).digest('hex').substring(0, 8);
  return `clip_${prefix}_${hash}`;
}

/**
 * Load or initialize the unified library
 * @returns {object} - Library data
 */
function loadLibrary() {
  if (fs.existsSync(LIBRARY_PATH)) {
    try {
      return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8'));
    } catch (e) {
      console.log(`⚠️  Corrupted library.json, creating new one`);
    }
  }
  return {
    version: '1.0',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    clips: []
  };
}

/**
 * Save unified library
 * @param {object} library - Library data
 */
function saveLibrary(library) {
  library.updated_at = new Date().toISOString();
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2));
}

/**
 * Check if a clip already exists in the library
 * @param {object} library - Library data
 * @param {string} sourceUrl - Source URL to check
 * @returns {object|null} - Existing clip or null
 */
function findExistingClip(library, sourceUrl) {
  return library.clips.find(c => c.source_url === sourceUrl);
}

/**
 * Add a clip to the unified library
 * @param {object} clipData - Clip metadata
 * @param {boolean} force - Force overwrite existing
 * @returns {object} - Updated library
 */
function addToLibrary(clipData, force = false) {
  const library = loadLibrary();
  
  // Check for duplicates
  const existing = findExistingClip(library, clipData.source_url);
  if (existing && !force) {
    console.log(`⏭️  Skipping duplicate: ${clipData.source_url}`);
    return { library, added: false, existing };
  }
  
  // Remove existing if forcing
  if (existing && force) {
    library.clips = library.clips.filter(c => c.source_url !== clipData.source_url);
    console.log(`🔄 Replacing existing clip: ${existing.id}`);
  }
  
  // Add new clip
  library.clips.push(clipData);
  saveLibrary(library);
  
  console.log(`✅ Added to library: ${clipData.id}`);
  return { library, added: true };
}

/**
 * Migrate clips from legacy manifests to unified library
 * @returns {object} - Migration stats
 */
function migrateExistingClips() {
  console.log('\n📦 === MIGRATING EXISTING CLIPS ===\n');
  
  const library = loadLibrary();
  const stats = { migrated: 0, skipped: 0, errors: 0 };
  
  // 1. Migrate from shorts-manifest.json
  const shortsManifest = path.join(CLIPS_DIR, 'shorts-manifest.json');
  if (fs.existsSync(shortsManifest)) {
    console.log('📂 Processing shorts-manifest.json...');
    try {
      const shorts = JSON.parse(fs.readFileSync(shortsManifest, 'utf-8'));
      for (const clip of shorts.clips || []) {
        // Check if file exists
        const filePath = path.join(PROJECT_ROOT, clip.file);
        if (!fs.existsSync(filePath)) {
          stats.skipped++;
          continue;
        }
        
        // Check for duplicates
        if (library.clips.find(c => c.id === clip.id)) {
          stats.skipped++;
          continue;
        }
        
        library.clips.push({
          id: clip.id,
          file: clip.file,
          source: clip.source || 'youtube_shorts',
          source_url: clip.source_url || `https://youtube.com/shorts/${clip.id.replace('shorts-', '')}`,
          vibe: clip.vibe || 'funny',
          duration: clip.duration,
          resolution: `${clip.width}x${clip.height}`,
          has_audio: clip.has_audio !== false,
          cliffhanger_applied: false,
          quality_score: 7.0,
          ingested_at: new Date().toISOString()
        });
        stats.migrated++;
      }
      console.log(`   ✅ Migrated ${stats.migrated} clips from shorts-manifest`);
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
      stats.errors++;
    }
  }
  
  // 2. Migrate from viral-handpicked.json
  const viralManifest = path.join(CLIPS_DIR, 'viral-handpicked.json');
  if (fs.existsSync(viralManifest)) {
    console.log('📂 Processing viral-handpicked.json...');
    try {
      const viral = JSON.parse(fs.readFileSync(viralManifest, 'utf-8'));
      let viralCount = 0;
      for (const clip of viral.clips || []) {
        if (library.clips.find(c => c.id === clip.id)) {
          stats.skipped++;
          continue;
        }
        
        library.clips.push({
          id: clip.id,
          file: null, // External URL
          source: clip.source || 'mixkit',
          source_url: clip.url,
          vibe: clip.vibe || 'shocked',
          duration: clip.duration || 3,
          resolution: 'unknown',
          has_audio: true,
          cliffhanger_applied: false,
          quality_score: 6.5,
          description: clip.description,
          ingested_at: new Date().toISOString()
        });
        viralCount++;
        stats.migrated++;
      }
      console.log(`   ✅ Migrated ${viralCount} clips from viral-handpicked`);
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
      stats.errors++;
    }
  }
  
  // 3. Migrate from processed-manifest.json (AFV clips)
  const afvManifest = path.join(CLIPS_DIR, 'processed-manifest.json');
  if (fs.existsSync(afvManifest)) {
    console.log('📂 Processing processed-manifest.json (AFV clips)...');
    try {
      const afv = JSON.parse(fs.readFileSync(afvManifest, 'utf-8'));
      let afvCount = 0;
      for (const clip of afv.clips || []) {
        const filePath = path.join(PROJECT_ROOT, clip.file);
        if (!fs.existsSync(filePath)) {
          stats.skipped++;
          continue;
        }
        
        if (library.clips.find(c => c.id === clip.id)) {
          stats.skipped++;
          continue;
        }
        
        library.clips.push({
          id: clip.id,
          file: clip.file,
          source: 'afv',
          source_url: `afv://${clip.id}`,
          vibe: mapAfvVibe(clip.vibe),
          duration: clip.duration || 3.0,
          resolution: '1080x1920',
          has_audio: true,
          cliffhanger_applied: true,
          quality_score: 8.0,
          description: clip.description,
          ingested_at: new Date().toISOString()
        });
        afvCount++;
        stats.migrated++;
      }
      console.log(`   ✅ Migrated ${afvCount} clips from AFV`);
    } catch (e) {
      console.log(`   ❌ Error: ${e.message}`);
      stats.errors++;
    }
  }
  
  // Save updated library
  saveLibrary(library);
  
  console.log(`\n✨ Migration complete: ${stats.migrated} migrated, ${stats.skipped} skipped, ${stats.errors} errors`);
  return stats;
}

/**
 * Map AFV-specific vibes to standard vibes
 */
function mapAfvVibe(afvVibe) {
  const mapping = {
    'fail': 'fail',
    'kids': 'funny',
    'doorbell': 'shocking',
    'outdoor': 'fail',
    'unexpected': 'shocking',
    'construction': 'fail',
    'ice-slip': 'fail',
    'water': 'funny',
    'indoor': 'funny'
  };
  return mapping[afvVibe] || 'funny';
}

/**
 * Get library statistics
 * @returns {object} - Stats
 */
function getLibraryStats() {
  const library = loadLibrary();
  
  const stats = {
    total: library.clips.length,
    byVibe: {},
    bySource: {},
    withFile: 0,
    withAudio: 0,
    withCliffhanger: 0,
    avgDuration: 0,
    avgQuality: 0
  };
  
  let totalDuration = 0;
  let totalQuality = 0;
  let qualityCount = 0;
  
  for (const clip of library.clips) {
    // By vibe
    stats.byVibe[clip.vibe] = (stats.byVibe[clip.vibe] || 0) + 1;
    
    // By source
    stats.bySource[clip.source] = (stats.bySource[clip.source] || 0) + 1;
    
    // Counts
    if (clip.file) stats.withFile++;
    if (clip.has_audio) stats.withAudio++;
    if (clip.cliffhanger_applied) stats.withCliffhanger++;
    
    // Averages
    if (clip.duration) totalDuration += clip.duration;
    if (clip.quality_score) {
      totalQuality += clip.quality_score;
      qualityCount++;
    }
  }
  
  stats.avgDuration = stats.total > 0 ? (totalDuration / stats.total).toFixed(1) : 0;
  stats.avgQuality = qualityCount > 0 ? (totalQuality / qualityCount).toFixed(1) : 0;
  
  return stats;
}

// ============================================================================
// DOWNLOAD & METADATA (Phase 1)
// ============================================================================

/**
 * Download a clip from URL using yt-dlp
 * @param {string} url - YouTube Shorts or TikTok URL
 * @param {string} outputDir - Directory to save the clip
 * @returns {object} - { id, filePath, title }
 */
function downloadClip(url, outputDir) {
  console.log(`📥 Downloading: ${url}`);
  
  // First get the video ID and info
  const infoCmd = `"${YT_DLP}" --print id --print title --no-warnings "${url}"`;
  let infoResult;
  try {
    infoResult = execSync(infoCmd, { encoding: 'utf-8', timeout: 60000 }).trim().split('\n');
  } catch (err) {
    throw new Error(`Failed to get video info: ${err.message}`);
  }
  
  const videoId = infoResult[0];
  const title = infoResult[1] || 'Untitled';
  
  // Download with best quality
  const outputTemplate = path.join(outputDir, `${videoId}.%(ext)s`);
  const downloadCmd = `"${YT_DLP}" -f "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best" --merge-output-format mp4 -o "${outputTemplate}" "${url}"`;
  
  try {
    execSync(downloadCmd, { encoding: 'utf-8', timeout: 120000, stdio: 'pipe' });
  } catch (err) {
    throw new Error(`Download failed: ${err.message}`);
  }
  
  // Find the downloaded file
  const files = fs.readdirSync(outputDir).filter(f => f.startsWith(videoId));
  if (files.length === 0) {
    throw new Error(`No file found for video ID: ${videoId}`);
  }
  
  const filePath = path.join(outputDir, files[0]);
  console.log(`   ✅ Downloaded: ${path.basename(filePath)}`);
  
  return { id: videoId, filePath, title };
}

/**
 * Get video metadata using ffprobe
 * @param {string} filePath - Path to video file
 * @returns {object} - { duration, width, height, hasAudio, codec }
 */
function getMetadata(filePath) {
  const cmd = `ffprobe -v quiet -print_format json -show_format -show_streams "${filePath}"`;
  
  let result;
  try {
    result = execSync(cmd, { encoding: 'utf-8' });
  } catch (err) {
    throw new Error(`ffprobe failed: ${err.message}`);
  }
  
  const data = JSON.parse(result);
  const videoStream = data.streams.find(s => s.codec_type === 'video');
  const audioStream = data.streams.find(s => s.codec_type === 'audio');
  
  const metadata = {
    duration: parseFloat(data.format.duration) || 0,
    width: videoStream ? videoStream.width : 0,
    height: videoStream ? videoStream.height : 0,
    hasAudio: !!audioStream,
    codec: videoStream ? videoStream.codec_name : 'unknown',
    bitrate: parseInt(data.format.bit_rate) || 0,
    fileSize: parseInt(data.format.size) || 0
  };
  
  return metadata;
}

// ============================================================================
// QUALITY FILTERING (Phase 2)
// ============================================================================

/**
 * Validate clip quality against requirements
 * @param {object} metadata - Clip metadata from getMetadata()
 * @returns {object} - { valid: boolean, issues: string[], score: number }
 */
function validateClip(metadata) {
  const issues = [];
  let score = 10; // Start with perfect score
  
  // Resolution check - reject if height < 720p
  if (metadata.height < 720) {
    issues.push(`Resolution too low: ${metadata.height}p (min: 720p)`);
    score -= 3;
  } else if (metadata.height >= 1080) {
    score += 0.5; // Bonus for HD
  }
  
  // Audio detection - flag clips with no audio
  if (!metadata.hasAudio) {
    issues.push('No audio track detected');
    score -= 2;
  }
  
  // Duration bounds - reject if < 3s or > 10s
  if (metadata.duration < 3) {
    issues.push(`Duration too short: ${metadata.duration.toFixed(1)}s (min: 3s)`);
    score -= 4;
  }
  if (metadata.duration > 10) {
    issues.push(`Duration too long: ${metadata.duration.toFixed(1)}s (max: 10s)`);
    score -= 2;
  }
  
  // Aspect ratio check - must be 9:16 ± 10% (portrait video)
  const aspectRatio = metadata.width / metadata.height;
  if (aspectRatio < 0.5 || aspectRatio > 0.65) {
    issues.push(`Wrong aspect ratio: ${aspectRatio.toFixed(3)} (expected 9:16 ≈ 0.5625)`);
    score -= 2;
  }
  
  return { 
    valid: issues.length === 0, 
    issues, 
    score: Math.max(0, Math.min(10, score)) 
  };
}

/**
 * Move a clip to the rejected folder with metadata
 */
function rejectClip(filePath, reasons) {
  const baseName = path.basename(filePath);
  const destPath = path.join(REJECTED_DIR, baseName);
  
  fs.renameSync(filePath, destPath);
  
  const metaPath = path.join(REJECTED_DIR, `${baseName}.rejection.json`);
  fs.writeFileSync(metaPath, JSON.stringify({
    originalPath: filePath,
    rejectedAt: new Date().toISOString(),
    reasons: reasons
  }, null, 2));
  
  console.log(`❌ REJECTED: ${baseName}`);
  reasons.forEach(r => console.log(`   └─ ${r}`));
  
  return destPath;
}

// ============================================================================
// CLIFFHANGER DETECTION (Phase 3)
// ============================================================================

/**
 * Analyze audio to find peak moments
 */
function analyzeAudioPeaks(filePath) {
  const cmd = `ffmpeg -i "${filePath}" -af "asetnsamples=4410,astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level" -f null - 2>&1`;
  
  let result;
  try {
    result = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
  } catch (err) {
    result = err.stdout || '';
  }
  
  const peaks = [];
  const lines = result.split('\n');
  let currentTime = null;
  
  for (const line of lines) {
    const timeMatch = line.match(/pts_time:([\d.]+)/);
    const levelMatch = line.match(/Peak_level=([-\d.]+)/);
    
    if (timeMatch) currentTime = parseFloat(timeMatch[1]);
    if (levelMatch && currentTime !== null) {
      peaks.push({ time: currentTime, level: parseFloat(levelMatch[1]) });
    }
  }
  
  return peaks;
}

/**
 * Analyze video for scene changes
 */
function analyzeSceneChanges(filePath) {
  const cmd = `ffmpeg -i "${filePath}" -filter:v "select='gt(scene,0.2)',showinfo" -f null - 2>&1`;
  
  let result;
  try {
    result = execSync(cmd, { encoding: 'utf-8', timeout: 60000 });
  } catch (err) {
    result = err.stdout || '';
  }
  
  const changes = [];
  const lines = result.split('\n');
  
  for (const line of lines) {
    const match = line.match(/pts_time:([\d.]+).*scene_score=([\d.]+)/);
    if (match) {
      changes.push({ time: parseFloat(match[1]), score: parseFloat(match[2]) });
    }
  }
  
  return changes;
}

/**
 * Find the "impact moment" in a clip
 */
function findImpactMoment(filePath) {
  const metadata = getMetadata(filePath);
  const duration = metadata.duration;
  
  if (duration < 3) return null;
  
  const audioPeaks = analyzeAudioPeaks(filePath);
  const searchStart = duration * 0.4;
  const relevantPeaks = audioPeaks.filter(p => p.time >= searchStart && p.time <= duration - 0.3);
  
  if (relevantPeaks.length === 0) return null;
  
  const loudestPeak = relevantPeaks.reduce((max, p) => p.level > max.level ? p : max, relevantPeaks[0]);
  
  const sceneChanges = analyzeSceneChanges(filePath);
  const relevantScenes = sceneChanges.filter(s => s.time >= searchStart && s.time <= duration - 0.3);
  const biggestScene = relevantScenes.length > 0 
    ? relevantScenes.reduce((max, s) => s.score > max.score ? s : max, relevantScenes[0])
    : null;
  
  let impactMoment = null;
  
  if (loudestPeak && loudestPeak.level > -20) {
    impactMoment = {
      time: loudestPeak.time,
      type: 'audio_peak',
      confidence: Math.min(1, (loudestPeak.level + 40) / 30),
      details: `Peak: ${loudestPeak.level.toFixed(1)}dB at ${loudestPeak.time.toFixed(2)}s`
    };
  }
  
  if (biggestScene && biggestScene.score > 0.4) {
    const sceneImpact = {
      time: biggestScene.time,
      type: 'scene_change',
      confidence: biggestScene.score,
      details: `Scene change: ${biggestScene.score.toFixed(2)} at ${biggestScene.time.toFixed(2)}s`
    };
    
    if (!impactMoment || (biggestScene.time > impactMoment.time && sceneImpact.confidence > impactMoment.confidence)) {
      impactMoment = sceneImpact;
    }
  }
  
  return impactMoment;
}

/**
 * Apply cliffhanger cut
 */
function applyCliffhangerCut(filePath, impactTime, leadTime = 0.5) {
  const cutTime = Math.max(3, impactTime - leadTime);
  const baseName = path.basename(filePath, path.extname(filePath));
  const outputPath = path.join(path.dirname(filePath), `${baseName}_cliff.mp4`);
  
  console.log(`🎬 Cliffhanger: Cut at ${cutTime.toFixed(2)}s (impact at ${impactTime.toFixed(2)}s)`);
  
  const cmd = `ffmpeg -y -i "${filePath}" -t ${cutTime.toFixed(3)} -c copy "${outputPath}"`;
  
  try {
    execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
  } catch (err) {
    throw new Error(`Cliffhanger cut failed: ${err.message}`);
  }
  
  fs.unlinkSync(filePath);
  fs.renameSync(outputPath, filePath);
  
  return filePath;
}

/**
 * Process a clip for cliffhanger effect
 */
function processCliffhanger(filePath) {
  const impact = findImpactMoment(filePath);
  
  if (!impact) {
    return { applied: false };
  }
  
  const metadata = getMetadata(filePath);
  const impactPosition = impact.time / metadata.duration;
  
  if (impactPosition < 0.6) {
    return { applied: false };
  }
  
  const cutTime = Math.max(3, impact.time - 0.5);
  applyCliffhangerCut(filePath, impact.time);
  
  return {
    applied: true,
    cutTime: cutTime,
    impactTime: impact.time,
    impactType: impact.type
  };
}

// ============================================================================
// SEGMENTATION
// ============================================================================

/**
 * Segment video into chunks if longer than threshold
 */
function segmentVideo(filePath, outputDir, maxDuration = 10, segmentLength = 6) {
  const metadata = getMetadata(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));
  
  if (metadata.duration <= maxDuration) {
    const destPath = path.join(outputDir, path.basename(filePath));
    if (filePath !== destPath) {
      fs.copyFileSync(filePath, destPath);
    }
    
    const validation = validateClip(metadata);
    if (!validation.valid) {
      rejectClip(destPath, validation.issues);
      return { segments: [], rejected: [destPath], validationScores: [] };
    }
    
    return { segments: [destPath], rejected: [], validationScores: [validation.score] };
  }
  
  console.log(`✂️  Segmenting: ${metadata.duration.toFixed(1)}s → ~${segmentLength}s chunks`);
  
  const segmentPattern = path.join(outputDir, `${baseName}_seg%03d.mp4`);
  const cmd = `ffmpeg -y -i "${filePath}" -c copy -map 0 -segment_time ${segmentLength} -f segment -reset_timestamps 1 "${segmentPattern}"`;
  
  try {
    execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
  } catch (err) {
    throw new Error(`Segmentation failed: ${err.message}`);
  }
  
  const allSegments = fs.readdirSync(outputDir)
    .filter(f => f.startsWith(`${baseName}_seg`) && f.endsWith('.mp4'))
    .sort()
    .map(f => path.join(outputDir, f));
  
  const validSegments = [];
  const rejectedSegments = [];
  const validationScores = [];
  
  for (const segment of allSegments) {
    const segMeta = getMetadata(segment);
    const validation = validateClip(segMeta);
    
    if (validation.valid) {
      validSegments.push(segment);
      validationScores.push(validation.score);
    } else {
      rejectClip(segment, validation.issues);
      rejectedSegments.push(segment);
    }
  }
  
  console.log(`🔍 Quality check: ${validSegments.length}/${allSegments.length} passed`);
  
  return { segments: validSegments, rejected: rejectedSegments, validationScores };
}

// ============================================================================
// MAIN PIPELINE
// ============================================================================

/**
 * Main ingestion pipeline
 * @param {string} url - Video URL to ingest
 * @param {object} options - CLI options
 */
async function ingestClip(url, options = {}) {
  console.log('\n🎬 === CLIP INGESTION PIPELINE ===\n');
  
  const library = loadLibrary();
  
  // Check for duplicates (unless --force)
  if (!options.force) {
    const existing = findExistingClip(library, url);
    if (existing) {
      console.log(`⏭️  Already in library: ${existing.id}`);
      console.log(`   Use --force to re-ingest`);
      return existing;
    }
  }
  
  if (options.dryRun) {
    console.log(`🔍 DRY RUN - Would ingest: ${url}`);
    return null;
  }
  
  try {
    // Step 1: Download
    const { id, filePath, title } = downloadClip(url, RAW_DIR);
    
    // Step 2: Get metadata
    const metadata = getMetadata(filePath);
    console.log(`📊 Metadata: ${metadata.width}x${metadata.height}, ${metadata.duration.toFixed(1)}s, audio: ${metadata.hasAudio ? 'yes' : 'no'}`);
    
    // Step 3: Segment if needed
    const { segments, rejected, validationScores } = segmentVideo(filePath, PROCESSED_DIR);
    
    if (segments.length === 0) {
      console.log('\n❌ All segments rejected');
      return null;
    }
    
    // Step 4: Cliffhanger detection
    const cliffhangerResults = [];
    for (const segment of segments) {
      const result = processCliffhanger(segment);
      cliffhangerResults.push(result);
    }
    
    // Step 5: Auto vibe tagging (use manual override if provided)
    const vibeResult = options.vibe 
      ? { vibe: options.vibe, confidence: 1.0, reason: 'manual override' }
      : autoTagVibe(metadata, url, title, segments[0]);
    
    console.log(`🏷️  Vibe: ${vibeResult.vibe} (confidence: ${vibeResult.confidence})`);
    
    // Step 6: Add each segment to library
    const avgScore = validationScores.length > 0 
      ? validationScores.reduce((a, b) => a + b, 0) / validationScores.length 
      : 7.0;
    
    const addedClips = [];
    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      const segMeta = getMetadata(segment);
      const cliffhanger = cliffhangerResults[i];
      
      const clipData = {
        id: generateClipId('youtube_shorts', `${id}_${i}`),
        file: path.relative(PROJECT_ROOT, segment),
        source: url.includes('tiktok') ? 'tiktok' : 'youtube_shorts',
        source_url: url,
        source_id: id,
        title: title,
        vibe: vibeResult.vibe,
        vibe_confidence: vibeResult.confidence,
        duration: segMeta.duration,
        resolution: `${segMeta.width}x${segMeta.height}`,
        has_audio: segMeta.hasAudio,
        cliffhanger_applied: cliffhanger.applied,
        cliffhanger_cut_time: cliffhanger.cutTime || null,
        quality_score: parseFloat((avgScore + (cliffhanger.applied ? 0.5 : 0)).toFixed(1)),
        ingested_at: new Date().toISOString()
      };
      
      addToLibrary(clipData, options.force);
      addedClips.push(clipData);
    }
    
    console.log(`\n✨ === INGESTION COMPLETE ===`);
    console.log(`   Source: ${id}`);
    console.log(`   Title: ${title}`);
    console.log(`   Clips added: ${addedClips.length}`);
    console.log(`   Vibe: ${vibeResult.vibe}`);
    
    return addedClips;
    
  } catch (err) {
    console.error(`\n❌ Ingestion failed: ${err.message}`);
    if (!options.batch) process.exit(1);
    return null;
  }
}

/**
 * Process batch file of URLs
 * @param {string} batchFile - Path to file with URLs
 * @param {object} options - CLI options
 */
async function processBatch(batchFile, options) {
  if (!fs.existsSync(batchFile)) {
    console.error(`❌ Batch file not found: ${batchFile}`);
    process.exit(1);
  }
  
  const urls = fs.readFileSync(batchFile, 'utf-8')
    .split('\n')
    .map(line => line.trim())
    .filter(line => line && !line.startsWith('#'));
  
  console.log(`\n📋 === BATCH PROCESSING: ${urls.length} URLs ===\n`);
  
  let success = 0;
  let failed = 0;
  let skipped = 0;
  
  for (let i = 0; i < urls.length; i++) {
    console.log(`\n[${i + 1}/${urls.length}] Processing...`);
    try {
      const result = await ingestClip(urls[i], { ...options, batch: true });
      if (result === null) {
        failed++;
      } else if (result.id && !Array.isArray(result)) {
        skipped++; // Already exists
      } else {
        success++;
      }
    } catch (e) {
      console.error(`   ❌ ${e.message}`);
      failed++;
    }
    
    // Small delay between downloads
    if (i < urls.length - 1) {
      await new Promise(r => setTimeout(r, 1000));
    }
  }
  
  console.log(`\n✨ === BATCH COMPLETE ===`);
  console.log(`   ✅ Success: ${success}`);
  console.log(`   ⏭️  Skipped: ${skipped}`);
  console.log(`   ❌ Failed: ${failed}`);
}

/**
 * Display library stats
 */
function showLibraryStats() {
  const stats = getLibraryStats();
  
  console.log('\n📊 === CLIP LIBRARY STATS ===\n');
  console.log(`Total clips: ${stats.total}`);
  console.log(`With local file: ${stats.withFile}`);
  console.log(`With audio: ${stats.withAudio}`);
  console.log(`Cliffhanger applied: ${stats.withCliffhanger}`);
  console.log(`Avg duration: ${stats.avgDuration}s`);
  console.log(`Avg quality: ${stats.avgQuality}/10`);
  
  console.log('\n📁 By Vibe:');
  for (const [vibe, count] of Object.entries(stats.byVibe).sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.ceil(count / 2));
    console.log(`   ${vibe.padEnd(12)} ${String(count).padStart(3)} ${bar}`);
  }
  
  console.log('\n🌐 By Source:');
  for (const [source, count] of Object.entries(stats.bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`   ${source.padEnd(15)} ${count}`);
  }
}

// ============================================================================
// CLI
// ============================================================================

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];
    
    switch (arg) {
      case '--url':
      case '-u':
        options.url = next;
        i++;
        break;
      case '--batch':
      case '-b':
        options.batch = next;
        i++;
        break;
      case '--vibe':
      case '-v':
        if (['funny', 'fail', 'satisfying', 'wholesome', 'shocking'].includes(next)) {
          options.vibe = next;
        } else {
          console.error(`❌ Invalid vibe: ${next}`);
          console.error(`   Valid: funny, fail, satisfying, wholesome, shocking`);
          process.exit(1);
        }
        i++;
        break;
      case '--dry-run':
      case '-n':
        options.dryRun = true;
        break;
      case '--force':
      case '-f':
        options.force = true;
        break;
      case '--list':
      case '-l':
        options.list = true;
        break;
      case '--migrate':
        options.migrate = true;
        break;
      case '--file':
        options.file = next;
        i++;
        break;
      case '--test-validate':
        options.testValidate = true;
        break;
      case '--test-cliffhanger':
        options.testCliffhanger = true;
        break;
      case '--test-vibe':
        options.testVibe = true;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
    }
  }
  
  return options;
}

function showHelp() {
  console.log(`
📼 Clip Ingestion Pipeline v2.0

Usage:
  node scripts/ingest-clips.js --url <URL>           # Single URL
  node scripts/ingest-clips.js --batch <file>        # Batch file
  node scripts/ingest-clips.js --list                # Show library stats
  node scripts/ingest-clips.js --migrate             # Migrate legacy clips

Options:
  -u, --url <url>          YouTube Shorts or TikTok URL to ingest
  -b, --batch <file>       Batch file with URLs (one per line)
  -v, --vibe <vibe>        Manual vibe override (funny/fail/satisfying/wholesome/shocking)
  -n, --dry-run            Preview only, don't download
  -f, --force              Re-ingest even if already in library
  -l, --list               Show library statistics
      --migrate            Migrate legacy manifests to unified library
  -h, --help               Show this help message

Test Commands:
      --file <path>        Existing video file to test
      --test-validate      Test quality validation on file
      --test-cliffhanger   Test cliffhanger detection on file
      --test-vibe          Test vibe tagging on file

Examples:
  node scripts/ingest-clips.js --url "https://youtube.com/shorts/abc123"
  node scripts/ingest-clips.js --batch urls.txt --vibe funny
  node scripts/ingest-clips.js --url "https://tiktok.com/..." --force
  node scripts/ingest-clips.js --list
`);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  if (options.list) {
    showLibraryStats();
    process.exit(0);
  }
  
  if (options.migrate) {
    migrateExistingClips();
    process.exit(0);
  }
  
  if (options.file) {
    if (!fs.existsSync(options.file)) {
      console.error(`❌ File not found: ${options.file}`);
      process.exit(1);
    }
    
    const metadata = getMetadata(options.file);
    console.log(`📊 Metadata: ${metadata.width}x${metadata.height}, ${metadata.duration.toFixed(1)}s`);
    
    if (options.testValidate) {
      const validation = validateClip(metadata);
      console.log(`\n📋 Validation: ${validation.valid ? '✅ PASSED' : '❌ FAILED'}`);
      console.log(`   Score: ${validation.score}/10`);
      validation.issues.forEach(i => console.log(`   └─ ${i}`));
    }
    
    if (options.testCliffhanger) {
      const result = processCliffhanger(options.file);
      console.log(`\n🎬 Cliffhanger: ${result.applied ? '✅ Applied' : '⏭️ Not applied'}`);
      if (result.applied) {
        console.log(`   Cut at: ${result.cutTime.toFixed(2)}s`);
        console.log(`   Impact at: ${result.impactTime.toFixed(2)}s`);
      }
    }
    
    if (options.testVibe) {
      const vibeResult = autoTagVibe(metadata, '', '', options.file);
      console.log(`\n🏷️  Auto-tagged vibe: ${vibeResult.vibe}`);
      console.log(`   Confidence: ${vibeResult.confidence}`);
      console.log(`   Reason: ${vibeResult.reason}`);
    }
    
    process.exit(0);
  }
  
  if (options.batch) {
    await processBatch(options.batch, options);
    process.exit(0);
  }
  
  if (options.url) {
    await ingestClip(options.url, options);
    process.exit(0);
  }
  
  console.error('❌ Error: --url, --batch, --list, or --file is required');
  showHelp();
  process.exit(1);
}

// Export for module use
module.exports = {
  ingestClip,
  loadLibrary,
  saveLibrary,
  addToLibrary,
  findExistingClip,
  migrateExistingClips,
  getLibraryStats,
  autoTagVibe,
  validateClip,
  processCliffhanger,
  getMetadata
};

// Run if called directly
if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err.message);
    process.exit(1);
  });
}
