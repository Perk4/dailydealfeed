/**
 * OpenClaw TTS Integration for DailyDealFeed
 * 
 * This module provides caching and management for OpenClaw TTS audio.
 * OpenClaw TTS is generated externally by the agent using the `tts` tool,
 * which produces natural-sounding voices via ElevenLabs.
 * 
 * Usage:
 *   const { getCachedTTS, getTTSCachePath, listPendingTTS } = require('./lib/tts-openclaw');
 *   
 *   // Check if TTS is cached for a script
 *   const audioPath = getCachedTTS(text);
 *   
 *   // Get expected cache path for a script (for agent to populate)
 *   const cachePath = getTTSCachePath(text);
 *   
 *   // List scripts that need TTS generation
 *   const pending = listPendingTTS(scripts);
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// TTS Cache directory (persistent across runs)
const TTS_CACHE_DIR = path.join(__dirname, '..', '..', 'tts-cache');

// Ensure cache directory exists
function ensureCacheDir() {
  if (!fs.existsSync(TTS_CACHE_DIR)) {
    fs.mkdirSync(TTS_CACHE_DIR, { recursive: true });
  }
}

/**
 * Generate a hash-based cache key for a text
 */
function getCacheKey(text) {
  return crypto.createHash('md5').update(text.trim()).digest('hex');
}

/**
 * Get the expected cache path for a text
 * @param {string} text - The text to be spoken
 * @returns {string} Path where the TTS audio should be stored
 */
function getTTSCachePath(text) {
  ensureCacheDir();
  const key = getCacheKey(text);
  return path.join(TTS_CACHE_DIR, `openclaw-tts-${key}.mp3`);
}

/**
 * Check if TTS is cached for a text
 * @param {string} text - The text to check
 * @returns {string|null} Path to cached audio, or null if not cached
 */
function getCachedTTS(text) {
  const cachePath = getTTSCachePath(text);
  if (fs.existsSync(cachePath)) {
    return cachePath;
  }
  return null;
}

/**
 * Save TTS audio to cache
 * @param {string} text - The original text
 * @param {string} audioPath - Path to the generated audio file
 * @returns {string} Path to the cached audio
 */
function saveTTSToCache(text, audioPath) {
  ensureCacheDir();
  const cachePath = getTTSCachePath(text);
  
  // Handle MEDIA: prefix from OpenClaw
  const cleanPath = audioPath.replace(/^MEDIA:\s*/, '');
  
  if (fs.existsSync(cleanPath)) {
    fs.copyFileSync(cleanPath, cachePath);
    console.log(`🎙️  Cached OpenClaw TTS: ${path.basename(cachePath)}`);
    return cachePath;
  }
  
  throw new Error(`Audio file not found: ${cleanPath}`);
}

/**
 * List scripts that need TTS generation
 * @param {Object} scriptMap - Script map from script-map.json
 * @returns {Array} Array of {id, text, cachePath} objects needing TTS
 */
function listPendingTTS(scriptMap) {
  const pending = [];
  
  if (!scriptMap || !scriptMap.scripts) {
    return pending;
  }
  
  for (const [id, script] of Object.entries(scriptMap.scripts)) {
    const text = script.full_script;
    if (text) {
      const cached = getCachedTTS(text);
      if (!cached) {
        pending.push({
          id,
          productName: script.product_name,
          text,
          cachePath: getTTSCachePath(text)
        });
      }
    }
  }
  
  return pending;
}

/**
 * List all cached TTS files
 * @returns {Array} Array of {text, path} objects
 */
function listCachedTTS() {
  ensureCacheDir();
  const files = fs.readdirSync(TTS_CACHE_DIR);
  return files
    .filter(f => f.startsWith('openclaw-tts-') && f.endsWith('.mp3'))
    .map(f => ({
      filename: f,
      path: path.join(TTS_CACHE_DIR, f),
      hash: f.replace('openclaw-tts-', '').replace('.mp3', '')
    }));
}

/**
 * Clear the TTS cache
 */
function clearCache() {
  ensureCacheDir();
  const files = fs.readdirSync(TTS_CACHE_DIR);
  for (const f of files) {
    if (f.startsWith('openclaw-tts-')) {
      fs.unlinkSync(path.join(TTS_CACHE_DIR, f));
    }
  }
  console.log('🧹 OpenClaw TTS cache cleared');
}

// Export for module use
module.exports = {
  getTTSCachePath,
  getCachedTTS,
  saveTTSToCache,
  listPendingTTS,
  listCachedTTS,
  clearCache,
  TTS_CACHE_DIR
};

// CLI test
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.includes('--list-pending')) {
    const scriptMapPath = path.join(__dirname, '..', 'script-map.json');
    if (fs.existsSync(scriptMapPath)) {
      const scriptMap = JSON.parse(fs.readFileSync(scriptMapPath, 'utf8'));
      const pending = listPendingTTS(scriptMap);
      
      if (pending.length === 0) {
        console.log('✅ All scripts have cached TTS');
      } else {
        console.log(`📋 ${pending.length} scripts need TTS generation:\n`);
        for (const p of pending) {
          console.log(`Product ${p.id}: ${p.productName}`);
          console.log(`  Text: "${p.text}"`);
          console.log(`  Cache: ${p.cachePath}\n`);
        }
      }
    } else {
      console.log('❌ script-map.json not found');
    }
  } else if (args.includes('--list-cached')) {
    const cached = listCachedTTS();
    console.log(`📦 ${cached.length} cached TTS files:\n`);
    for (const c of cached) {
      const stats = fs.statSync(c.path);
      console.log(`  ${c.filename} (${Math.round(stats.size / 1024)}KB)`);
    }
  } else if (args.includes('--clear')) {
    clearCache();
  } else {
    console.log(`
OpenClaw TTS Cache Manager

Usage:
  node tts-openclaw.js --list-pending   # Show scripts needing TTS
  node tts-openclaw.js --list-cached    # Show cached TTS files
  node tts-openclaw.js --clear          # Clear the TTS cache
`);
  }
}
