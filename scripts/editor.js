#!/usr/bin/env node
/**
 * Editor Agent — Video Assembly Module (with TTS Voiceover + Motion Effects)
 * For DailyDealFeed Reels Pipeline
 *
 * Creates vertical videos (9:16, 15-30 sec) ready for TikTok/IG Reels.
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

// Configuration
const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, '..', 'output');
const TEMP_DIR = path.join(SCRIPT_DIR, '..', 'temp');
const ASSETS_DIR = path.join(SCRIPT_DIR, '..', 'assets');
const MUSIC_DIR = path.join(SCRIPT_DIR, '..', 'music');

// Video dimensions (9:16 vertical)
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;

// Timing (in seconds) - Now dynamic based on voiceover length
// Target: 10-18s total (TikTok optimal)
const DEFAULT_HOOK_DURATION = 3;
const DEFAULT_PRODUCT_DURATION = 8;
const DEFAULT_CTA_DURATION = 2;
const MIN_TOTAL_DURATION = 10;
const MAX_TOTAL_DURATION = 18;

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
const MUSIC_CONFIG = {
  enabled: true,       // Enable background music
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
    // Handle local file paths
    if (urlOrPath.startsWith('/') || urlOrPath.startsWith('./') || urlOrPath.startsWith('../')) {
      // It's a local file path - copy instead of download
      if (fs.existsSync(urlOrPath)) {
        fs.copyFileSync(urlOrPath, destPath);
        console.log(`   📁 Copied from local cache: ${path.basename(urlOrPath)}`);
        resolve(destPath);
      } else {
        reject(new Error(`Local file not found: ${urlOrPath}`));
      }
      return;
    }
    
    const protocol = urlOrPath.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    
    const request = protocol.get(urlOrPath, { 
      headers: { 'User-Agent': 'DailyDealFeed-Editor/1.0' }
    }, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        file.close();
        fs.unlinkSync(destPath);
        return downloadFile(response.headers.location, destPath).then(resolve).catch(reject);
      }
      
      if (response.statusCode !== 200) {
        file.close();
        fs.unlinkSync(destPath);
        reject(new Error(`Failed to download: ${response.statusCode}`));
        return;
      }
      
      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(destPath);
      });
    });
    
    request.on('error', (err) => {
      file.close();
      if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
      reject(err);
    });
    
    request.setTimeout(30000, () => {
      request.destroy();
      reject(new Error('Download timeout'));
    });
  });
}

// Run FFmpeg command
function ffmpeg(args, options = {}) {
  const cmd = `ffmpeg -y ${args}`;
  if (options.verbose) {
    console.log(`[FFmpeg] ${cmd}`);
  }
  try {
    execSync(cmd, { 
      stdio: options.verbose ? 'inherit' : 'pipe',
      maxBuffer: 50 * 1024 * 1024 
    });
    return true;
  } catch (err) {
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
  const hook = input.hook_angle || input.voiceover_script || 'Check this out';
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
  
  // Fallback to generating from input
  const hook = input.hook_angle || input.voiceover_script || 'Check this out';
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
  // Check for pre-generated audio first (OpenClaw TTS path)
  const externalAudio = findExternalTTSAudio(input, TEMP_DIR);
  if (externalAudio) {
    // Copy to our temp location
    fs.copyFileSync(externalAudio, outputPath);
    console.log('🎙️  Using pre-generated voiceover (OpenClaw TTS)');
    return outputPath;
  }
  
  // Generate voiceover text (now uses conversational scripts from script-map.json)
  const voiceoverText = getCombinedVoiceoverText(input);
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
        console.log('🎙️  Using cached OpenClaw TTS (ElevenLabs quality)');
        return outputPath;
      }
      console.log('ℹ️  OpenClaw TTS not cached for this script');
    } catch (err) {
      console.log(`⚠️  OpenClaw TTS cache check failed: ${err.message}`);
    }
  }
  
  // Try ElevenLabs direct API
  try {
    return await generateTTSElevenLabs(voiceoverText, outputPath, {
      voice: input.tts_voice || 'default',
      style: input.tts_style || 'energetic'
    });
  } catch (err) {
    console.log(`⚠️  ElevenLabs TTS unavailable: ${err.message}`);
  }
  
  // Fallback to Cloudflare Workers AI (Deepgram Aura-1)
  try {
    return await generateTTSCloudflare(voiceoverText, outputPath, 'luna');
  } catch (err) {
    console.log(`⚠️  Cloudflare TTS failed: ${err.message}`);
  }
  
  // Last resort: espeak-ng
  console.log('⚠️  Falling back to espeak-ng (robotic voice)');
  return generateTTSEspeak(voiceoverText, outputPath);
}

// ============================================
// VIDEO CREATION FUNCTIONS
// ============================================

// Create a solid color background video
function createBackgroundVideo(outputPath, duration) {
  ffmpeg(`-f lavfi -i color=c=${COLORS.background}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${duration} -c:v libx264 -pix_fmt yuv420p "${outputPath}"`);
}

// Convert GIF to video with proper scaling
function convertGifToVideo(inputPath, outputPath, duration) {
  // Detect input type by extension
  const ext = path.extname(inputPath).toLowerCase();
  const isGif = ext === '.gif';
  const isMp4 = ext === '.mp4' || ext === '.m4v' || ext === '.mov';
  
  // Scale to fit video width, crop/pad to match dimensions
  const scaleFilter = `scale=${VIDEO_WIDTH}:-1:force_original_aspect_ratio=decrease,pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=${COLORS.background}`;
  
  if (isGif) {
    // For GIFs: use loop filter
    const filter = `${scaleFilter},loop=loop=-1:size=1000,trim=duration=${duration}`;
    ffmpeg(`-i "${inputPath}" -vf "${filter}" -c:v libx264 -pix_fmt yuv420p -an "${outputPath}"`);
  } else if (isMp4) {
    // For MP4s: use stream_loop for seamless looping, then trim
    const filter = `${scaleFilter},trim=duration=${duration}`;
    ffmpeg(`-stream_loop -1 -i "${inputPath}" -vf "${filter}" -t ${duration} -c:v libx264 -pix_fmt yuv420p -an "${outputPath}"`);
  } else {
    // Fallback: try the GIF approach (works for most formats)
    const filter = `${scaleFilter},trim=duration=${duration}`;
    ffmpeg(`-i "${inputPath}" -vf "${filter}" -t ${duration} -c:v libx264 -pix_fmt yuv420p -an "${outputPath}"`);
  }
}

// Create product showcase segment with image and text
// Now with Ken Burns zoom effect and text fade-in animations
function createProductSegment(imagePath, productName, price, outputPath, duration) {
  // Scale image to fit nicely (about 60% of width)
  const imgWidth = Math.floor(VIDEO_WIDTH * 0.8);
  const imgHeight = Math.floor(imgWidth * 0.75); // 4:3 aspect
  const imgY = Math.floor(VIDEO_HEIGHT * 0.25);
  
  // Text positioning
  const nameY = imgY + imgHeight + 80;
  const priceY = nameY + 100;
  
  const escapedName = escapeText(productName);
  const escapedPrice = escapeText(price);
  
  // Ken Burns: slow zoom in effect - REDUCED for organic feel
  // zoompan outputs at 25fps, d=frames, s=output size
  const fps = 25;
  const frames = duration * fps;
  // Zoom from 1.0 to 1.05 slowly (was 1.12 - now subtler)
  const zoomMax = 1 + EDIT_STYLE.zoomIntensity;
  const zoomExpr = `min(1+${EDIT_STYLE.zoomIntensity}*on/${frames}\\,${zoomMax})`;
  
  // Create background with Ken Burns zoom on image and animated text
  // Text animations: fade in over 0.5s with slight slide up
  const textFadeIn = 0.5; // seconds for fade
  const textSlideDistance = 30; // pixels to slide up
  
  // Alpha expression for fade-in: fade in over textFadeIn seconds
  const nameAlpha = `if(lt(t\\,${textFadeIn})\\,t/${textFadeIn}\\,1)`;
  const priceAlpha = `if(lt(t\\,${textFadeIn + 0.2})\\,max(0\\,(t-0.2)/${textFadeIn})\\,1)`; // Price fades in 0.2s after name
  
  // Y position with slide-up effect
  const nameYExpr = `${nameY}+${textSlideDistance}*max(0\\,1-t/${textFadeIn})`;
  const priceYExpr = `${priceY}+${textSlideDistance}*max(0\\,1-(t-0.2)/${textFadeIn})`;
  
  const filter = [
    `color=c=${COLORS.background}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${duration}[bg]`,
    // Apply Ken Burns zoom to product image
    `[1:v]scale=${imgWidth*2}:${imgHeight*2}:force_original_aspect_ratio=decrease,zoompan=z='${zoomExpr}':x='iw/2-(iw/zoom/2)':y='ih/2-(ih/zoom/2)':d=${frames}:s=${imgWidth}x${imgHeight}:fps=${fps}[img]`,
    `[bg][img]overlay=(W-w)/2:${imgY}[v1]`,
    // Text with fade-in and slide-up animation
    `[v1]drawtext=fontfile=${FONT_PATH}:text='${escapedName}':fontsize=56:fontcolor=${COLORS.textPrimary}:x=(w-text_w)/2:y='${nameYExpr}':alpha='${nameAlpha}'[v2]`,
    `[v2]drawtext=fontfile=${FONT_PATH}:text='${escapedPrice}':fontsize=72:fontcolor=${COLORS.accent}:x=(w-text_w)/2:y='${priceYExpr}':alpha='${priceAlpha}'`
  ].join(';');
  
  ffmpeg(`-f lavfi -i "color=c=${COLORS.background}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${duration}" -i "${imagePath}" -filter_complex "${filter}" -c:v libx264 -pix_fmt yuv420p -t ${duration} "${outputPath}"`);
}

// Create CTA segment with animated text
function createCTASegment(outputPath, duration) {
  const ctaText = 'Link in bio';
  const subText = 'Shop now →';
  
  const ctaY = Math.floor(VIDEO_HEIGHT * 0.4);
  const subY = ctaY + 120;
  
  const escapedCta = escapeText(ctaText);
  const escapedSub = escapeText(subText);
  
  // Animation: scale-up bounce effect via alpha fade + slide
  const fadeIn = 0.4;
  const slideDistance = 40;
  
  // CTA text: fade in with slide up
  const ctaAlpha = `if(lt(t\\,${fadeIn})\\,t/${fadeIn}\\,1)`;
  const ctaYExpr = `${ctaY}+${slideDistance}*max(0\\,1-t/${fadeIn})`;
  
  // Sub text: delayed fade in
  const subAlpha = `if(lt(t\\,${fadeIn + 0.3})\\,max(0\\,(t-0.3)/${fadeIn})\\,1)`;
  const subYExpr = `${subY}+${slideDistance}*max(0\\,1-(t-0.3)/${fadeIn})`;
  
  const filter = [
    `drawtext=fontfile=${FONT_PATH}:text='${escapedCta}':fontsize=96:fontcolor=${COLORS.textPrimary}:x=(w-text_w)/2:y='${ctaYExpr}':alpha='${ctaAlpha}'`,
    `drawtext=fontfile=${FONT_PATH}:text='${escapedSub}':fontsize=48:fontcolor=${COLORS.accent}:x=(w-text_w)/2:y='${subYExpr}':alpha='${subAlpha}'`
  ].join(',');
  
  ffmpeg(`-f lavfi -i "color=c=${COLORS.ctaBackground}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${duration}" -vf "${filter}" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`);
}

// Concatenate video segments
function concatenateVideos(inputPaths, outputPath) {
  // Create concat file
  const concatFile = path.join(TEMP_DIR, 'concat.txt');
  const content = inputPaths.map(p => `file '${p}'`).join('\n');
  fs.writeFileSync(concatFile, content);
  
  ffmpeg(`-f concat -safe 0 -i "${concatFile}" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`);
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
  // This creates organic-feeling movement without being too jarring
  const shakeIntensity = 4; // pixels of shake
  const shakeX = `${shakeIntensity}*sin(t*15)*sin(t*7)`;
  const shakeY = `${shakeIntensity}*sin(t*12)*cos(t*9)`;
  
  // Text fade-in with slight slide up
  const fadeIn = 0.4;
  const slideDistance = 25;
  const textAlpha = `if(lt(t\\,${fadeIn})\\,t/${fadeIn}\\,1)`;
  const textY = `${hookY}+${slideDistance}*max(0\\,1-t/${fadeIn})`;
  
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
 * @param {string} videoPath - Path to the video file (no audio)
 * @param {string} audioPath - Path to the voiceover audio
 * @param {string} outputPath - Path for the output video with audio
 */
function mixAudioWithVideo(videoPath, audioPath, outputPath) {
  console.log('🔊 Mixing voiceover with video...');
  
  const audioDuration = getAudioDuration(audioPath);
  console.log(`   Audio duration: ${audioDuration.toFixed(2)}s`);
  
  // Mix audio with video
  // Use -shortest to end when the shortest stream ends
  // Add slight delay and volume adjustment for better quality
  try {
    ffmpeg(
      `-i "${videoPath}" -i "${audioPath}" ` +
      `-filter_complex "[1:a]adelay=200|200,volume=1.5,apad[a]" ` +
      `-map 0:v -map "[a]" ` +
      `-c:v copy -c:a aac -b:a 192k ` +
      `-shortest "${outputPath}"`
    );
    return true;
  } catch (err) {
    console.error('Audio mixing failed, trying simpler approach...');
    
    // Fallback: Simple audio overlay
    try {
      ffmpeg(
        `-i "${videoPath}" -i "${audioPath}" ` +
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
 * Select a random music track
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
  
  const vol = 0.5; // Higher volume for music-only (no voiceover to compete with)
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
  console.log(`\n🎬 Editor: Starting video assembly for "${input.product_name}"`);
  
  ensureDirs();
  
  const timestamp = Date.now();
  const productId = input.product_id || 'unknown';
  
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
    
    // Step 1: Download assets
    console.log('📥 Downloading meme/clip...');
    // Prefer local cached clip if available
    if (input.clip_local_path && fs.existsSync(input.clip_local_path)) {
      console.log(`✓ Using cached clip: ${input.clip_local_path}`);
      fs.copyFileSync(input.clip_local_path, tempMeme);
    } else {
      await downloadFile(input.meme_url, tempMeme);
    }
    
    console.log('📥 Downloading product image...');
    await downloadFile(input.product_image, tempProduct);
    
    // Step 2: Create hook segment (meme with text) - DYNAMIC DURATION
    console.log('🎣 Creating hook segment...');
    convertGifToVideo(tempMeme, tempHook, hookDuration);
    addHookText(tempHook, tempHookText, input.hook_angle || 'Check this out');
    
    // Step 3: Create product showcase segment - DYNAMIC DURATION
    console.log('📦 Creating product showcase...');
    createProductSegment(
      tempProduct, 
      input.product_name, 
      input.product_price || '$??', 
      tempShowcase, 
      productDuration
    );
    
    // Step 4: Create CTA segment - DYNAMIC DURATION
    console.log('📢 Creating CTA segment...');
    createCTASegment(tempCTA, ctaDuration);
    
    // Step 5: Concatenate all segments
    console.log('🔗 Concatenating segments...');
    concatenateVideos([tempHookText, tempShowcase, tempCTA], tempConcat);
    
    // Step 6: Add progress bar overlay - DYNAMIC DURATION
    console.log('📊 Adding progress bar...');
    addProgressBar(tempConcat, tempWithProgress, totalDuration);
    
    // Step 8: Final encoding with voiceover and background music
    console.log('🎥 Final encoding...');
    
    // Select background music track
    const musicTrack = MUSIC_CONFIG.enabled ? selectRandomMusicTrack() : null;
    let hasBackgroundMusic = false;
    
    if (voiceoverPath && fs.existsSync(voiceoverPath)) {
      // Create video without audio first (using progress bar version)
      ffmpeg(`-i "${tempWithProgress}" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart -an "${tempVideoNoAudio}"`);
      
      // Mix voiceover with video
      const mixSuccess = mixAudioWithVideo(tempVideoNoAudio, voiceoverPath, tempVideoWithVO);
      
      if (!mixSuccess) {
        console.log('⚠️  Voiceover mixing failed, creating video without audio');
        ffmpeg(`-i "${tempWithProgress}" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart "${tempVideoWithVO}"`);
      } else {
        console.log('✅ Voiceover added successfully!');
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
      ffmpeg(`-i "${tempWithProgress}" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart -an "${tempVideoNoAudio}"`);
      
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
      ready_for_posting: true
    };
    
    fs.writeFileSync(postPath, JSON.stringify(postData, null, 2));
    
    // Cleanup temp files
    console.log('🧹 Cleaning up...');
    cleanupTempFiles([
      tempMeme, tempProduct, tempHook, tempHookText, 
      tempShowcase, tempCTA, tempConcat, tempWithProgress, 
      tempVoiceover, tempVideoNoAudio, tempVideoWithVO
    ]);
    
    console.log(`\n✅ Video assembly complete!`);
    console.log(`   📹 Video: ${videoPath}`);
    console.log(`   🖼️  Thumb: ${thumbPath}`);
    console.log(`   📄 Post:  ${postPath}`);
    console.log(`   🎙️  Voiceover: ${postData.has_voiceover ? 'Yes' : 'No'}`);
    console.log(`   🎵 Music: ${postData.has_background_music ? postData.music_track : 'No'}\n`);
    
    return postData;
    
  } catch (error) {
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
  MUSIC_CONFIG
};

// Run if called directly
if (require.main === module) {
  main();
}
