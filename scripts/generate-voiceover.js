#!/usr/bin/env node
/**
 * Voiceover Pre-Generation Helper
 * 
 * This script generates voiceover audio for use with editor.js.
 * Designed to be called with a pre-generated audio path from OpenClaw TTS,
 * or to generate via ElevenLabs directly.
 * 
 * Usage:
 *   # With pre-generated audio (OpenClaw TTS)
 *   node generate-voiceover.js --audio /tmp/tts-xxx/voice.mp3 --output /path/to/voiceover.mp3
 *   
 *   # Generate from text (ElevenLabs)
 *   node generate-voiceover.js --text "Your script here" --output /path/to/voiceover.mp3
 *   
 *   # Generate from product JSON
 *   echo '{"product_name":"Moon Light","product_price":"$20","hook_angle":"Check this out"}' | node generate-voiceover.js --output /path/to/voiceover.mp3
 */

const fs = require('fs');
const path = require('path');

// Parse arguments
const args = process.argv.slice(2);
const getArg = (name) => {
  const idx = args.findIndex(a => a === `--${name}`);
  return idx !== -1 && args[idx + 1] ? args[idx + 1] : null;
};

async function main() {
  const audioPath = getArg('audio');
  const textInput = getArg('text');
  const outputPath = getArg('output') || path.join(__dirname, '..', 'temp', `voiceover_${Date.now()}.mp3`);
  const voice = getArg('voice') || 'default';
  const style = getArg('style') || 'energetic';
  
  // Ensure output directory exists
  const outputDir = path.dirname(outputPath);
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  // Option 1: Copy pre-generated audio (OpenClaw TTS)
  if (audioPath) {
    // Handle MEDIA: prefix from OpenClaw
    const cleanPath = audioPath.replace(/^MEDIA:/, '');
    
    if (!fs.existsSync(cleanPath)) {
      console.error(`❌ Audio file not found: ${cleanPath}`);
      process.exit(1);
    }
    
    fs.copyFileSync(cleanPath, outputPath);
    console.log(`✅ Copied audio to: ${outputPath}`);
    console.log(`OUTPUT:${outputPath}`);
    return;
  }
  
  // Option 2: Generate from text
  let text = textInput;
  
  // Option 3: Generate from stdin JSON
  if (!text && !process.stdin.isTTY) {
    let data = '';
    process.stdin.setEncoding('utf8');
    for await (const chunk of process.stdin) {
      data += chunk;
    }
    
    try {
      const input = JSON.parse(data);
      // Generate voiceover script from product data
      const hook = input.hook_angle || input.voiceover_script || 'Check this out';
      const productDesc = `${input.product_name}. Only ${input.product_price || 'a few bucks'}.`;
      text = `${hook}... ${productDesc}... Link in bio.`;
    } catch (e) {
      console.error('❌ Invalid JSON input');
      process.exit(1);
    }
  }
  
  if (!text) {
    console.log(`
Voiceover Pre-Generation Helper

Usage:
  # Copy pre-generated audio (OpenClaw TTS)
  node generate-voiceover.js --audio /tmp/tts-xxx/voice.mp3 --output voiceover.mp3
  
  # Generate from text (requires ELEVENLABS_API_KEY)
  node generate-voiceover.js --text "Your script" --output voiceover.mp3 [--voice drew] [--style energetic]
  
  # Generate from product JSON (stdin)
  echo '{"product_name":"...","hook_angle":"..."}' | node generate-voiceover.js --output voiceover.mp3

Options:
  --audio   Path to pre-generated audio (e.g., from OpenClaw TTS)
  --text    Text to convert to speech
  --output  Output file path (default: temp/voiceover_TIMESTAMP.mp3)
  --voice   ElevenLabs voice: default, drew, bella, josh, sam, etc.
  --style   Voice style: energetic, natural, reels
`);
    process.exit(0);
  }
  
  // Try ElevenLabs
  try {
    const { generateElevenLabsTTS, isElevenLabsConfigured } = require('./lib/tts-elevenlabs');
    
    if (!isElevenLabsConfigured()) {
      console.error('❌ ELEVENLABS_API_KEY not set');
      console.error('   Get your API key at https://elevenlabs.io');
      process.exit(1);
    }
    
    console.log(`🎙️  Generating voiceover: "${text.substring(0, 50)}..."`);
    await generateElevenLabsTTS(text, outputPath, { voice, style });
    console.log(`✅ Generated: ${outputPath}`);
    console.log(`OUTPUT:${outputPath}`);
    
  } catch (err) {
    console.error(`❌ TTS generation failed: ${err.message}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error(`❌ Fatal error: ${err.message}`);
  process.exit(1);
});
