/**
 * Queue Consumer - Video processing pipeline stages
 */

import type {
  Env,
  QueueMessage,
  VideoUploadedMessage,
  MetadataExtractMessage,
  QAValidateMessage,
  QACompleteMessage,
  UploadState,
  VideoMetadata,
  FFProbeResult,
} from './types';
import { validateVideo, generateQAReport } from './qa';

/**
 * Main queue handler - routes messages to appropriate processors
 */
export async function handleQueue(
  batch: MessageBatch<QueueMessage>,
  env: Env
): Promise<void> {
  for (const message of batch.messages) {
    try {
      await processMessage(message.body, env);
      message.ack();
    } catch (error) {
      console.error(`Queue processing error for ${message.body.type}:`, error);
      
      // Retry logic
      const attempts = message.body.attempt || 0;
      if (attempts < 3) {
        // Will be retried
        message.retry({
          delaySeconds: Math.pow(2, attempts) * 10, // Exponential backoff
        });
      } else {
        // After 3 retries, ack to move to DLQ
        await updateUploadStatus(message.body.uploadId, 'failed', env, {
          error: `Processing failed after ${attempts} attempts: ${error}`,
        });
        message.ack();
      }
    }
  }
}

/**
 * Route message to appropriate handler
 */
async function processMessage(msg: QueueMessage, env: Env): Promise<void> {
  console.log(`Processing message type: ${msg.type} for upload: ${msg.uploadId}`);
  
  switch (msg.type) {
    case 'video_uploaded':
      await handleVideoUploaded(msg as VideoUploadedMessage, env);
      break;
    case 'metadata_extract':
      await handleMetadataExtract(msg as MetadataExtractMessage, env);
      break;
    case 'qa_validate':
      await handleQAValidate(msg as QAValidateMessage, env);
      break;
    case 'qa_complete':
      await handleQAComplete(msg as QACompleteMessage, env);
      break;
    case 'transcode_request':
      await handleTranscodeRequest(msg, env);
      break;
    case 'transcode_complete':
      await handleTranscodeComplete(msg, env);
      break;
    case 'cdn_purge':
      await handleCDNPurge(msg, env);
      break;
    default:
      console.warn(`Unknown message type: ${msg.type}`);
  }
}

/**
 * Stage 1: Video uploaded - trigger metadata extraction
 */
async function handleVideoUploaded(msg: VideoUploadedMessage, env: Env): Promise<void> {
  console.log(`Video uploaded: ${msg.key} (${msg.size} bytes)`);
  
  // Check if we have a local FFmpeg webhook configured
  const ffmpegWebhook = env.FFMPEG_WEBHOOK_URL;
  
  if (ffmpegWebhook) {
    // Request metadata extraction from local FFmpeg service
    const response = await fetch(ffmpegWebhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'probe',
        uploadId: msg.uploadId,
        key: msg.key,
        bucket: 'dailydeal-media',
        callbackUrl: `https://media-processor.workers.dev/callback/metadata`,
      }),
    });
    
    if (!response.ok) {
      throw new Error(`FFmpeg webhook failed: ${response.status}`);
    }
    
    console.log(`Metadata extraction requested for ${msg.uploadId}`);
  } else {
    // No FFmpeg available - extract basic metadata from R2 object
    const object = await env.MEDIA_BUCKET.head(msg.key);
    
    const basicMetadata: VideoMetadata = {
      ...msg.metadata,
      // We can only get size without FFprobe
    };
    
    // Queue for QA validation with what we have
    const qaMessage: QAValidateMessage = {
      type: 'qa_validate',
      uploadId: msg.uploadId,
      key: msg.key,
      timestamp: Date.now(),
      metadata: basicMetadata,
      validations: [],
    };
    await env.PROCESSING_QUEUE.send(qaMessage);
  }
}

/**
 * Stage 2: Metadata extracted - comes from FFmpeg callback
 */
async function handleMetadataExtract(msg: MetadataExtractMessage, env: Env): Promise<void> {
  console.log(`Metadata extracted for: ${msg.uploadId}`);
  
  const ffprobeResult = msg.ffprobeResult;
  if (!ffprobeResult) {
    throw new Error('No FFprobe result in metadata extract message');
  }
  
  // Parse FFprobe result into our metadata format
  const videoStream = ffprobeResult.streams.find(s => s.codec_type === 'video');
  const audioStream = ffprobeResult.streams.find(s => s.codec_type === 'audio');
  
  const metadata: VideoMetadata = {
    ...msg.metadata,
    duration: ffprobeResult.format.duration,
    bitrate: Math.round(ffprobeResult.format.bit_rate / 1000), // Convert to kbps
    width: videoStream?.width,
    height: videoStream?.height,
    codec: videoStream?.codec_name,
    frameRate: videoStream?.r_frame_rate 
      ? parseFrameRate(videoStream.r_frame_rate) 
      : undefined,
  };
  
  // Update upload state with metadata
  await updateUploadMetadata(msg.uploadId, metadata, env);
  
  // Queue for QA validation
  const qaMessage: QAValidateMessage = {
    type: 'qa_validate',
    uploadId: msg.uploadId,
    key: msg.key,
    timestamp: Date.now(),
    metadata,
    validations: [],
  };
  await env.PROCESSING_QUEUE.send(qaMessage);
}

/**
 * Stage 3: QA Validation
 */
async function handleQAValidate(msg: QAValidateMessage, env: Env): Promise<void> {
  console.log(`Running QA validation for: ${msg.uploadId}`);
  
  const validations = validateVideo(msg.metadata || {}, env);
  const report = generateQAReport(msg.uploadId, msg.key, msg.metadata || {}, validations);
  
  // Store QA report
  await env.MEDIA_KV.put(`qa:${msg.uploadId}`, JSON.stringify(report), { expirationTtl: 604800 }); // 7 days
  
  // Update upload state with QA report
  await updateUploadQAReport(msg.uploadId, report, env);
  
  // Determine next steps based on QA result
  if (report.overall === 'pass') {
    // Complete message
    const completeMsg: QACompleteMessage = {
      type: 'qa_complete',
      uploadId: msg.uploadId,
      key: msg.key,
      timestamp: Date.now(),
      passed: true,
      metadata: msg.metadata,
    };
    await env.PROCESSING_QUEUE.send(completeMsg);
  } else if (report.overall === 'fail') {
    const failures = validations.filter(v => !v.passed).map(v => v.message || v.check);
    
    // Mark as failed but still send completion
    const completeMsg: QACompleteMessage = {
      type: 'qa_complete',
      uploadId: msg.uploadId,
      key: msg.key,
      timestamp: Date.now(),
      passed: false,
      failures,
      metadata: msg.metadata,
    };
    await env.PROCESSING_QUEUE.send(completeMsg);
  }
  
  // Send webhook if configured
  if (env.QA_WEBHOOK_ENABLED === 'true' && env.QA_WEBHOOK_URL) {
    await fetch(env.QA_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    }).catch(err => console.error('QA webhook failed:', err));
  }
}

/**
 * Stage 4: QA Complete - finalize processing
 */
async function handleQAComplete(msg: QACompleteMessage, env: Env): Promise<void> {
  console.log(`QA complete for ${msg.uploadId}: ${msg.passed ? 'PASSED' : 'FAILED'}`);
  
  if (msg.passed) {
    // Mark as complete
    await updateUploadStatus(msg.uploadId, 'complete', env);
  } else {
    // Mark as failed with reasons
    await updateUploadStatus(msg.uploadId, 'failed', env, {
      error: `QA validation failed: ${msg.failures?.join(', ')}`,
    });
  }
}

/**
 * Handle transcode request - delegates to external FFmpeg
 */
async function handleTranscodeRequest(msg: QueueMessage, env: Env): Promise<void> {
  console.log(`Transcode requested for: ${msg.uploadId}`);
  
  const ffmpegWebhook = env.FFMPEG_WEBHOOK_URL;
  if (!ffmpegWebhook) {
    console.warn('Transcode requested but no FFmpeg webhook configured');
    return;
  }
  
  await fetch(ffmpegWebhook, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'transcode',
      uploadId: msg.uploadId,
      key: msg.key,
      bucket: 'dailydeal-media',
      outputFormat: 'mp4',
      preset: 'web_optimized',
      callbackUrl: `https://media-processor.workers.dev/callback/transcode`,
    }),
  });
}

/**
 * Handle transcode completion
 */
async function handleTranscodeComplete(msg: QueueMessage, env: Env): Promise<void> {
  console.log(`Transcode complete for: ${msg.uploadId}`);
  
  // Update metadata with new transcoded info
  await updateUploadStatus(msg.uploadId, 'complete', env);
  
  // Queue CDN cache purge for original
  const purgeMsg: QueueMessage = {
    type: 'cdn_purge',
    uploadId: msg.uploadId,
    key: msg.key,
    timestamp: Date.now(),
  };
  await env.PROCESSING_QUEUE.send(purgeMsg);
}

/**
 * Handle CDN cache purge
 */
async function handleCDNPurge(msg: QueueMessage, env: Env): Promise<void> {
  console.log(`CDN purge for: ${msg.key}`);
  // CDN purge would be implemented via Cloudflare API
  // For R2, the object is served fresh anyway
}

// Helper functions

function parseFrameRate(rateStr: string): number {
  const parts = rateStr.split('/');
  if (parts.length === 2) {
    return Math.round((parseInt(parts[0]) / parseInt(parts[1])) * 100) / 100;
  }
  return parseFloat(rateStr);
}

async function updateUploadStatus(
  uploadId: string,
  status: UploadState['status'],
  env: Env,
  extra?: Partial<UploadState>
): Promise<void> {
  const stateJson = await env.MEDIA_KV.get(`upload:${uploadId}`);
  if (!stateJson) return;
  
  const state: UploadState = JSON.parse(stateJson);
  state.status = status;
  state.updatedAt = Date.now();
  if (extra) Object.assign(state, extra);
  
  await env.MEDIA_KV.put(`upload:${uploadId}`, JSON.stringify(state), { expirationTtl: 86400 });
}

async function updateUploadMetadata(
  uploadId: string,
  metadata: VideoMetadata,
  env: Env
): Promise<void> {
  const stateJson = await env.MEDIA_KV.get(`upload:${uploadId}`);
  if (!stateJson) return;
  
  const state: UploadState = JSON.parse(stateJson);
  state.metadata = { ...state.metadata, ...metadata };
  state.updatedAt = Date.now();
  
  await env.MEDIA_KV.put(`upload:${uploadId}`, JSON.stringify(state), { expirationTtl: 86400 });
}

async function updateUploadQAReport(
  uploadId: string,
  qaReport: any,
  env: Env
): Promise<void> {
  const stateJson = await env.MEDIA_KV.get(`upload:${uploadId}`);
  if (!stateJson) return;
  
  const state: UploadState = JSON.parse(stateJson);
  state.qaReport = qaReport;
  state.updatedAt = Date.now();
  
  await env.MEDIA_KV.put(`upload:${uploadId}`, JSON.stringify(state), { expirationTtl: 86400 });
}
