#!/usr/bin/env node
/**
 * Editor Agent — Video Assembly Module
 * For DailyDealFeed Reels Pipeline
 *
 * Creates vertical videos (9:16, 15-30 sec) ready for TikTok/IG Reels.
 * Output includes video, thumbnail, and post metadata JSON.
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

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');

// Configuration
const SCRIPT_DIR = __dirname;
const OUTPUT_DIR = path.join(SCRIPT_DIR, '..', 'output');
const TEMP_DIR = path.join(SCRIPT_DIR, '..', 'temp');
const ASSETS_DIR = path.join(SCRIPT_DIR, '..', 'assets');

// Video dimensions (9:16 vertical)
const VIDEO_WIDTH = 1080;
const VIDEO_HEIGHT = 1920;

// Timing (in seconds)
const HOOK_DURATION = 3;
const PRODUCT_DURATION = 12;
const CTA_DURATION = 5;
const TOTAL_DURATION = HOOK_DURATION + PRODUCT_DURATION + CTA_DURATION; // 20 seconds

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

// Download file from URL
function downloadFile(url, destPath) {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http;
    const file = fs.createWriteStream(destPath);
    
    const request = protocol.get(url, { 
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

// Create a solid color background video
function createBackgroundVideo(outputPath, duration) {
  ffmpeg(`-f lavfi -i color=c=${COLORS.background}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${duration} -c:v libx264 -pix_fmt yuv420p "${outputPath}"`);
}

// Convert GIF to video with proper scaling
function convertGifToVideo(gifPath, outputPath, duration) {
  // Scale GIF to fit video width, crop/pad to match dimensions
  const filter = `scale=${VIDEO_WIDTH}:-1:force_original_aspect_ratio=decrease,pad=${VIDEO_WIDTH}:${VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2:color=${COLORS.background},loop=loop=-1:size=1000,trim=duration=${duration}`;
  
  ffmpeg(`-i "${gifPath}" -vf "${filter}" -c:v libx264 -pix_fmt yuv420p -an "${outputPath}"`);
}

// Create product showcase segment with image and text
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
  
  // Create background with image overlay and text
  const filter = [
    `color=c=${COLORS.background}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${duration}[bg]`,
    `[1:v]scale=${imgWidth}:${imgHeight}:force_original_aspect_ratio=decrease,pad=${imgWidth}:${imgHeight}:(ow-iw)/2:(oh-ih)/2:color=${COLORS.background}[img]`,
    `[bg][img]overlay=(W-w)/2:${imgY}[v1]`,
    `[v1]drawtext=fontfile=${FONT_PATH}:text='${escapedName}':fontsize=56:fontcolor=${COLORS.textPrimary}:x=(w-text_w)/2:y=${nameY}[v2]`,
    `[v2]drawtext=fontfile=${FONT_PATH}:text='${escapedPrice}':fontsize=72:fontcolor=${COLORS.accent}:x=(w-text_w)/2:y=${priceY}`
  ].join(';');
  
  ffmpeg(`-f lavfi -i "color=c=${COLORS.background}:s=${VIDEO_WIDTH}x${VIDEO_HEIGHT}:d=${duration}" -i "${imagePath}" -filter_complex "${filter}" -c:v libx264 -pix_fmt yuv420p -t ${duration} "${outputPath}"`);
}

// Create CTA segment
function createCTASegment(outputPath, duration) {
  const ctaText = 'Link in bio';
  const subText = 'Shop now →';
  
  const ctaY = Math.floor(VIDEO_HEIGHT * 0.4);
  const subY = ctaY + 120;
  
  const escapedCta = escapeText(ctaText);
  const escapedSub = escapeText(subText);
  
  const filter = [
    `drawtext=fontfile=${FONT_PATH}:text='${escapedCta}':fontsize=96:fontcolor=${COLORS.textPrimary}:x=(w-text_w)/2:y=${ctaY}`,
    `drawtext=fontfile=${FONT_PATH}:text='${escapedSub}':fontsize=48:fontcolor=${COLORS.accent}:x=(w-text_w)/2:y=${subY}`
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

// Add hook text overlay to video
function addHookText(inputPath, outputPath, hookText) {
  const hookY = Math.floor(VIDEO_HEIGHT * 0.1);
  const escapedHook = escapeText(hookText);
  
  // Add text with fade in effect
  const filter = `drawtext=fontfile=${FONT_PATH}:text='${escapedHook}':fontsize=48:fontcolor=${COLORS.textPrimary}:x=(w-text_w)/2:y=${hookY}:alpha='if(lt(t,0.5),t*2,1)'`;
  
  ffmpeg(`-i "${inputPath}" -vf "${filter}" -c:v libx264 -pix_fmt yuv420p "${outputPath}"`);
}

// Main editor function
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
  const tempMeme = path.join(TEMP_DIR, `meme_${timestamp}.gif`);
  const tempProduct = path.join(TEMP_DIR, `product_${timestamp}.jpg`);
  const tempHook = path.join(TEMP_DIR, `hook_${timestamp}.mp4`);
  const tempHookText = path.join(TEMP_DIR, `hook_text_${timestamp}.mp4`);
  const tempShowcase = path.join(TEMP_DIR, `showcase_${timestamp}.mp4`);
  const tempCTA = path.join(TEMP_DIR, `cta_${timestamp}.mp4`);
  const tempConcat = path.join(TEMP_DIR, `concat_${timestamp}.mp4`);
  
  try {
    // Step 1: Download assets
    console.log('📥 Downloading meme...');
    await downloadFile(input.meme_url, tempMeme);
    
    console.log('📥 Downloading product image...');
    await downloadFile(input.product_image, tempProduct);
    
    // Step 2: Create hook segment (meme with text)
    console.log('🎣 Creating hook segment...');
    convertGifToVideo(tempMeme, tempHook, HOOK_DURATION);
    addHookText(tempHook, tempHookText, input.hook_angle || 'Check this out');
    
    // Step 3: Create product showcase segment
    console.log('📦 Creating product showcase...');
    createProductSegment(
      tempProduct, 
      input.product_name, 
      input.product_price || '$??', 
      tempShowcase, 
      PRODUCT_DURATION
    );
    
    // Step 4: Create CTA segment
    console.log('📢 Creating CTA segment...');
    createCTASegment(tempCTA, CTA_DURATION);
    
    // Step 5: Concatenate all segments
    console.log('🔗 Concatenating segments...');
    concatenateVideos([tempHookText, tempShowcase, tempCTA], tempConcat);
    
    // Step 6: Final encoding (ensure proper format)
    console.log('🎥 Final encoding...');
    ffmpeg(`-i "${tempConcat}" -c:v libx264 -preset medium -crf 23 -pix_fmt yuv420p -movflags +faststart "${videoPath}"`);
    
    // Step 7: Generate thumbnail
    console.log('🖼️ Generating thumbnail...');
    generateThumbnail(videoPath, thumbPath, HOOK_DURATION + 2);
    
    // Step 8: Create post metadata
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
      duration_seconds: TOTAL_DURATION,
      created_at: new Date().toISOString(),
      ready_for_posting: true
    };
    
    fs.writeFileSync(postPath, JSON.stringify(postData, null, 2));
    
    // Cleanup temp files
    console.log('🧹 Cleaning up...');
    cleanupTempFiles([tempMeme, tempProduct, tempHook, tempHookText, tempShowcase, tempCTA, tempConcat]);
    
    console.log(`\n✅ Video assembly complete!`);
    console.log(`   📹 Video: ${videoPath}`);
    console.log(`   🖼️  Thumb: ${thumbPath}`);
    console.log(`   📄 Post:  ${postPath}\n`);
    
    return postData;
    
  } catch (error) {
    console.error(`\n❌ Error during video assembly: ${error.message}`);
    // Cleanup on error
    cleanupTempFiles([tempMeme, tempProduct, tempHook, tempHookText, tempShowcase, tempCTA, tempConcat]);
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
  
  // Combine data
  const input = {
    product_id: scoutData.product_id,
    product_name: scoutData.product_name,
    product_image: scoutData.product_image,
    product_price: scoutData.product_price,
    meme_url: scoutData.meme_url,
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
DailyDealFeed Editor - Video Assembly Module

Usage:
  node editor.js --test                  # Run test with sample data
  node editor.js --product-id 1          # Auto-run scout+producer for product
  node editor.js --input input.json      # Process from JSON file
  echo '{"..."}' | node editor.js        # Process from stdin

Output:
  Creates video, thumbnail, and post metadata in output/ folder
`);
    
  } catch (error) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// Export for module use
module.exports = { editVideo, runFromScout, runTest };

// Run if called directly
if (require.main === module) {
  main();
}
