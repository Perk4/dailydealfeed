/**
 * ElevenLabs TTS Integration for DailyDealFeed
 * 
 * This module provides natural-sounding voiceovers using ElevenLabs API.
 * Same backend that OpenClaw uses - sounds way better than Deepgram Aura-1.
 * 
 * Usage:
 *   const { generateElevenLabsTTS } = require('./lib/tts-elevenlabs');
 *   const audioPath = await generateElevenLabsTTS(text, outputPath, options);
 * 
 * Requires: ELEVENLABS_API_KEY environment variable
 * 
 * Cost: ~$0.30 per 1000 characters on Creator plan
 * Quality: Natural human voice, passes the "real person" test
 */

const https = require('https');
const fs = require('fs');
const path = require('path');

// ElevenLabs Voice IDs (these are public voices)
const VOICES = {
  // Natural Female Voices
  'rachel': '21m00Tcm4TlvDq8ikWAM',     // Calm, warm female
  'domi': 'AZnzlk1XvdvUeBnXmlld',        // Young, energetic female
  'bella': 'EXAVITQu4vr4xnSDxMaL',       // Soft, friendly female
  'elli': 'MF3mGyEYCl7XYWbV9V6O',        // Young, bubbly female
  
  // Natural Male Voices
  'josh': 'TxGEqnHWrfWFTfGW9XjX',        // Deep, warm male
  'adam': 'pNInz6obpgDQGcFmaJgB',        // Deep, professional male
  'sam': 'yoZ06aMxZJJ28mfd3POQ',         // Young, dynamic male
  'arnold': 'VR6AewLTigWG4xSOukaG',      // Crisp, energetic male
  
  // Energetic/Influencer Style
  'drew': '29vD33N1CtxCmqQRPOHJ',        // Energetic male (great for reels!)
  'clyde': '2EiwWnXFnvU5JabPnv8n',       // Animated male
  'paul': '5Q0t7uMcjvnagumLfvZi',        // Friendly male narrator
  'glinda': 'z9fAnlkpzviPz146aGWa',      // Witch-like, energetic female
  
  // TikTok/Reels Optimized (recommendation)
  'default': 'yoZ06aMxZJJ28mfd3POQ',     // Sam - young, dynamic (best for reels)
  'female': 'EXAVITQu4vr4xnSDxMaL',      // Bella - friendly female
  'male': 'TxGEqnHWrfWFTfGW9XjX',        // Josh - warm male
};

// Voice settings for TikTok/Reels style
const VOICE_SETTINGS = {
  // Fast, punchy delivery for reels
  reels: {
    stability: 0.5,           // Lower = more expressive
    similarity_boost: 0.75,   // Higher = closer to original voice
    style: 0.5,               // Style intensity
    use_speaker_boost: true,  // Clearer audio
  },
  // More natural, conversational
  natural: {
    stability: 0.7,
    similarity_boost: 0.7,
    style: 0.3,
    use_speaker_boost: true,
  },
  // Energetic, influencer style
  energetic: {
    stability: 0.35,
    similarity_boost: 0.8,
    style: 0.8,
    use_speaker_boost: true,
  }
};

/**
 * Generate TTS audio using ElevenLabs API
 * 
 * @param {string} text - Text to convert to speech
 * @param {string} outputPath - Where to save the MP3 file
 * @param {object} options - Configuration options
 * @param {string} options.voice - Voice name (default: 'default')
 * @param {string} options.style - Voice style: 'reels', 'natural', 'energetic' (default: 'energetic')
 * @param {string} options.apiKey - ElevenLabs API key (default: env.ELEVENLABS_API_KEY)
 * @returns {Promise<string>} Path to generated audio file
 */
async function generateElevenLabsTTS(text, outputPath, options = {}) {
  const apiKey = options.apiKey || process.env.ELEVENLABS_API_KEY;
  
  if (!apiKey) {
    throw new Error('ELEVENLABS_API_KEY not set. Get one at https://elevenlabs.io');
  }
  
  const voiceKey = options.voice || 'default';
  const voiceId = VOICES[voiceKey] || VOICES.default;
  const style = options.style || 'energetic';
  const settings = VOICE_SETTINGS[style] || VOICE_SETTINGS.energetic;
  
  console.log(`🎙️  Generating TTS with ElevenLabs (voice: ${voiceKey}, style: ${style})...`);
  
  return new Promise((resolve, reject) => {
    const postData = JSON.stringify({
      text: text,
      model_id: 'eleven_turbo_v2_5', // Fastest, good quality
      voice_settings: settings
    });
    
    const req = https.request({
      hostname: 'api.elevenlabs.io',
      port: 443,
      path: `/v1/text-to-speech/${voiceId}`,
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
        'Content-Length': Buffer.byteLength(postData)
      }
    }, (res) => {
      if (res.statusCode !== 200) {
        let errorData = '';
        res.on('data', chunk => errorData += chunk);
        res.on('end', () => {
          reject(new Error(`ElevenLabs API error (${res.statusCode}): ${errorData}`));
        });
        return;
      }
      
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const audioBuffer = Buffer.concat(chunks);
        
        // Ensure output directory exists
        const dir = path.dirname(outputPath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        
        fs.writeFileSync(outputPath, audioBuffer);
        console.log(`🎙️  ElevenLabs TTS complete (${audioBuffer.length} bytes)`);
        resolve(outputPath);
      });
    });
    
    req.on('error', reject);
    req.setTimeout(30000, () => {
      req.destroy();
      reject(new Error('ElevenLabs API timeout'));
    });
    
    req.write(postData);
    req.end();
  });
}

/**
 * Check if ElevenLabs API key is configured
 */
function isElevenLabsConfigured() {
  return !!process.env.ELEVENLABS_API_KEY;
}

/**
 * Get available voices
 */
function getVoices() {
  return Object.keys(VOICES);
}

// Export for module use
module.exports = {
  generateElevenLabsTTS,
  isElevenLabsConfigured,
  getVoices,
  VOICES,
  VOICE_SETTINGS
};

// CLI test
if (require.main === module) {
  const text = process.argv[2] || 'This is a test of the ElevenLabs TTS integration for DailyDealFeed.';
  const output = process.argv[3] || '/tmp/elevenlabs-test.mp3';
  
  generateElevenLabsTTS(text, output, { style: 'energetic' })
    .then(path => console.log(`✅ Audio saved to: ${path}`))
    .catch(err => console.error(`❌ Error: ${err.message}`));
}
