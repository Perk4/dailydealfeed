/**
 * Upload Handler - Pre-signed URL generation and multipart upload support
 */

import type { 
  Env, 
  UploadRequest, 
  PresignedUrlResponse, 
  CompleteMultipartRequest,
  UploadState,
  VideoUploadedMessage 
} from './types';

const MEGABYTE = 1024 * 1024;

/**
 * Generate a unique upload ID
 */
function generateUploadId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 10);
  return `upload_${timestamp}_${random}`;
}

/**
 * Validate upload request
 */
function validateUpload(request: UploadRequest, env: Env): { valid: boolean; error?: string } {
  const maxSize = parseInt(env.MAX_FILE_SIZE_MB) * MEGABYTE;
  const supportedFormats = env.SUPPORTED_FORMATS.split(',');
  
  if (request.size > maxSize) {
    return { valid: false, error: `File size exceeds maximum of ${env.MAX_FILE_SIZE_MB}MB` };
  }
  
  const ext = request.filename.split('.').pop()?.toLowerCase();
  if (!ext || !supportedFormats.includes(ext)) {
    return { valid: false, error: `Unsupported format. Allowed: ${supportedFormats.join(', ')}` };
  }
  
  return { valid: true };
}

/**
 * Generate the R2 key for storage
 */
function generateStorageKey(uploadId: string, filename: string): string {
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  const ext = filename.split('.').pop()?.toLowerCase() || 'mp4';
  
  return `videos/${year}/${month}/${day}/${uploadId}.${ext}`;
}

/**
 * Handle upload initiation - returns pre-signed URL(s)
 */
export async function handleUploadInit(
  request: Request,
  env: Env
): Promise<Response> {
  try {
    const body = await request.json() as UploadRequest;
    
    // Validate
    const validation = validateUpload(body, env);
    if (!validation.valid) {
      return Response.json({ error: validation.error }, { status: 400 });
    }
    
    const uploadId = generateUploadId();
    const key = generateStorageKey(uploadId, body.filename);
    const chunkSize = parseInt(env.MULTIPART_CHUNK_SIZE_MB) * MEGABYTE;
    const expiresIn = parseInt(env.PRESIGNED_URL_EXPIRY_SECS);
    const expiresAt = Date.now() + (expiresIn * 1000);
    
    // Determine if multipart upload is needed (>100MB default)
    const useMultipart = body.size > chunkSize;
    
    let response: PresignedUrlResponse;
    
    if (useMultipart) {
      // Create multipart upload
      const multipartUpload = await env.MEDIA_BUCKET.createMultipartUpload(key, {
        customMetadata: {
          uploadId,
          originalFilename: body.filename,
          contentType: body.contentType,
          ...(body.metadata?.productId && { productId: body.metadata.productId }),
          ...(body.metadata?.campaignId && { campaignId: body.metadata.campaignId }),
        },
      });
      
      // Calculate number of parts
      const numParts = Math.ceil(body.size / chunkSize);
      
      // Store state
      const state: UploadState = {
        uploadId,
        key,
        status: 'uploading',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: body.metadata,
        multipartUploadId: multipartUpload.uploadId,
        completedParts: 0,
        totalParts: numParts,
      };
      await env.MEDIA_KV.put(`upload:${uploadId}`, JSON.stringify(state), { expirationTtl: 86400 });
      
      response = {
        uploadId,
        multipartUploadId: multipartUpload.uploadId,
        partUrls: Array.from({ length: numParts }, (_, i) => ({
          partNumber: i + 1,
          // Client will upload directly to this worker endpoint
          url: `/upload/${uploadId}/part/${i + 1}`,
        })),
        expiresAt,
      };
    } else {
      // Simple single-part upload - provide direct upload URL
      const state: UploadState = {
        uploadId,
        key,
        status: 'pending',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        metadata: body.metadata,
      };
      await env.MEDIA_KV.put(`upload:${uploadId}`, JSON.stringify(state), { expirationTtl: 86400 });
      
      response = {
        uploadId,
        uploadUrl: `/upload/${uploadId}/file`,
        expiresAt,
      };
    }
    
    return Response.json(response, { status: 201 });
  } catch (error) {
    console.error('Upload init error:', error);
    return Response.json({ error: 'Failed to initialize upload' }, { status: 500 });
  }
}

/**
 * Handle direct file upload (simple upload)
 */
export async function handleFileUpload(
  request: Request,
  uploadId: string,
  env: Env
): Promise<Response> {
  try {
    // Get upload state
    const stateJson = await env.MEDIA_KV.get(`upload:${uploadId}`);
    if (!stateJson) {
      return Response.json({ error: 'Upload not found' }, { status: 404 });
    }
    
    const state: UploadState = JSON.parse(stateJson);
    if (state.status !== 'pending') {
      return Response.json({ error: 'Upload already processed' }, { status: 409 });
    }
    
    // Get file content
    const body = await request.arrayBuffer();
    const contentType = request.headers.get('content-type') || 'video/mp4';
    
    // Upload to R2
    await env.MEDIA_BUCKET.put(state.key, body, {
      httpMetadata: { contentType },
      customMetadata: {
        uploadId,
        ...(state.metadata?.productId && { productId: state.metadata.productId }),
        ...(state.metadata?.campaignId && { campaignId: state.metadata.campaignId }),
      },
    });
    
    // Update state
    state.status = 'processing';
    state.updatedAt = Date.now();
    await env.MEDIA_KV.put(`upload:${uploadId}`, JSON.stringify(state), { expirationTtl: 86400 });
    
    // Queue for processing
    const message: VideoUploadedMessage = {
      type: 'video_uploaded',
      uploadId,
      key: state.key,
      contentType,
      size: body.byteLength,
      timestamp: Date.now(),
      metadata: state.metadata,
    };
    await env.PROCESSING_QUEUE.send(message);
    
    return Response.json({
      uploadId,
      key: state.key,
      status: 'processing',
      message: 'Upload complete, processing queued',
    });
  } catch (error) {
    console.error('File upload error:', error);
    return Response.json({ error: 'Upload failed' }, { status: 500 });
  }
}

/**
 * Handle multipart part upload
 */
export async function handlePartUpload(
  request: Request,
  uploadId: string,
  partNumber: number,
  env: Env
): Promise<Response> {
  try {
    const stateJson = await env.MEDIA_KV.get(`upload:${uploadId}`);
    if (!stateJson) {
      return Response.json({ error: 'Upload not found' }, { status: 404 });
    }
    
    const state: UploadState = JSON.parse(stateJson);
    if (!state.multipartUploadId) {
      return Response.json({ error: 'Not a multipart upload' }, { status: 400 });
    }
    
    const body = await request.arrayBuffer();
    
    // Get the multipart upload object
    const multipartUpload = env.MEDIA_BUCKET.resumeMultipartUpload(state.key, state.multipartUploadId);
    
    // Upload the part
    const uploadedPart = await multipartUpload.uploadPart(partNumber, body);
    
    // Store part info in KV
    await env.MEDIA_KV.put(
      `upload:${uploadId}:part:${partNumber}`,
      JSON.stringify({ partNumber, etag: uploadedPart.etag }),
      { expirationTtl: 86400 }
    );
    
    // Update completed parts count
    state.completedParts = (state.completedParts || 0) + 1;
    state.updatedAt = Date.now();
    await env.MEDIA_KV.put(`upload:${uploadId}`, JSON.stringify(state), { expirationTtl: 86400 });
    
    return Response.json({
      uploadId,
      partNumber,
      etag: uploadedPart.etag,
      completedParts: state.completedParts,
      totalParts: state.totalParts,
    });
  } catch (error) {
    console.error('Part upload error:', error);
    return Response.json({ error: 'Part upload failed' }, { status: 500 });
  }
}

/**
 * Complete multipart upload
 */
export async function handleCompleteMultipart(
  request: Request,
  uploadId: string,
  env: Env
): Promise<Response> {
  try {
    const stateJson = await env.MEDIA_KV.get(`upload:${uploadId}`);
    if (!stateJson) {
      return Response.json({ error: 'Upload not found' }, { status: 404 });
    }
    
    const state: UploadState = JSON.parse(stateJson);
    if (!state.multipartUploadId) {
      return Response.json({ error: 'Not a multipart upload' }, { status: 400 });
    }
    
    // Gather all parts
    const parts: { partNumber: number; etag: string }[] = [];
    for (let i = 1; i <= (state.totalParts || 0); i++) {
      const partJson = await env.MEDIA_KV.get(`upload:${uploadId}:part:${i}`);
      if (!partJson) {
        return Response.json({ error: `Missing part ${i}` }, { status: 400 });
      }
      parts.push(JSON.parse(partJson));
    }
    
    // Sort by part number
    parts.sort((a, b) => a.partNumber - b.partNumber);
    
    // Complete the upload
    const multipartUpload = env.MEDIA_BUCKET.resumeMultipartUpload(state.key, state.multipartUploadId);
    const object = await multipartUpload.complete(parts.map(p => ({
      partNumber: p.partNumber,
      etag: p.etag,
    })));
    
    // Update state
    state.status = 'processing';
    state.updatedAt = Date.now();
    await env.MEDIA_KV.put(`upload:${uploadId}`, JSON.stringify(state), { expirationTtl: 86400 });
    
    // Clean up part keys
    for (let i = 1; i <= (state.totalParts || 0); i++) {
      await env.MEDIA_KV.delete(`upload:${uploadId}:part:${i}`);
    }
    
    // Queue for processing
    const message: VideoUploadedMessage = {
      type: 'video_uploaded',
      uploadId,
      key: state.key,
      contentType: 'video/mp4',
      size: object.size,
      timestamp: Date.now(),
      metadata: state.metadata,
    };
    await env.PROCESSING_QUEUE.send(message);
    
    return Response.json({
      uploadId,
      key: state.key,
      status: 'processing',
      message: 'Multipart upload complete, processing queued',
    });
  } catch (error) {
    console.error('Complete multipart error:', error);
    return Response.json({ error: 'Failed to complete multipart upload' }, { status: 500 });
  }
}

/**
 * Get upload status
 */
export async function handleUploadStatus(
  uploadId: string,
  env: Env
): Promise<Response> {
  const stateJson = await env.MEDIA_KV.get(`upload:${uploadId}`);
  if (!stateJson) {
    return Response.json({ error: 'Upload not found' }, { status: 404 });
  }
  
  const state: UploadState = JSON.parse(stateJson);
  
  return Response.json({
    uploadId: state.uploadId,
    key: state.key,
    status: state.status,
    createdAt: state.createdAt,
    updatedAt: state.updatedAt,
    metadata: state.metadata,
    qaReport: state.qaReport,
    completedParts: state.completedParts,
    totalParts: state.totalParts,
    error: state.error,
  });
}
