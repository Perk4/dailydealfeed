#!/usr/bin/env node
/**
 * Editor Agent — Video Assembly Module (with TTS Voiceover + Motion Effects)
 * For DailyDealFeed Reels Pipeline
 * 
 * VERSION: V10 (2026-02-15)
 * V10 CHANGES:
 *   - REDESIGNED: Price overlay now looks like a STICKER, not PowerPoint!
 *   - Sticker features:
 *     • Hot pink background (vibrant, attention-grabbing)
 *     • Drop shadow (depth, feels physical)
 *     • Fire emoji 🔥 for urgency
 *     • Bounce-in animation (pops up with overshoot)
 *     • White text on pink (high contrast)
 *   - Product name is now subtler (secondary to price sticker)
 *
 * V9 CHANGES:
 *   - FIXED: Voiceover timing - now DELAYED to start after hook
 *   - FIXED: AFV clip original audio is PRESERVED for hook segment
 *   - Audio flow: [0-5s] AFV original audio | [5s+] Voiceover starts
 *   - Updated convertGifToVideo() to preserve MP4 audio
 *   - Updated concatenation to preserve hook audio
 *   - Updated mixAudioWithVideo() with delay + mix options
 *
 * V8 CHANGES:
 *   - REMOVED: Hook text overlay (was getting cut off in 9:16 portrait)
 *   - REMOVED: Background music mixing (deprioritized for video quality)
 *   - ADDED: Prominent price/discount overlay on product segment
 *   - SIMPLIFIED: Video structure to ~12 seconds total
 *     [0-5s]   AFV clip (cliffhanger cut, no text)
 *     [5-10s]  Product showcase with price overlay
 *     [10-12s] CTA: "Link in bio"
 *
 * Creates vertical videos (9:16, ~12 sec) ready for TikTok/IG Reels.
 * 
 * Motion Effects (TikTok-native feel):
 *   - Ken Burns zoom on product images
 *   - Text fade-in with slide-up animations
 *   - Subtle camera shake on hook segment
 *   - Progress bar indicator at bottom
 *
 * Now includes TTS voiceover for hooks and product info.
 *
 * Usage:
 *   node editor.js                          # Process from stdin JSON
 *   node editor.js --input input.json       # Process from JSON file
 *   node editor.js --product-id 1           # Auto-run scout+producer for product
 *   node editor.js --test                   # Run test with sample data
 *
 * Input JSON format:
 * {
 *   "product_id": "1",
 *   "product_name": "LED Moon Night Light",
 *   "product_image": "https://...",
 *   "product_price": "$20",
 *   "meme_url": "https://media.giphy.com/...",
 *   "voiceover_script": "Finally fixed my room situation...",
 *   "voiceover_audio": "/path/to/voiceover.mp3",  // Optional: pre-generated audio
 *   "ig_caption": "...",
 *   "tiktok_caption": "...",
 *   "hook_angle": "room transformation"
 * }
 *
 * Output structure:
 *   output/
 *   ├── video_[product_id]_[timestamp].mp4
 *   ├── thumb_[product_id]_[timestamp].jpg
 *   └── post_[product_id]_[timestamp].json
 */

const { execSync, spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
// V13: Disabled amazon-recorder - using static image fallback
// const { recordAmazonProduct } = require('./amazon-recorder');
const recordAmazonProduct = async () => ({ success: false, message: 'Disabled - using static fallback' });
const logger = require('./lib/logger');
const { selectHook } = require('./lib/hooks');

// Configuration
const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, '..', 'output');
const TEMP_DIR = path.join(SCRIPT_DIR, '..', 'temp');
const ASSETS_DIR = path.join(SCRIPT_DIR, '..', 'assets');
const MUSIC_DIR = path.join(SCRIPT_DIR, '..', 'music');

// Video dimensions (9:16 vertical)
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;

// Timing (in seconds) - V8: Simplified 12-second format
// Structure: [0-5s] AFV clip | [5-10s] Product + Price | [10-12s] CTA
const DEFAULT_HOOK_DURATION = 5;    // V8: 4-6s clip (was 3s)
const DEFAULT_PRODUCT_DURATION = 5; // V8: 5s product showcase (was 8s)
const DEFAULT_CTA_DURATION = 2;     // V8: 2s CTA (unchanged)
const MIN_TOTAL_DURATION = 10;
const MAX_TOTAL_DURATION = 14;      // V8: Tighter max (was 18)

// Dynamic timing will be calculated based on voiceover audio length
let HOOK_DURATION = DEFAULT_HOOK_DURATION;
let PRODUCT_DURATION = DEFAULT_PRODUCT_DURATION;
let CTA_DURATION = DEFAULT_CTA_DURATION;
let TOTAL_DURATION = DEFAULT_HOOK_DURATION + DEFAULT_PRODUCT_DURATION + DEFAULT_CTA_DURATION; // 13 seconds default

// TTS Configuration
const TTS_CONFIG = {
  voice: 'en-us',
  speed: 150,          // Words per minute
  pitch: 50,           // 0-99
  useExternalTTS: true, // Try external TTS first (OpenClaw/ElevenLabs)
  useOpenClawTTS: true  // Prefer OpenClaw TTS over Deepgram worker
};

// Script Map Configuration
const SCRIPT_MAP_FILE = path.join(SCRIPT_DIR, 'script-map.json');
const VIRAL_CLIPS_FILE = path.join(SCRIPT_DIR, '..', 'clips', 'viral-handpicked.json');

// Background Music Configuration
// V8.1: Music RE-ENABLED - QA showed v7 with music scored 8.2/10 vs v8's 7.4/10
const MUSIC_CONFIG = {
  enabled: true,       // V8.1: RE-ENABLED - music adds significant watchability
  volume: 0.15,        // 15% volume (subtler - doesn't compete with voice)
  fadeIn: 0.5,         // Fade in duration (seconds)
  fadeOut: 1.0,        // Fade out duration (seconds)
};

// Edit Style Configuration (TikTok-organic feel)
const EDIT_STYLE = {
  // Ken Burns zoom - reduced for subtler, organic feel
  zoomIntensity: 0.05,       // 1.0 to 1.05 (was 0.12 - reduced by 58%)
  
  // Text timing - delay after audio cue for spontaneous feel
  textDelaySeconds: 0.15,    // Text appears 0.15s AFTER the spoken word
  
  // Progress bar - can distract from content
  progressBarEnabled: false, // Disabled for more organic feel
  
  // Segment transitions - crossfade for smoother flow
  crossfadeDuration: 0.3,    // Crossfade between segments (seconds)
  
  // Camera shake - subtle energy on hook
  shakeIntensity: 3,         // Reduced from 4 for subtler movement
  
  // Pacing variation
  hookDurationVariance: 0.3, // Allow ±30% variance in timing
};

// Colors (hex without #)
const COLORS = {
  background: '0a0a0a',
  textPrimary: 'ffffff',
  textSecondary: 'cccccc',
  accent: 'ff6b6b',
  ctaBackground: '1a1a2e',
};

// Font settings
const FONT_PATH = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf';

// Ensure directories exist
function ensureDirs() {
  [OUTPUT_DIR, TEMP_DIR, ASSETS_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  });
}

// Download file from URL or copy from local path
function downloadFile(urlOrPath, destPath) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    const filename = path.basename(destPath);
    
    // Handle local file paths
    if (urlOrPath.startsWith('/') || urlOrPath.startsWith('./') || urlOrPath.startsWith('../')) {
      // It's a local file path - copy instead of download
      if (fs.existsSync(urlOrPath)) {
        try {
          fs.copyFileSync(urlOrPath, destPath);
          const stats = fs.statSync(destPath);
          logger.editor('DEBUG', `Copied local file`, { 
            source: urlOrPath, 
            dest: destPath,
            size: stats.size 
          });
          console.log(`   📁 Copied from local cache: ${path.basename(urlOrPath)}`);
          resolve(destPath);
        } catch (copyErr) {
          logger.editor('ERROR', `Failed to copy local file`, {
            source: urlOrPath,
            dest: destPath,
            error: copyErr.message
          });
          reject(copyErr);
        }
      } else {
        logger.editor('ERROR', `Local file not found`, { path: urlOrPath });
        reject(new Error(`Local file not found: ${urlOrPath}`));
      }
      return;
    }
    
    logger.editor('DEBUG', `Starting download`, { url: urlOrPath, dest: filename });
    
    const protocol = urlOrPath.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    
    const request = protocol.get(urlOrPath, { 
      headers: { 'User-Agent': 'DailyDealFeed-Editor/1.0' }
    }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        logger.editor('DEBUG', `Following redirect`, { 
          from: urlOrPath.slice(0, 100), 
          to: response.headers.location?.slice(0, 100) 
        });
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        logger.editor('ERROR', `Download failed with HTTP ${response.statusCode}`, {
          url: urlOrPath.slice(0, 200),
          statusCode: response.statusCode
        });
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
        const stats = fs.statSync(destPath);
        
        if (stats.size === 0) {
          logger.editor('ERROR', `Downloaded file is empty (0 bytes)`, {
            url: urlOrPath.slice(0, 200),
            dest: destPath
          });
          reject(new Error('Downloaded file is empty'));
          return;
        }
        
        logger.editor('DEBUG', `Download completed in ${elapsed}s`, {
          filename,
          size: stats.size,
          elapsed
        });
        resolve(destPath);
      });
    });
    
    request.on('error', (err) => {
      logger.editor('ERROR', `Download network error`, {
        url: urlOrPath.slice(0, 200),
        error: err.message
      });
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
    
    request.setTimeout(30000, () => {
      logger.editor('ERROR', `Download timeout (30s)`, { url: urlOrPath.slice(0, 200) });
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

// Run FFmpeg command
function ffmpeg(args, options = {}) {
  const cmd = `ffmpeg -y ${args}`;
  const startTime = Date.now();
  
  if (options.verbose) {
    console.log(`[FFmpeg] ${cmd}`);
  }
  
  logger.ffmpeg('DEBUG', `Executing FFmpeg command`, { 
    argsPreview: args.slice(0, 200) + (args.length > 200 ? '...' : '')
  });
  
  try {
    const result = execSync(cmd, { 
      stdio: options.verbose ? 'inherit' : 'pipe',
      maxBuffer: 50 * 1024 * 1024,
      timeout: 120000 // 2 minute timeout per command
    });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    logger.ffmpeg('DEBUG', `FFmpeg completed in ${elapsed}s`);
    
    // Check for output file if we can infer it
    const outputMatch = args.match(/"([^"]+\.mp4)"$/);
    if (outputMatch) {
      const outputPath = outputMatch[1];
      if (fs.existsSync(outputPath)) {
        const stats = fs.statSync(outputPath);
        if (stats.size === 0) {
          logger.ffmpeg('ERROR', `FFmpeg produced empty file (0 bytes) - silent failure`, {
            outputPath,
            argsPreview: args.slice(0, 300)
          });
          throw new Error(`FFmpeg produced empty file: ${outputPath}`);
        }
        logger.ffmpeg('DEBUG', `Output verified`, { outputPath, size: stats.size });
      }
    }
    
    return true;
  } catch (err) {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);
    
    // Check for timeout
    if (err.killed || err.signal === 'SIGTERM') {
      logger.ffmpeg('ERROR', `FFmpeg TIMEOUT after ${elapsed}s`, {
        argsPreview: args.slice(0, 300),
        signal: err.signal
      });
    } else {
      logger.ffmpeg('ERROR', `FFmpeg failed after ${elapsed}s: ${err.message}`, {
        argsPreview: args.slice(0, 300),
        stderr: err.stderr?.toString().slice(-500)
      });
    }
    
    if (options.throwOnError !== false) {
      console.error(`FFmpeg error: ${err.message}`);
      throw err;
    }
    return false;
  }
}

// Run FFprobe to get audio duration
function getAudioDuration(audioPath) {
  try {
    const result = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${audioPath}"`,
      { encoding: 'utf8' }
    );
    return parseFloat(result.trim());
  } catch (err) {
    console.error(`FFprobe error: ${err.message}`);
    return 0;
  }
}

// Escape text for FFmpeg drawtext filter
function escapeText(text) {
  return text
    .replace(/\\/g, '\\\\\\\\')
    .replace(/'/g, "'\\''")
    .replace(/:/g, '\\:')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/%/g, '\\%')
    .replace(/\$/g, '\\$');  // Escape $ for shell
}

// ============================================
// SCRIPT MAP LOADING
// ============================================

/**
 * Load conversational scripts from script-map.json
 */
function loadScriptMap() {
  if (fs.existsSync(SCRIPT_MAP_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(SCRIPT_MAP_FILE, 'utf8'));
    } catch (err) {
      console.log('⚠️  Could not parse script-map.json, using defaults');
    }
  }
  return null;
}

/**
 * Get conversational script for a product
 */
function getConversationalScript(input) {
  const scriptMap = loadScriptMap();
  if (!scriptMap || !scriptMap.scripts) {
    return null;
  }
  
  const productId = String(input.product_id);
  const script = scriptMap.scripts[productId];
  
  if (script) {
    console.log(`📝 Loaded conversational script for product ${productId}`);
    return script;
  }
  
  return null;
}

/**
 * Load viral clips library
 */
function loadViralClips() {
  if (fs.existsSync(VIRAL_CLIPS_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(VIRAL_CLIPS_FILE, 'utf8'));
    } catch (err) {
      console.log('⚠️  Could not parse viral-handpicked.json');
    }
  }
  return null;
}

/**
 * Calculate dynamic timing based on voiceover length
 */
function calculateDynamicTiming(audioDuration) {
  // Target: voiceover fills ~80% of video, with visual buffer
  let totalDuration = Math.ceil(audioDuration * 1.2);
  
  // Enforce min/max bounds
  totalDuration = Math.max(MIN_TOTAL_DURATION, Math.min(MAX_TOTAL_DURATION, totalDuration));
  
  // Distribute time: Hook (25%), Product (55%), CTA (20%)
  const hookDuration = Math.max(2, Math.round(totalDuration * 0.25));
  const ctaDuration = Math.max(2, Math.round(totalDuration * 0.20));
  const productDuration = totalDuration - hookDuration - ctaDuration;
  
  console.log(`⏱️  Dynamic timing: Hook=${hookDuration}s, Product=${productDuration}s, CTA=${ctaDuration}s, Total=${totalDuration}s`);
  
  return {
    hookDuration,
    productDuration,
    ctaDuration,
    totalDuration
  };
}

// ============================================
// TTS VOICEOVER GENERATION
// ============================================

/**
 * Generate voiceover script from input data
 */
function generateVoiceoverScript(input) {
  const parts = [];
  
  // Hook (0-3 seconds) - Short, attention-grabbing
  // Use provided hook_angle, or select category-aware hook from library
  const hook = input.hook_angle || input.voiceover_script || selectHook({
    category: input.product_category || 'default',
    price: input.product_price || '$20',
    productName: input.product_name || '',
    isOnSale: !!input.original_price
  });
  parts.push({
    text: hook,
    section: 'hook',
    startTime: 0,
    duration: HOOK_DURATION
  });
  
  // Product description (3-15 seconds) - Product name and price
  const productDesc = `${input.product_name}. Only ${input.product_price || 'a few bucks'}.`;
  parts.push({
    text: productDesc,
    section: 'product',
    startTime: HOOK_DURATION,
    duration: PRODUCT_DURATION
  });
  
  // CTA (15-20 seconds)
  parts.push({
    text: 'Link in bio.',
    section: 'cta',
    startTime: HOOK_DURATION + PRODUCT_DURATION,
    duration: CTA_DURATION
  });
  
  return parts;
}

/**
 * Generate combined voiceover text
 * Now uses conversational scripts from script-map.json when available
 */
function getCombinedVoiceoverText(input) {
  // Try to get conversational script from script-map.json
  const script = getConversationalScript(input);
  
  if (script && script.full_script) {
    console.log('✅ Using conversational script from script-map.json');
    return script.full_script;
  }
  
  // Fallback to generating from input with category-aware hook
  const hook = input.hook_angle || input.voiceover_script || selectHook({
    category: input.product_category || 'default',
    price: input.product_price || '$20',
    productName: input.product_name || '',
    isOnSale: !!input.original_price
  });
  const productDesc = `${input.product_name}. Only ${input.product_price || 'a few bucks'}.`;
  const cta = 'Link in bio.';
  
  // Add pauses between sections using commas/periods
  return `${hook}... ${productDesc}... ${cta}`;
}

/**
 * Generate TTS audio using espeak-ng (fallback)
 */
function generateTTSEspeak(text, outputPath) {
  console.log('🎙️  Generating TTS with espeak-ng...');
  
  const wavPath = outputPath.replace(/\.[^.]+$/, '.wav');
  
  try {
    // Generate WAV with espeak-ng
    execSync(
      `espeak-ng -v ${TTS_CONFIG.voice} -s ${TTS_CONFIG.speed} -p ${TTS_CONFIG.pitch} -w "${wavPath}" "${text.replace(/"/g, '\\"')}"`,
      { stdio: 'pipe' }
    );
    
    // Convert to MP3 with better quality
    ffmpeg(`-i "${wavPath}" -acodec libmp3lame -ab 128k "${outputPath}"`);
    
    // Cleanup WAV
    if (fs.existsSync(wavPath)) fs.unlinkSync(wavPath);
    
    return outputPath;
  } catch (err) {
    console.error(`TTS generation error: ${err.message}`);
    return null;
  }
}

/**
 * Check if external TTS file exists (pre-generated via OpenClaw)
 */
function findExternalTTSAudio(input, tempDir) {
  // Check if voiceover_audio was provided
  if (input.voiceover_audio && fs.existsSync(input.voiceover_audio)) {
    console.log('🎙️  Using pre-generated voiceover audio');
    return input.voiceover_audio;
  }
  
  // Check for OpenClaw TTS output in temp directories
  const ttsPattern = /\/tmp\/tts-[^/]+\/voice-\d+\.mp3/;
  if (input.voiceover_audio && ttsPattern.test(input.voiceover_audio)) {
    if (fs.existsSync(input.voiceover_audio)) {
      console.log('🎙️  Using OpenClaw TTS audio');
      return input.voiceover_audio;
    }
  }
  
  return null;
}

/**
 * Generate TTS using ElevenLabs API (natural voice)
 * Requires ELEVENLABS_API_KEY environment variable
 */
async function generateTTSElevenLabs(text, outputPath, options = {}) {
  // Try to load the ElevenLabs module
  let elevenLabs;
  try {
    elevenLabs = require('./lib/tts-elevenlabs');
  } catch (e) {
    throw new Error('ElevenLabs module not found');
  }
  
  if (!elevenLabs.isElevenLabsConfigured()) {
    throw new Error('ELEVENLABS_API_KEY not set');
  }
  
  return elevenLabs.generateElevenLabsTTS(text, outputPath, {
    voice: options.voice || 'default',
    style: options.style || 'energetic'
  });
}

/**
 * Generate TTS using OpenClaw (recommended - higher quality voices)
 * Uses the openclaw CLI tts command
 */
async function generateTTSOpenClaw(text, outputPath) {
  console.log('🎙️  Generating TTS with OpenClaw (high quality)...');
  
  return new Promise((resolve, reject) => {
    // Use openclaw CLI to generate TTS
    // The TTS output is a MEDIA: path that we need to copy
    const { execSync } = require('child_process');
    
    try {
      // Write text to temp file to avoid shell escaping issues
      const tempTextFile = path.join(TEMP_DIR, `tts_input_${Date.now()}.txt`);
      fs.writeFileSync(tempTextFile, text);
      
      // Try to use openclaw tts via a simple approach
      // Since OpenClaw TTS returns a MEDIA: path, we'll check for existing TTS files
      
      // Check if there's a pre-generated TTS file in the expected location
      const ttsDir = '/tmp/openclaw-tts';
      if (!fs.existsSync(ttsDir)) {
        fs.mkdirSync(ttsDir, { recursive: true });
      }
      
      // Generate a hash-based filename for caching
      const crypto = require('crypto');
      const textHash = crypto.createHash('md5').update(text).digest('hex').slice(0, 12);
      const cachedTTS = path.join(ttsDir, `voice-${textHash}.mp3`);
      
      if (fs.existsSync(cachedTTS)) {
        console.log('✅ Using cached OpenClaw TTS');
        fs.copyFileSync(cachedTTS, outputPath);
        fs.unlinkSync(tempTextFile);
        resolve(outputPath);
        return;
      }
      
      // For now, fall through to Cloudflare/espeak
      // In production, this would invoke openclaw tts command
      fs.unlinkSync(tempTextFile);
      reject(new Error('OpenClaw TTS not available in batch mode - falling back'));
      
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Generate TTS using Cloudflare Workers AI (Deepgram Aura-1)
 * Fallback when OpenClaw TTS is not available
 */
async function generateTTSCloudflare(text, outputPath, speaker = 'luna') {
  console.log('🎙️  Generating TTS with Cloudflare Workers AI (Deepgram Aura-1)...');
  
  const TTS_WORKER_URL = 'https://dailydealfeed-tts.prtl.workers.dev';
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({ text, speaker, format: 'base64' });
    
    const req = https.request(TTS_WORKER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData),
      },
    }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          if (json.audio) {
            // Decode base64 and save as MP3
            const audioBuffer = Buffer.from(json.audio, 'base64');
            fs.writeFileSync(outputPath, audioBuffer);
            console.log(`🎙️  TTS generated with ${json.speaker} voice (${audioBuffer.length} bytes)`);
            resolve(outputPath);
          } else {
            reject(new Error(json.error || 'No audio in response'));
          }
        } catch (e) {
          reject(e);
        }
      });
    });
    
    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

/**
 * Generate voiceover audio with intelligent fallback chain:
 * 1. Pre-generated audio (if voiceover_audio provided in input)
 * 2. OpenClaw TTS cache (best quality - recommended)
 * 3. ElevenLabs API (natural voice)
 * 4. Deepgram via Cloudflare Worker (decent quality)
 * 5. espeak-ng (robotic but always works)
 */
async function generateVoiceover(input, outputPath) {
  const productId = input.product_id || 'unknown';
  logger.tts('INFO', `Starting TTS generation`, { productId, outputPath });
  
  // Check for pre-generated audio first (OpenClaw TTS path)
  const externalAudio = findExternalTTSAudio(input, TEMP_DIR);
  if (externalAudio) {
    try {
      fs.copyFileSync(externalAudio, outputPath);
      const stats = fs.statSync(outputPath);
      logger.tts('INFO', `Using pre-generated voiceover`, {
        productId,
        source: externalAudio,
        size: stats.size
      });
      console.log('🎙️  Using pre-generated voiceover (OpenClaw TTS)');
      return outputPath;
    } catch (copyErr) {
      logger.tts('ERROR', `Failed to copy pre-generated audio`, {
        productId,
        source: externalAudio,
        error: copyErr.message
      });
    }
  }
  
  // Generate voiceover text (now uses conversational scripts from script-map.json)
  const voiceoverText = getCombinedVoiceoverText(input);
  logger.tts('DEBUG', `Voiceover script generated`, { 
    productId, 
    scriptLength: voiceoverText.length,
    scriptPreview: voiceoverText.slice(0, 100)
  });
  console.log(`🎙️  Voiceover script: "${voiceoverText}"`);
  
  // TTS Provider Priority:
  // 1. OpenClaw TTS cache (best quality - recommended)
  // 2. ElevenLabs (natural voice - passes "real person" test)
  // 3. Deepgram/Cloudflare (decent quality, free tier)
  // 4. espeak-ng (robotic fallback)
  
  // Check OpenClaw TTS cache first (populated by agent)
  if (TTS_CONFIG.useOpenClawTTS) {
    try {
      const { getCachedTTS } = require('./lib/tts-openclaw');
      const cachedPath = getCachedTTS(voiceoverText);
      if (cachedPath) {
        fs.copyFileSync(cachedPath, outputPath);
        const stats = fs.statSync(outputPath);
        logger.tts('INFO', `Using cached OpenClaw TTS`, {
          productId,
          cachedPath,
          size: stats.size
        });
        console.log('🎙️  Using cached OpenClaw TTS (ElevenLabs quality)');
        return outputPath;
      }
      logger.tts('DEBUG', `OpenClaw TTS cache miss`, { productId });
      console.log('ℹ️  OpenClaw TTS not cached for this script');
    } catch (err) {
      logger.tts('WARN', `OpenClaw TTS cache check failed`, {
        productId,
        error: err.message
      });
      console.log(`⚠️  OpenClaw TTS cache check failed: ${err.message}`);
    }
  }
  
  // Try ElevenLabs direct API
  try {
    logger.tts('DEBUG', `Trying ElevenLabs API`, { productId });
    const result = await generateTTSElevenLabs(voiceoverText, outputPath, {
      voice: input.tts_voice || 'default',
      style: input.tts_style || 'energetic'
    });
    logger.tts('INFO', `ElevenLabs TTS succeeded`, { productId });
    return result;
  } catch (err) {
    logger.tts('WARN', `ElevenLabs TTS failed`, { productId, error: err.message });
    console.log(`⚠️  ElevenLabs TTS unavailable: ${err.message}`);
  }
  
  // Fallback to Cloudflare Workers AI (Deepgram Aura-1)
  try {
    logger.tts('DEBUG', `Trying Cloudflare TTS`, { productId });
    const result = await generateTTSCloudflare(voiceoverText, outputPath, 'luna');
    logger.tts('INFO', `Cloudflare TTS succeeded`, { productId });
    return result;
  } catch (err) {
    logger.tts('WARN', `Cloudflare TTS failed`, { productId, error: err.message });
    console.log(`⚠️  Cloudflare TTS failed: ${err.message}`);
  }
  
  // BLOCKED: espeak-ng produces robotic voice that destroys credibility
  // Better to fail than ship bad audio
  logger.tts('ERROR', `All quality TTS providers failed - BLOCKING video generation`, { productId });
  console.log('❌ BLOCKED: No quality TTS available. Video generation stopped to protect brand quality.');
  console.log('   → Configure ElevenLabs API key or ensure Cloudflare Workers AI is available');
  throw new Error('TTS_QUALITY_GATE: No quality TTS provider available. Refusing to use robotic espeak-ng voice.');
}

// ============================================
// VIDEO CREATION FUNCTIONS
// ============================================

// Create a solid color background video
function createBackgroundVideo(outputPath, duration) {
  ffmpeg(`-f lavfi -i color=c=${COLORS.background}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${duration} -c:v libx264 -pix_fmt yuv420p "${outputPath}"`);
}

// Convert GIF to video with proper scaling
// V9: Added preserveAudio option to keep original audio for AFV clips (hook segment)
function convertGifToVideo(inputPath, outputPath, duration, options = {}) {
  const { preserveAudio = false } = options;
  
  // Detect input type by extension
  const ext = path.extname(inputPath).toLowerCase();
  const isGif = ext === '.gif';
  const isMp4 = ext === '.mp4' || ext === '.m4v' || ext === '.mov';
  
  // Scale to fit within video dimensions, then pad to exact size
  // V11: Fixed to handle portrait clips (scaled height > 1920)
  const scaleFilter = `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=${COLORS.background}`;
  
  // Audio flag: -an strips audio, omit to keep it
  const audioFlag = preserveAudio ? '' : '-an';
  
  if (isGif) {
    // For GIFs: use loop filter (no audio to preserve)
    const filter = `${scaleFilter},loop=loop=-1:size=1000,trim=duration=${duration}`;
    ffmpeg(`-i "${inputPath}" -vf "${filter}" -c:v libx264 -pix_fmt yuv420p -an "${outputPath}"`);
  } else if (isMp4) {
    // For MP4s: use stream_loop for seamless looping, then trim
    // V9: Preserve audio if requested (for AFV clip hook)
    const filter = `${scaleFilter},trim=duration=${duration}`;
    if (preserveAudio) {
      // Keep original audio from the MP4
      ffmpeg(`-stream_loop -1 -i "${inputPath}" -vf "${filter}" -t ${duration} -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k "${outputPath}"`);
    } else {
      ffmpeg(`-stream_loop -1 -i "${inputPath}" -vf "${filter}" -t ${duration} -c:v libx264 -pix_fmt yuv420p -an "${outputPath}"`);
    }
  } else {
    // Fallback: try the GIF approach (works for most formats)
    const filter = `${scaleFilter},trim=duration=${duration}`;
    ffmpeg(`-i "${inputPath}" -vf "${filter}" -t ${duration} -c:v libx264 -pix_fmt yuv420p ${audioFlag} "${outputPath}"`);
  }
}

// Create product showcase segment with image and text
// V10: STICKER-STYLE price overlay - looks like a casual label, not PowerPoint
// Features: drop shadow, emoji, vibrant colors, slight bounce animation
function createProductSegment(imagePath, productName, price, outputPath, duration) {
  // Scale image to fit nicely (about 60% of width)
  const imgWidth = Math.floor(VIDEO_WIDTH * 0.8);
  const imgHeight = Math.floor(imgWidth * 0.75); // 4:3 aspect
  const imgY = Math.floor(VIDEO_HEIGHT * 0.20); // Higher to make room for sticker
  
  // Text positioning
  const nameY = imgY + imgHeight + 50;
  const priceY = Math.floor(VIDEO_HEIGHT * 0.76); // Bottom area for sticker
  
  const escapedName = escapeText(productName);
  const escapedPrice = escapeText(price);
  
  // Ken Burns: slow zoom in effect
  const fps = 25;
  const frames = duration * fps;
  const zoomMax = 1 + EDIT_STYLE.zoomIntensity;
  const zoomExpr = `min(1+${EDIT_STYLE.zoomIntensity}*on/${frames}\\,${zoomMax})`;
  
  // Text animations
  const textDelay = EDIT_STYLE.textDelaySeconds;
  const textFadeIn = 0.4;
  const textSlideDistance = 25;
  
  // Product name fade in
  const nameAlpha = `if(lt(t\\,${textDelay})\\,0\\,if(lt(t\\,${textDelay + textFadeIn})\\,(t-${textDelay})/${textFadeIn}\\,1))`;
  const nameYExpr = `${nameY}+${textSlideDistance}*max(0\\,1-t/${textFadeIn})`;
  
  // ============================================
  // V10: STICKER-STYLE PRICE OVERLAY
  // ============================================
  // 
  // Design principles:
  // - Drop shadow (multiple offset text layers)
  // - Vibrant gradient-feel colors (hot pink + yellow combo)
  // - Fire emoji 🔥 for urgency
  // - Bounce-in animation (scale + position)
  // - Rounded-feel box (large padding makes corners irrelevant)
  //
  // Animation timeline:
  // 0.0-0.2s: Pop in from below with overshoot
  // 0.2-0.4s: Settle to final position with slight bounce
  // 0.4s+:    Static
  
  // Sticker colors (vibrant, not corporate)
  const stickerBgColor = 'ff1493'; // Hot pink / deep pink
  const stickerTextColor = 'ffffff'; // White text
  const stickerShadowColor = '000000'; // Black shadow
  const fireEmoji = '🔥';
  
  // V11: Sticker dimensions - smaller and less intrusive
  const stickerPadH = 28; // Horizontal padding (reduced)
  const stickerPadV = 14; // Vertical padding (reduced)
  const stickerFontSize = 54; // Smaller, cleaner (was 72)
  const emojiSize = 48;
  
  // Price with emoji: "🔥 $19.95"
  const priceWithEmoji = `${fireEmoji} ${price}`;
  const escapedPriceEmoji = escapeText(priceWithEmoji);
  
  // Bounce animation for sticker (pop-in effect)
  // Y position: starts 80px below, overshoots by 10px, settles
  const bounceStart = 0.1; // When bounce starts
  const bounceDur = 0.35; // Bounce duration
  const overshoot = 12; // Pixels to overshoot
  const startOffset = 60; // Pixels below final position
  
  // Complex bounce expression:
  // t < 0.1: hidden below
  // 0.1 < t < 0.25: moving up (fast)
  // 0.25 < t < 0.35: slight overshoot bounce
  // t > 0.35: settled
  const priceYBounce = `${priceY}+if(lt(t\\,${bounceStart})\\,${startOffset}\\,` +
    `if(lt(t\\,${bounceStart + bounceDur * 0.5})\\,` +
      `${startOffset}*(1-(t-${bounceStart})/(${bounceDur * 0.5}))-${overshoot}*(t-${bounceStart})/(${bounceDur * 0.5})\\,` +
    `if(lt(t\\,${bounceStart + bounceDur})\\,` +
      `-${overshoot}*(1-(t-${bounceStart + bounceDur * 0.5})/(${bounceDur * 0.5}))\\,` +
    `0)))`;
  
  // Alpha for price sticker (quick pop-in)
  const priceAlpha = `if(lt(t\\,${bounceStart})\\,0\\,if(lt(t\\,${bounceStart + 0.1})\\,(t-${bounceStart})/0.1\\,1))`;
  
  // Shadow offset
  const shadowOffsetX = 4;
  const shadowOffsetY = 4;
  
  // Build the filter complex
  // Layer order: bg -> image -> name -> sticker shadow -> sticker bg -> sticker text
  const filter = [
    // Base background
    `color=c=${COLORS.background}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${duration}[bg]`,
    
    // Ken Burns zoom on product image
    `[1:v]scale=${imgWidth*2}:${imgHeight*2}:force_original_aspect_ratio=decrease,zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${imgWidth}x${imgHeight}:fps=${fps}[img]`,
    `[bg][img]overlay=(W-w)/2:${imgY}[v1]`,
    
    // Product name (subtle, smaller)
    `[v1]drawtext=fontfile=${FONT_PATH}:text='${escapedName}':fontsize=44:fontcolor=${COLORS.textSecondary}:x=(w-text_w)/2:y='${nameYExpr}':alpha='${nameAlpha}'[v2]`,
    
    // === STICKER LAYER 1: Drop shadow (offset dark box) - V11: smaller box ===
    `[v2]drawbox=x='(w-280)/2+${shadowOffsetX}':y='${priceY}-18+${shadowOffsetY}+if(lt(t\\,${bounceStart})\\,${startOffset}\\,if(lt(t\\,${bounceStart+bounceDur})\\,${startOffset}*(1-((t-${bounceStart})/${bounceDur}))\\,0))':w=280:h=70:color=${stickerShadowColor}@0.4:t=fill[v3]`,
    
    // === STICKER LAYER 2: Main background (vibrant pink) - V11: smaller, with subtle rounded feel ===
    `[v3]drawbox=x='(w-280)/2':y='${priceY}-18+if(lt(t\\,${bounceStart})\\,${startOffset}\\,if(lt(t\\,${bounceStart+bounceDur})\\,${startOffset}*(1-((t-${bounceStart})/${bounceDur}))\\,0))':w=280:h=70:color=${stickerBgColor}:t=fill[v4]`,
    
    // === STICKER LAYER 3: Text shadow (subtle depth) - V11 uses stickerFontSize variable ===
    `[v4]drawtext=fontfile=${FONT_PATH}:text='${escapedPriceEmoji}':fontsize=${stickerFontSize}:fontcolor=${stickerShadowColor}@0.5:x=(w-text_w)/2+2:y='${priceYBounce}+2':alpha='${priceAlpha}'[v5]`,
    
    // === STICKER LAYER 4: Main price text (white on pink) - V11 uses stickerFontSize variable ===
    `[v5]drawtext=fontfile=${FONT_PATH}:text='${escapedPriceEmoji}':fontsize=${stickerFontSize}:fontcolor=${stickerTextColor}:x=(w-text_w)/2:y='${priceYBounce}':alpha='${priceAlpha}'`
  ].join(';');
  
  ffmpeg(`-f lavfi -i "color=c=${COLORS.background}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${duration}" -i "${imagePath}" -filter_complex "${filter}" -c:v libx264 -pix_fmt yuv420p -t ${duration} "${outputPath}"`);
}

// V11: Create product showcase from Amazon screen recording with price sticker overlay
function createProductSegmentFromVideo(videoPath, productName, price, outputPath, duration) {
  const escapedName = escapeText(productName);
  const escapedPrice = escapeText(price);
  
  // V10-style sticker colors
  const stickerBgColor = 'ff1493'; // Hot pink
  const stickerTextColor = 'ffffff'; // White
  const stickerShadowColor = '000000'; // Black shadow
  const fireEmoji = '🔥';
  
  // Price with emoji
  const priceWithEmoji = `${fireEmoji} ${price}`;
  const escapedPriceEmoji = escapeText(priceWithEmoji);
  
  // Positioning
  const nameY = Math.floor(VIDEO_HEIGHT * 0.12); // Top area for name
  const priceY = Math.floor(VIDEO_HEIGHT * 0.76); // Bottom area for sticker
  
  // Bounce animation timing
  const bounceStart = 0.1;
  const bounceDur = 0.35;
  const startOffset = 60;
  
  // Text animations
  const textDelay = EDIT_STYLE.textDelaySeconds || 0.15;
  const textFadeIn = 0.4;
  
  // Name fade in
  const nameAlpha = `if(lt(t\\,${textDelay})\\,0\\,if(lt(t\\,${textDelay + textFadeIn})\\,(t-${textDelay})/${textFadeIn}\\,1))`;
  
  // Price sticker alpha
  const priceAlpha = `if(lt(t\\,${bounceStart})\\,0\\,if(lt(t\\,${bounceStart + 0.1})\\,(t-${bounceStart})/0.1\\,1))`;
  
  // Price sticker Y position with bounce
  const priceYBounce = `${priceY}+if(lt(t\\,${bounceStart})\\,${startOffset}\\,` +
    `if(lt(t\\,${bounceStart + bounceDur})\\,${startOffset}*(1-((t-${bounceStart})/${bounceDur}))\\,0))`;
  
  // Shadow offset
  const shadowOffsetX = 4;
  const shadowOffsetY = 4;
  
  // Build filter: scale video to fit, add overlays
  const filter = [
    // Scale and pad Amazon recording to 9:16
    `scale=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=${COLORS.background}`,
    
    // Product name (top, subtle)
    `drawtext=fontfile=${FONT_PATH}:text='${escapedName}':fontsize=44:fontcolor=${COLORS.textSecondary}:x=(w-text_w)/2:y=${nameY}:alpha='${nameAlpha}'`,
    
    // Sticker shadow box - V11: smaller, cleaner
    `drawbox=x='(w-280)/2+${shadowOffsetX}':y='${priceY}-18+${shadowOffsetY}+if(lt(t\\,${bounceStart})\\,${startOffset}\\,if(lt(t\\,${bounceStart+bounceDur})\\,${startOffset}*(1-((t-${bounceStart})/${bounceDur}))\\,0))':w=280:h=70:color=${stickerShadowColor}@0.4:t=fill`,
    
    // Sticker background (pink) - V11: smaller
    `drawbox=x='(w-280)/2':y='${priceY}-18+if(lt(t\\,${bounceStart})\\,${startOffset}\\,if(lt(t\\,${bounceStart+bounceDur})\\,${startOffset}*(1-((t-${bounceStart})/${bounceDur}))\\,0))':w=280:h=70:color=${stickerBgColor}:t=fill`,
    
    // Price text shadow - V11: smaller font
    `drawtext=fontfile=${FONT_PATH}:text='${escapedPriceEmoji}':fontsize=54:fontcolor=${stickerShadowColor}@0.5:x=(w-text_w)/2+2:y='${priceYBounce}+2':alpha='${priceAlpha}'`,
    
    // Price text (white on pink) - V11: smaller font
    `drawtext=fontfile=${FONT_PATH}:text='${escapedPriceEmoji}':fontsize=54:fontcolor=${stickerTextColor}:x=(w-text_w)/2:y='${priceYBounce}':alpha='${priceAlpha}'`
  ].join(',');
  
  ffmpeg(`-i "${videoPath}" -vf "${filter}" -t ${duration} -c:v libx264 -pix_fmt yuv420p -an "${outputPath}"`);
}

// Create CTA segment with animated text
function createCTASegment(outputPath, duration) {
  const ctaText = 'Link in bio';
  const subText = 'Shop now →';
  
  const ctaY = Math.floor(VIDEO_HEIGHT * 0.4);
  const subY = ctaY + 120;
  
  const escapedCta = escapeText(ctaText);
  const escapedSub = escapeText(subText);
  
  // Animation: delayed fade + slide for organic feel
  const textDelay = EDIT_STYLE.textDelaySeconds;
  const fadeIn = 0.35; // Slightly faster
  const slideDistance = 30; // Subtler slide
  
  // CTA text: delay then fade in with slide up
  const ctaAlpha = `if(lt(t\\,${textDelay})\\,0\\,if(lt(t\\,${textDelay + fadeIn})\\,(t-${textDelay})/${fadeIn}\\,1))`;
  const ctaYExpr = `${ctaY}+${slideDistance}*max(0\\,1-(t-${textDelay})/${fadeIn})`;
  
  // Sub text: additional delay after CTA
  const subDelay = textDelay + 0.25;
  const subAlpha = `if(lt(t\\,${subDelay})\\,0\\,if(lt(t\\,${subDelay + fadeIn})\\,(t-${subDelay})/${fadeIn}\\,1))`;
  const subYExpr = `${subY}+${slideDistance}*max(0\\,1-(t-${subDelay})/${fadeIn})`;
  
  const filter = [
    `drawtext=fontfile=${FONT_PATH}:text='${escapedCta}':fontsize=96:fontcolor=${COLORS.textPrimary}:x=(w-text_w)/2:y='${ctaYExpr}':alpha='${ctaAlpha}'`,
    `drawtext=fontfile=${FONT_PATH}:text='${escapedSub}':fontsize=48:fontcolor=${COLORS.accent}:x=(w-text_w)/2:y='${subYExpr}':alpha='${subAlpha}'`
  ].join(',');
  
  ffmpeg(`-f lavfi -i "color=c=${COLORS.ctaBackground}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${duration}" -vf "${filter}" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`);
}

// Concatenate video segments (hard cut)
// V9: Added preserveFirstAudio option to keep hook audio
function concatenateVideos(inputPaths, outputPath, options = {}) {
  const { preserveFirstAudio = false } = options;
  
  // Create concat file
  const concatFile = path.join(TEMP_DIR, 'concat.txt');
  const content = inputPaths.map(p => `file '${p}'`).join('\n');
  fs.writeFileSync(concatFile, content);
  
  if (preserveFirstAudio) {
    // V9: Preserve audio from first input (hook segment)
    ffmpeg(`-f concat -safe 0 -i "${concatFile}" -c:v libx264 -pix_fmt yuv420p -c:a aac -b:a 128k "${outputPath}"`);
  } else {
    ffmpeg(`-f concat -safe 0 -i "${concatFile}" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`);
  }
}

// Concatenate video segments with crossfade transitions (smoother flow)
// V9: Added preserveFirstAudio option to keep hook audio
function concatenateVideosWithCrossfade(inputPaths, outputPath, crossfadeDuration = 0.3, options = {}) {
  const { preserveFirstAudio = false } = options;
  
  if (inputPaths.length < 2) {
    return concatenateVideos(inputPaths, outputPath, { preserveFirstAudio });
  }
  
  try {
    // Use xfade filter for smooth transitions between clips
    // Important: Normalize all inputs to same framerate (25fps) for xfade to work
    const inputs = inputPaths.map(p => `-i "${p}"`).join(' ');
    
    if (inputPaths.length === 3) {
      // Three clips: hook, product, cta
      const getDuration = (filePath) => {
        try {
          const result = execSync(
            `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
            { encoding: 'utf8' }
          );
          return parseFloat(result.trim()) || 3;
        } catch (e) {
          return 3;
        }
      };
      
      const dur0 = getDuration(inputPaths[0]);
      const dur1 = getDuration(inputPaths[1]);
      
      // Offsets for xfade
      const offset1 = Math.max(0.5, dur0 - crossfadeDuration);
      const offset2 = Math.max(1, offset1 + dur1 - crossfadeDuration);
      
      // V9: Build filter - video xfade + optional audio preservation
      let filter;
      let audioMapping = '';
      
      if (preserveFirstAudio) {
        // Normalize all video streams to 25fps with settb, then xfade
        // Also pad audio from first input to cover full duration
        // Audio from inputs 1 and 2 are silenced (they're product/CTA with no audio)
        const totalDuration = dur0 + dur1 + getDuration(inputPaths[2]) - 2 * crossfadeDuration;
        filter = [
          `[0:v]fps=25,settb=1/25[v0]`,
          `[1:v]fps=25,settb=1/25[v1]`,
          `[2:v]fps=25,settb=1/25[v2]`,
          `[v0][v1]xfade=transition=fade:duration=${crossfadeDuration}:offset=${offset1}[v01]`,
          `[v01][v2]xfade=transition=fade:duration=${crossfadeDuration}:offset=${offset2}[vout]`,
          // Pad audio from hook to cover video duration (silence after hook)
          `[0:a]apad=whole_dur=${totalDuration}[aout]`
        ].join(';');
        audioMapping = '-map "[aout]" -c:a aac -b:a 128k';
      } else {
        filter = [
          `[0:v]fps=25,settb=1/25[v0]`,
          `[1:v]fps=25,settb=1/25[v1]`,
          `[2:v]fps=25,settb=1/25[v2]`,
          `[v0][v1]xfade=transition=fade:duration=${crossfadeDuration}:offset=${offset1}[v01]`,
          `[v01][v2]xfade=transition=fade:duration=${crossfadeDuration}:offset=${offset2}[vout]`
        ].join(';');
      }
      
      ffmpeg(`${inputs} -filter_complex "${filter}" -map "[vout]" ${audioMapping} -c:v libx264 -pix_fmt yuv420p "${outputPath}"`);
      console.log(`✅ Crossfade applied (${crossfadeDuration}s fade between segments)${preserveFirstAudio ? ' with hook audio' : ''}`);
    } else {
      concatenateVideos(inputPaths, outputPath, { preserveFirstAudio });
    }
  } catch (err) {
    console.log(`⚠️  Crossfade failed, falling back to hard cut: ${err.message}`);
    concatenateVideos(inputPaths, outputPath, { preserveFirstAudio });
  }
}

// Generate thumbnail from video
function generateThumbnail(videoPath, outputPath, timeOffset = 5) {
  ffmpeg(`-i "${videoPath}" -ss ${timeOffset} -vframes 1 -q:v 2 "${outputPath}"`);
}

// Add hook text overlay to video with subtle camera shake for energy
function addHookText(inputPath, outputPath, hookText) {
  const hookY = Math.floor(VIDEO_HEIGHT * 0.1);
  const escapedHook = escapeText(hookText);
  
  // Subtle camera shake: small random-ish displacement using sin waves at different frequencies
  // REDUCED for more organic feel - less "produced"
  const shakeIntensity = EDIT_STYLE.shakeIntensity; // pixels of shake (reduced from 4)
  const shakeX = `${shakeIntensity}*sin(t*15)*sin(t*7)`;
  const shakeY = `${shakeIntensity}*sin(t*12)*cos(t*9)`;
  
  // Text fade-in: delayed to appear AFTER audio (TikTok pattern)
  const textDelay = EDIT_STYLE.textDelaySeconds;
  const fadeIn = 0.35;
  const slideDistance = 20; // Subtler slide
  const textAlpha = `if(lt(t\\,${textDelay})\\,0\\,if(lt(t\\,${textDelay + fadeIn})\\,(t-${textDelay})/${fadeIn}\\,1))`;
  const textY = `${hookY}+${slideDistance}*max(0\\,1-(t-${textDelay})/${fadeIn})`;
  
  // Apply shake via crop/pad (slight overscan then offset)
  // First scale up slightly, then crop with shake offset
  const filter = [
    // Scale up 2% to give room for shake
    `scale=${Math.floor(VIDEO_WIDTH * 1.02)}:${Math.floor(VIDEO_HEIGHT * 1.02)}`,
    // Crop back to original size with shake offset
    `crop=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:${Math.floor(VIDEO_WIDTH * 0.01)}+${shakeX}:${Math.floor(VIDEO_HEIGHT * 0.01)}+${shakeY}`,
    // Add text with fade-in and slide
    `drawtext=fontfile=${FONT_PATH}:text='${escapedHook}':fontsize=48:fontcolor=${COLORS.textPrimary}:x=(w-text_w)/2:y='${textY}':alpha='${textAlpha}'`
  ].join(',');
  
  ffmpeg(`-i "${inputPath}" -vf "${filter}" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`);
}

// ============================================
// PROGRESS BAR OVERLAY
// ============================================

/**
 * Add a thin progress bar at the bottom of the video
 * Shows viewing progress - very TikTok native
 */
function addProgressBar(inputPath, outputPath, duration) {
  const barHeight = 4; // thin progress bar
  const barY = VIDEO_HEIGHT - barHeight - 20; // 20px from bottom
  const barColor = COLORS.accent; // accent color
  
  // Progress bar width grows from 0 to VIDEO_WIDTH over duration
  // Using drawbox with dynamic width
  const filter = [
    // Draw background bar (subtle gray)
    `drawbox=x=0:y=${barY}:w=${VIDEO_WIDTH}:h=${barHeight}:color=333333@0.5:t=fill`,
    // Draw progress bar (grows with time)
    `drawbox=x=0:y=${barY}:w='${VIDEO_WIDTH}*t/${duration}':h=${barHeight}:color=${barColor}@0.9:t=fill`
  ].join(',');
  
  ffmpeg(`-i "${inputPath}" -vf "${filter}" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`);
}

// ============================================
// AUDIO MIXING
// ============================================

/**
 * Mix voiceover audio with video
 * V9: Now supports delaying voiceover to start after hook segment
 * 
 * @param {string} videoPath - Path to the video file (may have audio from hook)
 * @param {string} audioPath - Path to the voiceover audio
 * @param {string} outputPath - Path for the output video with audio
 * @param {Object} options - Mixing options
 * @param {number} options.voiceoverDelay - Delay voiceover start by N seconds (default: 0)
 * @param {boolean} options.keepOriginalAudio - Mix with existing video audio (default: false)
 */
function mixAudioWithVideo(videoPath, audioPath, outputPath, options = {}) {
  const { voiceoverDelay = 0, keepOriginalAudio = false } = options;
  
  console.log('🔊 Mixing voiceover with video...');
  
  const audioDuration = getAudioDuration(audioPath);
  console.log(`   Voiceover duration: ${audioDuration.toFixed(2)}s`);
  console.log(`   Voiceover delay: ${voiceoverDelay.toFixed(2)}s (starts when product shows)`);
  
  // Calculate delay in milliseconds for adelay filter
  const delayMs = Math.round(voiceoverDelay * 1000);
  
  try {
    if (keepOriginalAudio) {
      // V9: Mix voiceover with original audio from hook segment
      // - Original audio plays for first N seconds (hook)
      // - Voiceover starts after delay (when product shows)
      // - After delay: original audio fades, voiceover takes over
      console.log('   Mixing: Hook audio + delayed voiceover');
      
      // Complex filter:
      // [1:a] = voiceover, delay it by hookDuration
      // [0:a] = original audio from video (hook), fade it out at hook end
      // Then amix them together
      const fadeOutStart = Math.max(0, voiceoverDelay - 0.5); // Start fade 0.5s before voiceover
      const fadeOutDur = 0.5;
      
      ffmpeg(
        `-i "${videoPath}" -i "${audioPath}" ` +
        `-filter_complex "` +
        `[0:a]afade=t=out:st=${fadeOutStart}:d=${fadeOutDur}[orig];` +
        `[1:a]adelay=${delayMs}|${delayMs},volume=1.5,apad[vo];` +
        `[orig][vo]amix=inputs=2:duration=longest:dropout_transition=2[aout]" ` +
        `-map 0:v -map "[aout]" ` +
        `-c:v copy -c:a aac -b:a 192k ` +
        `-shortest "${outputPath}"`
      );
    } else {
      // Simple case: just add delayed voiceover (no original audio to preserve)
      ffmpeg(
        `-i "${videoPath}" -i "${audioPath}" ` +
        `-filter_complex "[1:a]adelay=${delayMs}|${delayMs},volume=1.5,apad[a]" ` +
        `-map 0:v -map "[a]" ` +
        `-c:v copy -c:a aac -b:a 192k ` +
        `-shortest "${outputPath}"`
      );
    }
    return true;
  } catch (err) {
    console.error('Audio mixing failed:', err.message);
    
    // Fallback: Simple audio overlay with delay
    try {
      console.log('   Trying simpler approach with delay...');
      ffmpeg(
        `-i "${videoPath}" -i "${audioPath}" ` +
        `-filter_complex "[1:a]adelay=${delayMs}|${delayMs}[a]" ` +
        `-map 0:v -map "[a]" ` +
        `-c:v copy -c:a aac -b:a 128k ` +
        `-shortest "${outputPath}"`
      );
      return true;
    } catch (err2) {
      console.error('Simple audio mixing also failed:', err2.message);
      return false;
    }
  }
}

// ============================================
// BACKGROUND MUSIC
// ============================================

/**
 * Get list of available music tracks
 */
function getAvailableMusicTracks() {
  if (!fs.existsSync(MUSIC_DIR)) {
    console.log('⚠️  Music directory not found, creating...');
    fs.mkdirSync(MUSIC_DIR, { recursive: true });
    return [];
  }
  
  const files = fs.readdirSync(MUSIC_DIR);
  const musicFiles = files.filter(f => 
    f.endsWith('.mp3') || f.endsWith('.wav') || f.endsWith('.m4a')
  );
  
  return musicFiles.map(f => path.join(MUSIC_DIR, f));
}

/**
 * Music Vibe Mapping - Maps product characteristics to appropriate tracks
 * 
 * Track vibes:
 *   track01_boogie_funk: Fun/novelty products - groovy, playful, retro
 *   track02_crazy_train: Action/sports items - high energy, driving
 *   track03_born_norilsk: General products - upbeat, professional
 *   track04_upbeat_corporate: Tech/business products - modern, clean
 *   track05_dynamic_healing: Lifestyle/wellness items - calm, ambient
 */
const MUSIC_VIBE_MAP = {
  // Track -> vibe keywords and categories
  'track01_boogie_funk.mp3': {
    vibes: ['fun', 'novelty', 'playful', 'quirky', 'retro', 'groovy', 'funky'],
    categories: ['toys', 'games', 'party', 'novelty', 'gifts', 'kitchen-fun'],
    keywords: ['waffle', 'mini', 'cute', 'fun', 'colorful', 'quirky', 'dash', 'funny']
  },
  'track02_crazy_train.mp3': {
    vibes: ['energetic', 'action', 'intense', 'powerful', 'sports', 'workout'],
    categories: ['sports', 'outdoor', 'fitness', 'tools', 'automotive'],
    keywords: ['power', 'strong', 'workout', 'sports', 'outdoor', 'action', 'tough']
  },
  'track03_born_norilsk.mp3': {
    vibes: ['upbeat', 'general', 'professional', 'versatile', 'positive'],
    categories: ['home', 'kitchen', 'cleaning', 'general'],
    keywords: ['clean', 'pink stuff', 'bissell', 'home', 'household', 'practical']
  },
  'track04_upbeat_corporate.mp3': {
    vibes: ['modern', 'tech', 'clean', 'professional', 'sleek', 'corporate'],
    categories: ['tech', 'electronics', 'office', 'gadgets', 'smart'],
    keywords: ['tech', 'smart', 'digital', 'electronic', 'usb', 'bluetooth', 'led', 'phone']
  },
  'track05_dynamic_healing.mp3': {
    vibes: ['calm', 'wellness', 'ambient', 'relaxing', 'cozy', 'soothing', 'lifestyle'],
    categories: ['beauty', 'skincare', 'wellness', 'sleep', 'self-care', 'spa'],
    keywords: ['cream', 'moisturizer', 'skincare', 'relax', 'cozy', 'moon', 'night', 'sleep', 'cerave', 'neutrogena', 'spf', 'sunscreen', 'lamp']
  }
};

/**
 * Select music track by product vibe matching
 * @param {Object} input - Product input data
 * @returns {string|null} - Path to selected music track
 */
function selectMusicByVibe(input) {
  const tracks = getAvailableMusicTracks();
  
  if (tracks.length === 0) {
    console.log('⚠️  No background music tracks found in music/ folder');
    return null;
  }
  
  // Extract matching context from input
  const productName = (input.product_name || '').toLowerCase();
  const hookAngle = (input.hook_angle || '').toLowerCase();
  const category = (input.category || input.product_category || '').toLowerCase();
  const vibe = (input.music_vibe || '').toLowerCase();
  const fullText = `${productName} ${hookAngle} ${category} ${vibe}`;
  
  // Score each track based on matches
  let bestTrack = null;
  let bestScore = 0;
  
  for (const [trackName, config] of Object.entries(MUSIC_VIBE_MAP)) {
    let score = 0;
    
    // Check explicit vibe match
    if (vibe && config.vibes.some(v => vibe.includes(v))) {
      score += 10;
    }
    
    // Check category match
    if (category && config.categories.some(c => category.includes(c))) {
      score += 8;
    }
    
    // Check keyword matches in product name and hook
    for (const keyword of config.keywords) {
      if (fullText.includes(keyword)) {
        score += 3;
      }
    }
    
    // Check vibe keywords in hook angle
    for (const vibeWord of config.vibes) {
      if (hookAngle.includes(vibeWord)) {
        score += 2;
      }
    }
    
    if (score > bestScore) {
      bestScore = score;
      bestTrack = trackName;
    }
  }
  
  // Find the full path for the selected track
  let selectedPath = null;
  if (bestTrack && bestScore > 0) {
    selectedPath = tracks.find(t => t.endsWith(bestTrack));
    console.log(`🎵 Music matched by vibe: ${bestTrack} (score: ${bestScore})`);
  }
  
  // Fallback to random if no good match
  if (!selectedPath) {
    selectedPath = tracks[Math.floor(Math.random() * tracks.length)];
    console.log(`🎵 Music (random fallback): ${path.basename(selectedPath)}`);
  }
  
  return selectedPath;
}

/**
 * Select a random music track (legacy fallback)
 */
function selectRandomMusicTrack() {
  const tracks = getAvailableMusicTracks();
  
  if (tracks.length === 0) {
    console.log('⚠️  No background music tracks found in music/ folder');
    return null;
  }
  
  const selected = tracks[Math.floor(Math.random() * tracks.length)];
  console.log(`🎵 Selected background music: ${path.basename(selected)}`);
  return selected;
}

/**
 * Mix background music with video (under voiceover)
 * @param {string} videoPath - Video with voiceover
 * @param {string} musicPath - Background music track
 * @param {string} outputPath - Output video path
 * @param {number} duration - Video duration in seconds
 */
function mixBackgroundMusic(videoPath, musicPath, outputPath, duration) {
  console.log('🎵 Adding background music...');
  
  const vol = MUSIC_CONFIG.volume;
  const fadeIn = MUSIC_CONFIG.fadeIn;
  const fadeOut = MUSIC_CONFIG.fadeOut;
  
  try {
    // Complex filter:
    // 1. Loop music to cover video duration
    // 2. Trim to video duration
    // 3. Apply volume (20%)
    // 4. Apply fade in/out
    // 5. Mix with existing audio (voiceover)
    const filter = [
      // Music processing: loop, trim, volume, fade
      `[1:a]aloop=loop=-1:size=44100*30,atrim=duration=${duration},` +
      `volume=${vol},` +
      `afade=t=in:st=0:d=${fadeIn},` +
      `afade=t=out:st=${duration - fadeOut}:d=${fadeOut}[music]`,
      // Mix voiceover (original) with music
      `[0:a][music]amix=inputs=2:duration=first:dropout_transition=2[aout]`
    ].join(';');
    
    ffmpeg(
      `-i "${videoPath}" -i "${musicPath}" ` +
      `-filter_complex "${filter}" ` +
      `-map 0:v -map "[aout]" ` +
      `-c:v copy -c:a aac -b:a 192k ` +
      `-shortest "${outputPath}"`
    );
    
    console.log(`✅ Background music added at ${Math.round(vol * 100)}% volume`);
    return true;
  } catch (err) {
    console.error(`⚠️  Background music mixing failed: ${err.message}`);
    return false;
  }
}

/**
 * Mix background music with silent video (no voiceover)
 * @param {string} videoPath - Silent video
 * @param {string} musicPath - Background music track
 * @param {string} outputPath - Output video path
 * @param {number} duration - Video duration in seconds
 */
function addMusicToSilentVideo(videoPath, musicPath, outputPath, duration) {
  console.log('🎵 Adding background music to silent video...');
  
  const vol = 0.4; // Higher volume for music-only, but not overwhelming (was 0.5)
  const fadeIn = MUSIC_CONFIG.fadeIn;
  const fadeOut = MUSIC_CONFIG.fadeOut;
  
  try {
    const filter = [
      `aloop=loop=-1:size=44100*30,atrim=duration=${duration},` +
      `volume=${vol},` +
      `afade=t=in:st=0:d=${fadeIn},` +
      `afade=t=out:st=${duration - fadeOut}:d=${fadeOut}`
    ].join('');
    
    ffmpeg(
      `-i "${videoPath}" -i "${musicPath}" ` +
      `-filter_complex "[1:a]${filter}[aout]" ` +
      `-map 0:v -map "[aout]" ` +
      `-c:v copy -c:a aac -b:a 192k ` +
      `-shortest "${outputPath}"`
    );
    
    console.log(`✅ Music added at ${Math.round(vol * 100)}% volume`);
    return true;
  } catch (err) {
    console.error(`⚠️  Music mixing failed: ${err.message}`);
    return false;
  }
}

// ============================================
// MAIN EDITOR FUNCTION
// ============================================

async function editVideo(input) {
  const editStartTime = Date.now();
  const productId = input.product_id || 'unknown';
  const asin = input.product_asin || 'unknown';
  
  logger.editor('INFO', `Starting video assembly`, {
    productId,
    productName: input.product_name,
    asin,
    hasClipLocalPath: !!input.clip_local_path,
    hasVoiceoverAudio: !!input.voiceover_audio
  });
  
  console.log(`\n🎬 Editor: Starting video assembly for "${input.product_name}"`);
  
  ensureDirs();
  
  const timestamp = Date.now();
  
  // Define output paths
  const videoFilename = `video_${productId}_${timestamp}.mp4`;
  const thumbFilename = `thumb_${productId}_${timestamp}.jpg`;
  const postFilename = `post_${productId}_${timestamp}.json`;
  
  const videoPath = path.join(OUTPUT_DIR, videoFilename);
  const thumbPath = path.join(OUTPUT_DIR, thumbFilename);
  const postPath = path.join(OUTPUT_DIR, postFilename);
  
  // Temp files
  // Use proper extension based on input source
  const memeExt = input.clip_local_path ? path.extname(input.clip_local_path) : '.gif';
  const tempMeme = path.join(TEMP_DIR, `meme_${timestamp}${memeExt}`);
  const tempProduct = path.join(TEMP_DIR, `product_${timestamp}.jpg`);
  const tempHook = path.join(TEMP_DIR, `hook_${timestamp}.mp4`);
  const tempHookText = path.join(TEMP_DIR, `hook_text_${timestamp}.mp4`);
  const tempShowcase = path.join(TEMP_DIR, `showcase_${timestamp}.mp4`);
  const tempCTA = path.join(TEMP_DIR, `cta_${timestamp}.mp4`);
  const tempConcat = path.join(TEMP_DIR, `concat_${timestamp}.mp4`);
  const tempVoiceover = path.join(TEMP_DIR, `voiceover_${timestamp}.mp3`);
  const tempVideoNoAudio = path.join(TEMP_DIR, `video_noaudio_${timestamp}.mp4`);
  const tempVideoWithVO = path.join(TEMP_DIR, `video_vo_${timestamp}.mp4`);
  const tempWithProgress = path.join(TEMP_DIR, `progress_${timestamp}.mp4`);
  
  try {
    // Step 0: Generate voiceover FIRST to determine dynamic timing
    console.log('🎙️  Generating voiceover (for dynamic timing)...');
    const voiceoverPath = await generateVoiceover(input, tempVoiceover);
    
    // Calculate dynamic timing based on voiceover length
    let hookDuration = DEFAULT_HOOK_DURATION;
    let productDuration = DEFAULT_PRODUCT_DURATION;
    let ctaDuration = DEFAULT_CTA_DURATION;
    let totalDuration = DEFAULT_HOOK_DURATION + DEFAULT_PRODUCT_DURATION + DEFAULT_CTA_DURATION;
    
    if (voiceoverPath && fs.existsSync(voiceoverPath)) {
      const audioDuration = getAudioDuration(voiceoverPath);
      if (audioDuration > 0) {
        const timing = calculateDynamicTiming(audioDuration);
        hookDuration = timing.hookDuration;
        productDuration = timing.productDuration;
        ctaDuration = timing.ctaDuration;
        totalDuration = timing.totalDuration;
      }
    }
    
    console.log(`📐 Final timing: ${totalDuration}s total (${hookDuration}+${productDuration}+${ctaDuration})`);
    
    // V12: Check for Amazon screen recording FIRST - REQUIRED (no static image fallback)
    let amazonRecording = null;
    let productAsin = input.product_asin || null;
    
    // Try to get ASIN from input first, then fallback to products.json
    if (!productAsin) {
      try {
        const productsPath = path.join(SCRIPT_DIR, '..', 'products.json');
        if (fs.existsSync(productsPath)) {
          const productsData = JSON.parse(fs.readFileSync(productsPath, 'utf8'));
          const product = productsData.products.find(p => p.id === String(productId));
          if (product && product.asin) {
            productAsin = product.asin;
          }
        }
      } catch (e) {
        console.log(`⚠️  Could not check products.json for ASIN: ${e.message}`);
      }
    }
    
    // Check if Amazon recording already exists
    if (productAsin) {
      const amazonPath = path.join(OUTPUT_DIR, `amazon_${productAsin}.mp4`);
      if (fs.existsSync(amazonPath)) {
        amazonRecording = amazonPath;
        console.log(`📱 Found Amazon recording: ${amazonPath}`);
      }
    }
    
    // V12: Generate Amazon recording if missing (REQUIRED - no static fallback)
    if (!amazonRecording && productAsin) {
      console.log(`📱 Amazon recording missing for ${productAsin}, generating...`);
      try {
        const amazonPath = path.join(OUTPUT_DIR, `amazon_${productAsin}.mp4`);
        await recordAmazonProduct(productAsin, { outputPath: amazonPath });
        if (fs.existsSync(amazonPath)) {
          amazonRecording = amazonPath;
          console.log(`✅ Generated Amazon recording: ${amazonPath}`);
        }
      } catch (e) {
        console.log(`❌ Failed to generate Amazon recording: ${e.message}`);
      }
    }
    
    // V13: Allow static product images as fallback (per feedback - screenshots > video recording)
    // Amazon recording is preferred but not required
    let useStaticFallback = false;
    if (!amazonRecording) {
      console.log(`⚠️ No Amazon recording for product ${productId} - using static image fallback`);
      useStaticFallback = true;
    }
    
    // Step 1: Download assets
    console.log('📥 Downloading meme/clip...');
    // Prefer local cached clip if available
    if (input.clip_local_path && fs.existsSync(input.clip_local_path)) {
      console.log(`✓ Using cached clip: ${input.clip_local_path}`);
      fs.copyFileSync(input.clip_local_path, tempMeme);
    } else {
      await downloadFile(input.meme_url, tempMeme);
    }
    
    // V13: Download product image if using static fallback
    if (useStaticFallback) {
      console.log('📷 Downloading product image for static fallback...');
      try {
        await downloadFile(input.product_image_url || input.product_image, tempProduct);
        console.log('✅ Product image downloaded');
      } catch (e) {
        console.log(`⚠️ Could not download product image: ${e.message}`);
      }
    } else {
      console.log('📱 Using Amazon mobile UI recording');
    }
    
    // Step 2: Create hook segment (clip only, no text) - V8 SIMPLIFIED
    // V8: REMOVED hook text overlay - gets cut off in 9:16 portrait mode
    // V9: PRESERVE original audio from AFV clip for hook segment!
    console.log('🎣 Creating hook segment (clip with ORIGINAL AUDIO)...');
    const isVideoClip = tempMeme.endsWith('.mp4') || tempMeme.endsWith('.m4v') || tempMeme.endsWith('.mov');
    convertGifToVideo(tempMeme, tempHook, hookDuration, { preserveAudio: isVideoClip });
    // V8: Hook text overlay REMOVED - was causing cutoff issues in portrait
    // addHookText(tempHook, tempHookText, input.hook_angle || 'Check this out');
    // Use hook clip directly without text overlay
    fs.copyFileSync(tempHook, tempHookText); // Keep downstream paths working
    
    // Step 3: Create product showcase segment - DYNAMIC DURATION
    // V13: Use Amazon recording if available, otherwise use static image
    if (amazonRecording && !useStaticFallback) {
      console.log('📦 Creating product showcase from Amazon mobile UI recording...');
      createProductSegmentFromVideo(
        amazonRecording,
        input.product_name,
        input.product_price || '$??',
        tempShowcase,
        productDuration
      );
    } else {
      console.log('📦 Creating product showcase from static image (fallback)...');
      createProductSegment(
        tempProduct,
        input.product_name,
        input.product_price || '$??',
        tempShowcase,
        productDuration
      );
    }
    
    // Step 4: Create CTA segment - DYNAMIC DURATION
    console.log('📢 Creating CTA segment...');
    createCTASegment(tempCTA, ctaDuration);
    
    // Step 5: Concatenate all segments with crossfade transitions
    // V9: Preserve audio from hook segment (first input) if it's a video clip
    console.log('🔗 Concatenating segments...');
    if (EDIT_STYLE.crossfadeDuration > 0) {
      concatenateVideosWithCrossfade([tempHookText, tempShowcase, tempCTA], tempConcat, EDIT_STYLE.crossfadeDuration, { preserveFirstAudio: isVideoClip });
    } else {
      concatenateVideos([tempHookText, tempShowcase, tempCTA], tempConcat, { preserveFirstAudio: isVideoClip });
    }
    
    // Step 6: Progress bar overlay (optional - disabled for organic feel)
    if (EDIT_STYLE.progressBarEnabled) {
      console.log('📊 Adding progress bar...');
      addProgressBar(tempConcat, tempWithProgress, totalDuration);
    } else {
      console.log('📊 Progress bar disabled (organic mode)');
      fs.copyFileSync(tempConcat, tempWithProgress);
    }
    
    // Step 8: Final encoding with voiceover and background music
    console.log('🎥 Final encoding...');
    
    // Select background music track (vibe-matched to product)
    const musicTrack = MUSIC_CONFIG.enabled ? selectMusicByVibe(input) : null;
    let hasBackgroundMusic = false;
    
    // V9: Check if hook clip has original audio that we need to preserve
    const hookHasAudio = isVideoClip; // MP4/video clips have audio to preserve
    
    if (voiceoverPath && fs.existsSync(voiceoverPath)) {
      // V9: Keep original audio from concatenated video (hook segment has audio)
      // Don't strip audio with -an if hook has original audio
      if (hookHasAudio) {
        console.log('🔊 Preserving hook audio, video already has audio track...');
        ffmpeg(`-i "${tempWithProgress}" -c:v libx264 -preset medium -b:v 2M -maxrate 3M -bufsize 4M -pix_fmt yuv420p -movflags +faststart -c:a copy "${tempVideoNoAudio}"`);
      } else {
        ffmpeg(`-i "${tempWithProgress}" -c:v libx264 -preset medium -b:v 2M -maxrate 3M -bufsize 4M -pix_fmt yuv420p -movflags +faststart -an "${tempVideoNoAudio}"`);
      }
      
      // V9: Mix voiceover with video, DELAYING voiceover to start after hook
      // This way: [0-hookDuration] = original AFV audio, [hookDuration+] = voiceover
      const mixSuccess = mixAudioWithVideo(tempVideoNoAudio, voiceoverPath, tempVideoWithVO, {
        voiceoverDelay: hookDuration,     // Delay voiceover by hook duration
        keepOriginalAudio: hookHasAudio   // Mix with original audio if present
      });
      
      if (!mixSuccess) {
        console.log('⚠️  Voiceover mixing failed, creating video without audio');
        ffmpeg(`-i "${tempWithProgress}" -c:v libx264 -preset medium -b:v 2M -maxrate 3M -bufsize 4M -pix_fmt yuv420p -movflags +faststart "${tempVideoWithVO}"`);
      } else {
        console.log('✅ Voiceover added successfully (delayed to product segment)!');
      }
      
      // Step 8b: Add background music under voiceover (20% volume)
      if (musicTrack && fs.existsSync(musicTrack)) {
        hasBackgroundMusic = mixBackgroundMusic(tempVideoWithVO, musicTrack, videoPath, totalDuration);
        if (!hasBackgroundMusic) {
          // Fallback: copy video without music
          fs.copyFileSync(tempVideoWithVO, videoPath);
        }
      } else {
        // No music available, use video with just voiceover
        fs.copyFileSync(tempVideoWithVO, videoPath);
      }
    } else {
      console.log('⚠️  No voiceover available');
      ffmpeg(`-i "${tempWithProgress}" -c:v libx264 -preset medium -b:v 2M -maxrate 3M -bufsize 4M -pix_fmt yuv420p -movflags +faststart -an "${tempVideoNoAudio}"`);
      
      // Add music to silent video (50% volume since no voiceover)
      if (musicTrack && fs.existsSync(musicTrack)) {
        hasBackgroundMusic = addMusicToSilentVideo(tempVideoNoAudio, musicTrack, videoPath, totalDuration);
        if (!hasBackgroundMusic) {
          // Fallback: copy silent video
          fs.copyFileSync(tempVideoNoAudio, videoPath);
        }
      } else {
        // No music, no voiceover - silent video
        fs.copyFileSync(tempVideoNoAudio, videoPath);
      }
    }
    
    // Step 9: Generate thumbnail
    console.log('🖼️  Generating thumbnail...');
    generateThumbnail(videoPath, thumbPath, hookDuration + 2);
    
    // Step 10: Create post metadata
    console.log('📝 Creating post metadata...');
    const postData = {
      video_path: videoPath,
      video_filename: videoFilename,
      thumb_path: thumbPath,
      thumb_filename: thumbFilename,
      product_id: productId,
      product_name: input.product_name,
      product_price: input.product_price,
      ig_caption: input.ig_caption || generateDefaultCaption(input, 'ig'),
      tiktok_caption: input.tiktok_caption || generateDefaultCaption(input, 'tiktok'),
      hook_angle: input.hook_angle,
      voiceover_script: getCombinedVoiceoverText(input),
      has_voiceover: voiceoverPath && fs.existsSync(videoPath),
      has_background_music: hasBackgroundMusic,
      music_track: hasBackgroundMusic && musicTrack ? path.basename(musicTrack) : null,
      duration_seconds: totalDuration,
      timing: { hook: hookDuration, product: productDuration, cta: ctaDuration },
      created_at: new Date().toISOString(),
      ready_for_posting: true,
      // Edit style tracking (V10 sticker overlay)
      edit_style: {
        version: 'v10-sticker-overlay',
        changes: [
          'price_sticker_style',    // V10: Pink sticker with bounce animation
          'fire_emoji_added',       // V10: 🔥 emoji on price for urgency
          'drop_shadow_effect',     // V10: Multiple shadow layers for depth
          'bounce_animation',       // V10: Pop-in effect with overshoot
          'voiceover_delayed',      // V9: Voiceover starts after hook
          'hook_audio_preserved',   // V9: AFV clip original audio kept
          'timing_simplified'       // 5s clip + 5s product + 2s CTA = 12s
        ],
        voiceover_delay_seconds: hookDuration,  // V9: Voiceover starts at this time
        hook_has_original_audio: isVideoClip,   // V9: True if hook plays AFV audio
        zoom_intensity: EDIT_STYLE.zoomIntensity,
        text_delay: EDIT_STYLE.textDelaySeconds,
        progress_bar: EDIT_STYLE.progressBarEnabled,
        crossfade: EDIT_STYLE.crossfadeDuration,
        music_enabled: MUSIC_CONFIG.enabled
      }
    };
    
    fs.writeFileSync(postPath, JSON.stringify(postData, null, 2));
    
    // Cleanup temp files
    console.log('🧹 Cleaning up...');
    cleanupTempFiles([
      tempMeme, tempProduct, tempHook, tempHookText, 
      tempShowcase, tempCTA, tempConcat, tempWithProgress, 
      tempVoiceover, tempVideoNoAudio, tempVideoWithVO
    ]);
    
    // Verify final video exists and is not empty
    if (!fs.existsSync(videoPath)) {
      logger.editor('ERROR', `Final video file not created`, { videoPath, productId, asin });
      throw new Error('Final video file was not created');
    }
    
    const finalStats = fs.statSync(videoPath);
    if (finalStats.size === 0) {
      logger.editor('ERROR', `Final video file is empty (0 bytes)`, { videoPath, productId, asin });
      throw new Error('Final video file is empty');
    }
    
    const editElapsed = ((Date.now() - editStartTime) / 1000).toFixed(1);
    
    logger.editor('INFO', `Video assembly complete in ${editElapsed}s`, {
      productId,
      asin,
      videoPath,
      videoSize: finalStats.size,
      duration: totalDuration,
      hasVoiceover: postData.has_voiceover,
      hasMusic: postData.has_background_music,
      elapsedSeconds: editElapsed
    });
    
    console.log(`\n✅ Video assembly complete!`);
    console.log(`   📹 Video: ${videoPath}`);
    console.log(`   🖼️  Thumb: ${thumbPath}`);
    console.log(`   📄 Post:  ${postPath}`);
    console.log(`   🎙️  Voiceover: ${postData.has_voiceover ? 'Yes' : 'No'}`);
    console.log(`   🎵 Music: ${postData.has_background_music ? postData.music_track : 'No'}\n`);
    
    return postData;
    
  } catch (error) {
    const editElapsed = ((Date.now() - editStartTime) / 1000).toFixed(1);
    
    logger.editor('ERROR', `Video assembly failed after ${editElapsed}s: ${error.message}`, {
      productId,
      asin,
      elapsedSeconds: editElapsed,
      error: error.message,
      stack: error.stack
    });
    
    console.error(`\n❌ Error during video assembly: ${error.message}`);
    // Cleanup on error
    cleanupTempFiles([
      tempMeme, tempProduct, tempHook, tempHookText, 
      tempShowcase, tempCTA, tempConcat, tempWithProgress,
      tempVoiceover, tempVideoNoAudio, tempVideoWithVO
    ]);
    throw error;
  }
}

// Generate default caption if not provided
function generateDefaultCaption(input, platform) {
  const name = input.product_name;
  const price = input.product_price || '';
  const hook = input.hook_angle || '';
  
  if (platform === 'ig') {
    return `${hook}\n\n${name} ${price}\n\n🔗 Link in bio!\n\n#tiktokfinds #amazonfinds #musthave #viral #fyp`;
  } else {
    return `${hook} 🤯 ${name} ${price} #amazonfinds #tiktokmademebuyit #viral`;
  }
}

// Clean up temp files
function cleanupTempFiles(files) {
  files.forEach(f => {
    try {
      if (fs.existsSync(f)) fs.unlinkSync(f);
    } catch (e) {
      // Ignore cleanup errors
    }
  });
}

// Run from scout output
async function runFromScout(productId) {
  const { scout } = require('./scout.js');
  const { getProductAssets } = require('./producer.js');
  
  console.log(`🔍 Running scout for product ${productId}...`);
  const scoutData = scout(productId);
  
  console.log(`📦 Getting product assets...`);
  const assets = getProductAssets(productId);
  
  // Combine data (include clip_local_path for cached clips)
  const input = {
    product_id: scoutData.product_id,
    product_name: scoutData.product_name,
    product_image: scoutData.product_image,
    product_price: scoutData.product_price,
    meme_url: scoutData.meme_url,
    clip_local_path: scoutData.clip_local_path, // Cached MP4 clip path
    hook_angle: scoutData.hook_angle,
    voiceover_script: scoutData.product_tagline,
    ig_caption: null, // Will use default
    tiktok_caption: null // Will use default
  };
  
  return editVideo(input);
}

// Test with sample data
async function runTest() {
  console.log('🧪 Running test with sample data...\n');
  
  const testInput = {
    product_id: "test",
    product_name: "LED Moon Night Light",
    product_image: "https://picsum.photos/seed/moonlight/400/300",
    product_price: "$20",
    meme_url: "https://media.giphy.com/media/xUOwGmG2pRfFZUmdVe/giphy.gif",
    voiceover_script: "Finally fixed my room situation...",
    ig_caption: "POV: Your room transformation at 3am 🌙\n\nLED Moon Night Light $20\n\n🔗 Link in bio!\n\n#roomdecor #moonlight #aesthetic #viral",
    tiktok_caption: "POV: Your room transformation at 3am 🌙 #moonlight #roomdecor #tiktokmademebuyit",
    hook_angle: "POV: Your room glow-up"
  };
  
  return editVideo(testInput);
}

// CLI handling
async function main() {
  const args = process.argv.slice(2);
  
  try {
    // Test mode
    if (args.includes('--test') || args.includes('-t')) {
      const result = await runTest();
      console.log('\nOutput JSON:');
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    
    // Product ID mode (auto scout+produce)
    const pidIdx = args.findIndex(a => a === '--product-id' || a === '-p');
    if (pidIdx !== -1 && args[pidIdx + 1]) {
      const productId = parseInt(args[pidIdx + 1], 10);
      const result = await runFromScout(productId);
      console.log('\nOutput JSON:');
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    
    // Input file mode
    const inputIdx = args.findIndex(a => a === '--input' || a === '-i');
    if (inputIdx !== -1 && args[inputIdx + 1]) {
      const inputPath = args[inputIdx + 1];
      const input = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
      const result = await editVideo(input);
      console.log('\nOutput JSON:');
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    
    // Stdin mode
    if (!process.stdin.isTTY) {
      let data = '';
      process.stdin.setEncoding('utf8');
      for await (const chunk of process.stdin) {
        data += chunk;
      }
      const input = JSON.parse(data);
      const result = await editVideo(input);
      console.log('\nOutput JSON:');
      console.log(JSON.stringify(result, null, 2));
      return;
    }
    
    // No input - show help
    console.log(`
DailyDealFeed Editor - Video Assembly Module (with TTS Voiceover)

Usage:
  node editor.js --test                  # Run test with sample data
  node editor.js --product-id 1          # Auto-run scout+producer for product
  node editor.js --input input.json      # Process from JSON file
  echo '{"..."}' | node editor.js        # Process from stdin

TTS Voiceover:
  - Automatically generates voiceover from hook_angle + product info
  - Or provide pre-generated audio via "voiceover_audio" in input JSON
  - Uses espeak-ng as fallback TTS engine

Background Music:
  - Automatically selects random track from music/ folder
  - Mixed at 20% volume under voiceover (50% if no voiceover)
  - Add tracks to music/ folder (see music/README.md)

Output:
  Creates video (with voiceover + music), thumbnail, and post metadata in output/ folder
`);
    
  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Export for module use
module.exports = { 
  editVideo, 
  runFromScout, 
  runTest, 
  generateVoiceover, 
  getCombinedVoiceoverText,
  getAvailableMusicTracks,
  selectRandomMusicTrack,
  selectMusicByVibe,  // v2.1 - vibe-based music matching
  MUSIC_VIBE_MAP,     // Music vibe configuration
  MUSIC_CONFIG,
  EDIT_STYLE  // v2.0 - organic edit settings
};

// Run if called directly
if (require.main === module) {
  main();
}
