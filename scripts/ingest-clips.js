#!/usr/bin/env node
/**
 * Clip Ingestion Pipeline - Phase 1
 * Downloads clips, extracts metadata, segments long videos, updates manifest
 * 
 * Usage: node scripts/ingest-clips.js --url "https://youtube.com/shorts/xxx"
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
const LIBRARY_PATH = path.join(CLIPS_DIR, 'library.json');

// Ensure directories exist
[RAW_DIR, PROCESSED_DIR].forEach(dir => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

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
  console.log(`✅ Downloaded: ${filePath}`);
  
  return { id: videoId, filePath, title };
}

/**
 * Get video metadata using ffprobe
 * @param {string} filePath - Path to video file
 * @returns {object} - { duration, width, height, hasAudio, codec }
 */
function getMetadata(filePath) {
  console.log(`📊 Getting metadata: ${path.basename(filePath)}`);
  
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
  
  console.log(`✅ Duration: ${metadata.duration.toFixed(1)}s, ${metadata.width}x${metadata.height}, Audio: ${metadata.hasAudio}`);
  
  return metadata;
}

/**
 * Segment video into chunks if longer than threshold
 * @param {string} filePath - Path to video file
 * @param {string} outputDir - Directory for segments
 * @param {number} maxDuration - Max duration before segmenting (default 10s)
 * @param {number} segmentLength - Target segment length (default 6s)
 * @returns {string[]} - Array of segment file paths
 */
function segmentVideo(filePath, outputDir, maxDuration = 10, segmentLength = 6) {
  const metadata = getMetadata(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));
  
  // If video is short enough, just copy it
  if (metadata.duration <= maxDuration) {
    const destPath = path.join(outputDir, path.basename(filePath));
    if (filePath !== destPath) {
      fs.copyFileSync(filePath, destPath);
    }
    console.log(`✅ Video under ${maxDuration}s, no segmentation needed`);
    return [destPath];
  }
  
  console.log(`✂️ Segmenting ${metadata.duration.toFixed(1)}s video into ~${segmentLength}s chunks`);
  
  // Use ffmpeg to segment
  const segmentPattern = path.join(outputDir, `${baseName}_seg%03d.mp4`);
  const cmd = `ffmpeg -y -i "${filePath}" -c copy -map 0 -segment_time ${segmentLength} -f segment -reset_timestamps 1 "${segmentPattern}"`;
  
  try {
    execSync(cmd, { encoding: 'utf-8', stdio: 'pipe' });
  } catch (err) {
    throw new Error(`Segmentation failed: ${err.message}`);
  }
  
  // Find all segments
  const segments = fs.readdirSync(outputDir)
    .filter(f => f.startsWith(`${baseName}_seg`) && f.endsWith('.mp4'))
    .sort()
    .map(f => path.join(outputDir, f));
  
  console.log(`✅ Created ${segments.length} segments`);
  
  return segments;
}

/**
 * Load or initialize the library manifest
 * @returns {object} - Library data
 */
function loadLibrary() {
  if (fs.existsSync(LIBRARY_PATH)) {
    return JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf-8'));
  }
  return {
    version: 1,
    created: new Date().toISOString(),
    updated: new Date().toISOString(),
    clips: []
  };
}

/**
 * Save library manifest
 * @param {object} library - Library data
 */
function saveLibrary(library) {
  library.updated = new Date().toISOString();
  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2));
}

/**
 * Add clip data to manifest
 * @param {object} clipData - Clip metadata
 */
function addToManifest(clipData) {
  const library = loadLibrary();
  
  // Check if clip already exists
  const existing = library.clips.findIndex(c => c.sourceId === clipData.sourceId);
  if (existing >= 0) {
    library.clips[existing] = { ...library.clips[existing], ...clipData, updated: new Date().toISOString() };
    console.log(`📝 Updated existing clip in manifest: ${clipData.sourceId}`);
  } else {
    clipData.added = new Date().toISOString();
    library.clips.push(clipData);
    console.log(`📝 Added new clip to manifest: ${clipData.sourceId}`);
  }
  
  saveLibrary(library);
  return library;
}

/**
 * Main ingestion pipeline
 * @param {string} url - Video URL to ingest
 */
async function ingestClip(url) {
  console.log('\n🎬 === CLIP INGESTION PIPELINE ===\n');
  
  try {
    // Step 1: Download
    const { id, filePath, title } = downloadClip(url, RAW_DIR);
    
    // Step 2: Get metadata
    const metadata = getMetadata(filePath);
    
    // Step 3: Segment if needed
    const segments = segmentVideo(filePath, PROCESSED_DIR);
    
    // Step 4: Build clip data
    const clipData = {
      sourceId: id,
      sourceUrl: url,
      title: title,
      rawPath: filePath,
      segments: segments.map(s => path.relative(PROJECT_ROOT, s)),
      metadata: {
        duration: metadata.duration,
        width: metadata.width,
        height: metadata.height,
        hasAudio: metadata.hasAudio,
        codec: metadata.codec
      },
      status: 'ready',
      segmentCount: segments.length
    };
    
    // Step 5: Add to manifest
    addToManifest(clipData);
    
    console.log('\n✨ === INGESTION COMPLETE ===');
    console.log(`   ID: ${id}`);
    console.log(`   Title: ${title}`);
    console.log(`   Duration: ${metadata.duration.toFixed(1)}s`);
    console.log(`   Segments: ${segments.length}`);
    console.log(`   Manifest: ${path.relative(PROJECT_ROOT, LIBRARY_PATH)}`);
    
    return clipData;
    
  } catch (err) {
    console.error(`\n❌ Ingestion failed: ${err.message}`);
    process.exit(1);
  }
}

// CLI handling
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {};
  
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) {
      options.url = args[i + 1];
      i++;
    } else if (args[i] === '--help' || args[i] === '-h') {
      options.help = true;
    }
  }
  
  return options;
}

function showHelp() {
  console.log(`
Clip Ingestion Pipeline

Usage:
  node scripts/ingest-clips.js --url <video-url>

Options:
  --url <url>   YouTube Shorts or TikTok URL to ingest
  --help, -h    Show this help message

Examples:
  node scripts/ingest-clips.js --url "https://www.youtube.com/shorts/abc123"
  node scripts/ingest-clips.js --url "https://www.tiktok.com/@user/video/123"
`);
}

// Main
const options = parseArgs();

if (options.help) {
  showHelp();
  process.exit(0);
}

if (!options.url) {
  console.error('❌ Error: --url is required');
  showHelp();
  process.exit(1);
}

ingestClip(options.url);
