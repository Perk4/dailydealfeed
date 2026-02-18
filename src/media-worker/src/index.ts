/**
 * Media Processing Worker - Main Entry Point
 * Phase 4 of Cloudflare Migration
 * 
 * Handles:
 * - Pre-signed URL generation for uploads
 * - Multipart upload coordination
 * - Queue-driven video processing pipeline
 * - QA validation integration
 * - CDN cache control
 */

import type { Env, QueueMessage, MetadataExtractMessage } from './types';
import { 
  handleUploadInit, 
  handleFileUpload, 
  handlePartUpload, 
  handleCompleteMultipart,
  handleUploadStatus,
} from './upload';
import { handleQueue } from './queue';

// CDN Cache rules for video content
const CDN_CACHE_RULES = {
  // Original videos - short cache, may be updated
  'videos/': {
    cacheControl: 'public, max-age=3600, s-maxage=86400',
    ttl: 86400,
  },
  // Transcoded/processed videos - long cache
  'processed/': {
    cacheControl: 'public, max-age=31536000, immutable',
    ttl: 31536000,
  },
  // Thumbnails - long cache
  'thumbnails/': {
    cacheControl: 'public, max-age=604800, s-maxage=2592000',
    ttl: 2592000,
  },
};

export default {
  /**
   * HTTP Request Handler
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    };
    
    // Handle preflight
    if (method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    try {
      let response: Response;
      
      // Route requests
      if (method === 'POST' && path === '/upload/init') {
        // Initialize upload - get pre-signed URL(s)
        response = await handleUploadInit(request, env);
        
      } else if (method === 'PUT' && path.match(/^\/upload\/[\w-]+\/file$/)) {
        // Direct file upload (simple upload)
        const uploadId = path.split('/')[2];
        response = await handleFileUpload(request, uploadId, env);
        
      } else if (method === 'PUT' && path.match(/^\/upload\/[\w-]+\/part\/\d+$/)) {
        // Multipart part upload
        const parts = path.split('/');
        const uploadId = parts[2];
        const partNumber = parseInt(parts[4]);
        response = await handlePartUpload(request, uploadId, partNumber, env);
        
      } else if (method === 'POST' && path.match(/^\/upload\/[\w-]+\/complete$/)) {
        // Complete multipart upload
        const uploadId = path.split('/')[2];
        response = await handleCompleteMultipart(request, uploadId, env);
        
      } else if (method === 'GET' && path.match(/^\/upload\/[\w-]+$/)) {
        // Get upload status
        const uploadId = path.split('/')[2];
        response = await handleUploadStatus(uploadId, env);
        
      } else if (method === 'POST' && path === '/callback/metadata') {
        // FFmpeg metadata extraction callback
        response = await handleMetadataCallback(request, env);
        
      } else if (method === 'POST' && path === '/callback/transcode') {
        // FFmpeg transcode callback
        response = await handleTranscodeCallback(request, env);
        
      } else if (method === 'GET' && path.startsWith('/media/')) {
        // Serve media with CDN cache headers
        response = await handleMediaServe(path.slice(7), env);
        
      } else if (method === 'GET' && path === '/health') {
        // Health check
        response = Response.json({
          status: 'healthy',
          version: '1.0.0',
          timestamp: Date.now(),
        });
        
      } else {
        response = Response.json({ error: 'Not found' }, { status: 404 });
      }
      
      // Add CORS headers to response
      const headers = new Headers(response.headers);
      Object.entries(corsHeaders).forEach(([key, value]) => {
        headers.set(key, value);
      });
      
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
      
    } catch (error) {
      console.error('Request error:', error);
      return Response.json(
        { error: 'Internal server error' },
        { status: 500, headers: corsHeaders }
      );
    }
  },
  
  /**
   * Queue Handler - Process video pipeline messages
   */
  async queue(batch: MessageBatch<QueueMessage>, env: Env): Promise<void> {
    await handleQueue(batch, env);
  },
};

/**
 * Handle FFmpeg metadata extraction callback
 */
async function handleMetadataCallback(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    uploadId: string;
    key: string;
    ffprobeResult: any;
    error?: string;
  };
  
  if (body.error) {
    console.error(`Metadata extraction failed for ${body.uploadId}:`, body.error);
    return Response.json({ received: true, error: body.error });
  }
  
  // Queue metadata extract message
  const message: MetadataExtractMessage = {
    type: 'metadata_extract',
    uploadId: body.uploadId,
    key: body.key,
    timestamp: Date.now(),
    ffprobeResult: body.ffprobeResult,
  };
  await env.PROCESSING_QUEUE.send(message);
  
  return Response.json({ received: true });
}

/**
 * Handle FFmpeg transcode callback
 */
async function handleTranscodeCallback(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    uploadId: string;
    key: string;
    outputKey?: string;
    error?: string;
  };
  
  if (body.error) {
    console.error(`Transcode failed for ${body.uploadId}:`, body.error);
    // Could queue for retry or mark as failed
    return Response.json({ received: true, error: body.error });
  }
  
  // Queue transcode complete message
  await env.PROCESSING_QUEUE.send({
    type: 'transcode_complete',
    uploadId: body.uploadId,
    key: body.outputKey || body.key,
    timestamp: Date.now(),
  });
  
  return Response.json({ received: true });
}

/**
 * Serve media files with appropriate CDN cache headers
 */
async function handleMediaServe(key: string, env: Env): Promise<Response> {
  const object = await env.MEDIA_BUCKET.get(key);
  
  if (!object) {
    return Response.json({ error: 'Not found' }, { status: 404 });
  }
  
  // Determine cache rule based on path prefix
  let cacheControl = 'public, max-age=3600';
  for (const [prefix, rule] of Object.entries(CDN_CACHE_RULES)) {
    if (key.startsWith(prefix)) {
      cacheControl = rule.cacheControl;
      break;
    }
  }
  
  const headers = new Headers();
  headers.set('Content-Type', object.httpMetadata?.contentType || 'application/octet-stream');
  headers.set('Cache-Control', cacheControl);
  headers.set('ETag', object.httpEtag);
  
  // Add custom metadata as headers
  if (object.customMetadata) {
    for (const [key, value] of Object.entries(object.customMetadata)) {
      headers.set(`X-Media-${key}`, value);
    }
  }
  
  return new Response(object.body, { headers });
}
