/**
 * Audio Mixer & Sound Effects Library
 * Adds professional audio polish to videos
 * 
 * Based on @codesinred analysis:
 * - SFX every 2-4 seconds keeps attention
 * - Price reveal sound drives urgency
 * - Transition whooshes smooth cuts
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ASSETS_DIR = path.join(__dirname, '../../assets');
const SFX_DIR = path.join(ASSETS_DIR, 'sfx');

// Sound effect definitions
const SFX_LIBRARY = {
  // Price/money sounds
  priceReveal: {
    file: 'cash-register.mp3',
    description: 'Cash register cha-ching for price reveals',
    volume: 0.8,
    useAt: ['price_display', 'discount_reveal']
  },
  
  // Transition sounds
  whoosh: {
    file: 'whoosh.mp3',
    description: 'Quick swoosh for transitions',
    volume: 0.6,
    useAt: ['transition', 'segment_change']
  },
  
  // Text/popup sounds
  pop: {
    file: 'pop.mp3',
    description: 'Soft pop for text appearing',
    volume: 0.5,
    useAt: ['text_appear', 'overlay_show']
  },
  
  // Alert/urgency sounds
  notification: {
    file: 'notification.mp3',
    description: 'Notification ding for CTAs',
    volume: 0.7,
    useAt: ['cta', 'link_mention']
  },
  
  // Success sounds
  success: {
    file: 'success.mp3',
    description: 'Positive chime for reveals',
    volume: 0.6,
    useAt: ['product_reveal', 'deal_highlight']
  }
};

/**
 * Check if sound effects are available
 * @returns {Object} Status of each SFX file
 */
function checkSFXAvailability() {
  const status = {};
  for (const [name, sfx] of Object.entries(SFX_LIBRARY)) {
    const filePath = path.join(SFX_DIR, sfx.file);
    status[name] = {
      available: fs.existsSync(filePath),
      path: filePath,
      ...sfx
    };
  }
  return status;
}

/**
 * Get SFX file path
 * @param {string} sfxName - Name from SFX_LIBRARY
 * @returns {string|null} File path or null if not found
 */
function getSFXPath(sfxName) {
  const sfx = SFX_LIBRARY[sfxName];
  if (!sfx) return null;
  
  const filePath = path.join(SFX_DIR, sfx.file);
  return fs.existsSync(filePath) ? filePath : null;
}

/**
 * Generate SFX insertion points for a video
 * @param {Object} options
 * @param {number} options.totalDuration - Video duration in seconds
 * @param {number} options.hookDuration - Hook segment duration
 * @param {number} options.productDuration - Product segment duration
 * @param {number} options.ctaDuration - CTA segment duration
 * @returns {Array} Array of {time, sfx, volume} objects
 */
function generateSFXTimeline({ totalDuration, hookDuration, productDuration, ctaDuration }) {
  const timeline = [];
  
  // Pop at text appear (early in video)
  if (getSFXPath('pop')) {
    timeline.push({
      time: 0.5,
      sfx: 'pop',
      volume: SFX_LIBRARY.pop.volume,
      reason: 'text_appear'
    });
  }
  
  // Whoosh at hook -> product transition
  if (getSFXPath('whoosh')) {
    timeline.push({
      time: hookDuration - 0.2,
      sfx: 'whoosh',
      volume: SFX_LIBRARY.whoosh.volume,
      reason: 'transition'
    });
  }
  
  // Price reveal sound when price displays
  if (getSFXPath('priceReveal')) {
    timeline.push({
      time: hookDuration + 1,
      sfx: 'priceReveal',
      volume: SFX_LIBRARY.priceReveal.volume,
      reason: 'price_display'
    });
  }
  
  // Notification at CTA
  if (getSFXPath('notification')) {
    timeline.push({
      time: hookDuration + productDuration + 0.3,
      sfx: 'notification',
      volume: SFX_LIBRARY.notification.volume,
      reason: 'cta'
    });
  }
  
  return timeline;
}

/**
 * Mix SFX into video using FFmpeg
 * @param {string} videoPath - Input video path
 * @param {string} outputPath - Output video path
 * @param {Array} sfxTimeline - From generateSFXTimeline()
 * @returns {boolean} Success
 */
function mixSFXIntoVideo(videoPath, outputPath, sfxTimeline) {
  if (!sfxTimeline || sfxTimeline.length === 0) {
    console.log('⚠️  No SFX to mix (missing files or empty timeline)');
    // Just copy the video
    fs.copyFileSync(videoPath, outputPath);
    return true;
  }
  
  try {
    // Build FFmpeg filter complex for mixing
    let inputs = `-i "${videoPath}"`;
    let filterParts = [];
    let audioMix = '[0:a]';
    
    sfxTimeline.forEach((item, idx) => {
      const sfxPath = getSFXPath(item.sfx);
      if (!sfxPath) return;
      
      inputs += ` -i "${sfxPath}"`;
      const inputIdx = idx + 1;
      
      // Delay and volume adjust each SFX
      filterParts.push(
        `[${inputIdx}:a]adelay=${Math.round(item.time * 1000)}|${Math.round(item.time * 1000)},volume=${item.volume}[sfx${idx}]`
      );
      audioMix += `[sfx${idx}]`;
    });
    
    if (filterParts.length === 0) {
      fs.copyFileSync(videoPath, outputPath);
      return true;
    }
    
    // Mix all audio streams
    const mixCount = filterParts.length + 1;
    const filterComplex = filterParts.join(';') + `;${audioMix}amix=inputs=${mixCount}:duration=first[aout]`;
    
    const cmd = `ffmpeg -y ${inputs} -filter_complex "${filterComplex}" -map 0:v -map "[aout]" -c:v copy -c:a aac "${outputPath}"`;
    
    console.log(`🔊 Mixing ${filterParts.length} sound effects...`);
    execSync(cmd, { stdio: 'pipe' });
    
    return true;
  } catch (err) {
    console.error('❌ SFX mixing failed:', err.message);
    // Fallback: copy original
    fs.copyFileSync(videoPath, outputPath);
    return false;
  }
}

/**
 * Download placeholder SFX files (royalty-free sources)
 * Call this during setup if SFX files are missing
 */
async function downloadPlaceholderSFX() {
  console.log('📥 SFX files should be manually added to assets/sfx/');
  console.log('   Required files:');
  for (const [name, sfx] of Object.entries(SFX_LIBRARY)) {
    console.log(`   - ${sfx.file} (${sfx.description})`);
  }
  console.log('\n   Sources: freesound.org, pixabay.com/sound-effects, mixkit.co');
}

module.exports = {
  SFX_LIBRARY,
  checkSFXAvailability,
  getSFXPath,
  generateSFXTimeline,
  mixSFXIntoVideo,
  downloadPlaceholderSFX
};
