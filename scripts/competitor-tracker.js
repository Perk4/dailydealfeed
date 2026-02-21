#!/usr/bin/env node
/**
 * Competitor Tracker - Monitor and download @codesinred content
 * 
 * Usage:
 *   node competitor-tracker.js download [count]  - Download latest videos
 *   node competitor-tracker.js analyze           - Analyze downloaded videos
 *   node competitor-tracker.js status            - Show tracking status
 *   node competitor-tracker.js compare           - Compare to our videos
 */

const { execSync, spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const COMPETITOR_DIR = path.join(__dirname, '..', 'competitor-analysis');
const VIDEOS_DIR = path.join(COMPETITOR_DIR, 'videos');
const ANALYSIS_FILE = path.join(COMPETITOR_DIR, 'analysis.json');

const COMPETITORS = {
  codesinred: {
    instagram: 'https://www.instagram.com/codesinred/',
    tiktok: 'https://www.tiktok.com/@mr.krabsamazondeals',
    linktree: 'https://linktr.ee/CodesInRed'
  }
};

// Ensure directories exist
function ensureDirs() {
  if (!fs.existsSync(COMPETITOR_DIR)) fs.mkdirSync(COMPETITOR_DIR, { recursive: true });
  if (!fs.existsSync(VIDEOS_DIR)) fs.mkdirSync(VIDEOS_DIR, { recursive: true });
}

// Download latest videos using yt-dlp
async function downloadVideos(count = 5) {
  ensureDirs();
  const ytdlp = path.join(__dirname, '..', 'yt-dlp');
  
  console.log(`📥 Downloading last ${count} videos from @mr.krabsamazondeals (TikTok)...`);
  
  try {
    // Download from TikTok (usually more accessible than IG)
    const cmd = `${ytdlp} --playlist-end ${count} -o "${VIDEOS_DIR}/%(id)s.%(ext)s" --write-info-json "${COMPETITORS.codesinred.tiktok}"`;
    execSync(cmd, { stdio: 'inherit' });
    console.log('✅ Download complete!');
  } catch (err) {
    console.error('❌ Download failed:', err.message);
    console.log('\n💡 Try manually: ./yt-dlp "' + COMPETITORS.codesinred.tiktok + '"');
  }
}

// Analyze downloaded videos
function analyzeVideos() {
  ensureDirs();
  
  const videos = fs.readdirSync(VIDEOS_DIR).filter(f => f.endsWith('.mp4'));
  const infos = fs.readdirSync(VIDEOS_DIR).filter(f => f.endsWith('.json'));
  
  console.log(`\n📊 Analyzing ${videos.length} competitor videos...\n`);
  
  const analysis = {
    videoCount: videos.length,
    analyzedAt: new Date().toISOString(),
    videos: []
  };
  
  for (const infoFile of infos) {
    try {
      const data = JSON.parse(fs.readFileSync(path.join(VIDEOS_DIR, infoFile), 'utf-8'));
      const videoId = infoFile.replace('.info.json', '');
      
      // Extract key metrics
      const videoAnalysis = {
        id: videoId,
        title: data.title || data.description?.slice(0, 50),
        duration: data.duration,
        viewCount: data.view_count,
        likeCount: data.like_count,
        commentCount: data.comment_count,
        uploadDate: data.upload_date,
        description: data.description?.slice(0, 200)
      };
      
      analysis.videos.push(videoAnalysis);
      
      console.log(`📹 ${videoId}`);
      console.log(`   Duration: ${data.duration}s`);
      console.log(`   Views: ${data.view_count?.toLocaleString() || 'N/A'}`);
      console.log(`   Likes: ${data.like_count?.toLocaleString() || 'N/A'}`);
      console.log('');
    } catch (err) {
      console.log(`⚠️  Could not analyze ${infoFile}`);
    }
  }
  
  // Save analysis
  fs.writeFileSync(ANALYSIS_FILE, JSON.stringify(analysis, null, 2));
  console.log(`\n✅ Analysis saved to ${ANALYSIS_FILE}`);
  
  // Summary stats
  if (analysis.videos.length > 0) {
    const avgDuration = analysis.videos.reduce((a, v) => a + (v.duration || 0), 0) / analysis.videos.length;
    const avgViews = analysis.videos.reduce((a, v) => a + (v.viewCount || 0), 0) / analysis.videos.length;
    
    console.log('\n📈 Summary:');
    console.log(`   Average duration: ${avgDuration.toFixed(1)}s`);
    console.log(`   Average views: ${avgViews.toLocaleString()}`);
  }
}

// Show tracking status
function showStatus() {
  ensureDirs();
  
  const videos = fs.readdirSync(VIDEOS_DIR).filter(f => f.endsWith('.mp4'));
  
  console.log('\n📊 Competitor Tracking Status\n');
  console.log(`   Target: @codesinred / @mr.krabsamazondeals`);
  console.log(`   Downloaded videos: ${videos.length}`);
  
  if (fs.existsSync(ANALYSIS_FILE)) {
    const analysis = JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf-8'));
    console.log(`   Last analyzed: ${analysis.analyzedAt}`);
  }
  
  console.log('\n   Competitor profiles:');
  console.log(`   - IG: instagram.com/codesinred`);
  console.log(`   - TT: tiktok.com/@mr.krabsamazondeals`);
  console.log(`   - Links: linktr.ee/CodesInRed`);
}

// Compare to our videos
function compareVideos() {
  console.log('\n🔍 Comparison: DailyDealFeed vs CodesInRed\n');
  
  // Load our videos
  const ourVideos = [];
  const outputDir = path.join(__dirname, '..', 'output', 'approved');
  if (fs.existsSync(outputDir)) {
    const files = fs.readdirSync(outputDir).filter(f => f.endsWith('.mp4'));
    ourVideos.push(...files);
  }
  
  // Load competitor analysis
  let theirAnalysis = null;
  if (fs.existsSync(ANALYSIS_FILE)) {
    theirAnalysis = JSON.parse(fs.readFileSync(ANALYSIS_FILE, 'utf-8'));
  }
  
  console.log(`   Our videos: ${ourVideos.length}`);
  console.log(`   Their videos analyzed: ${theirAnalysis?.videos?.length || 0}`);
  
  if (theirAnalysis?.videos?.length > 0) {
    const avgTheirDuration = theirAnalysis.videos.reduce((a, v) => a + (v.duration || 0), 0) / theirAnalysis.videos.length;
    console.log(`\n   Their avg duration: ${avgTheirDuration.toFixed(1)}s`);
  }
  
  console.log('\n📝 Manual comparison checklist:');
  console.log('   [ ] Hook style (first 1-3s)');
  console.log('   [ ] Audio approach (voice/music)');
  console.log('   [ ] Text overlays');
  console.log('   [ ] Product presentation');
  console.log('   [ ] Transitions');
  console.log('   [ ] Call-to-action');
}

// Main
const [,, command, ...args] = process.argv;

switch (command) {
  case 'download':
    downloadVideos(parseInt(args[0]) || 5);
    break;
  case 'analyze':
    analyzeVideos();
    break;
  case 'status':
    showStatus();
    break;
  case 'compare':
    compareVideos();
    break;
  default:
    console.log(`
Competitor Tracker - Monitor @codesinred content

Usage:
  node competitor-tracker.js download [count]  - Download latest videos
  node competitor-tracker.js analyze           - Analyze downloaded videos  
  node competitor-tracker.js status            - Show tracking status
  node competitor-tracker.js compare           - Compare to our videos
`);
}
