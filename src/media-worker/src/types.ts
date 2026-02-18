/**
 * Media Worker Types - Phase 4 Cloudflare Migration
 */

export interface Env {
  // R2 binding
  MEDIA_BUCKET: R2Bucket;
  
  // Queue binding
  PROCESSING_QUEUE: Queue;
  
  // KV binding
  MEDIA_KV: KVNamespace;
  
  // Environment variables
  MAX_FILE_SIZE_MB: string;
  PRESIGNED_URL_EXPIRY_SECS: string;
  MULTIPART_CHUNK_SIZE_MB: string;
  SUPPORTED_FORMATS: string;
  MAX_BITRATE_KBPS: string;
  MIN_BITRATE_KBPS: string;
  QA_WEBHOOK_ENABLED: string;
  QA_WEBHOOK_URL?: string;
  FFMPEG_WEBHOOK_URL?: string;
}

// Upload request types
export interface UploadRequest {
  filename: string;
  contentType: string;
  size: number;
  metadata?: VideoMetadata;
}

export interface PresignedUrlResponse {
  uploadId: string;
  uploadUrl?: string;          // For simple uploads
  multipartUploadId?: string;  // For multipart uploads
  partUrls?: PartUrl[];        // For multipart uploads
  expiresAt: number;
}

export interface PartUrl {
  partNumber: number;
  url: string;
}

export interface CompleteMultipartRequest {
  uploadId: string;
  multipartUploadId: string;
  parts: CompletedPart[];
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

// Video metadata types
export interface VideoMetadata {
  duration?: number;      // seconds
  width?: number;
  height?: number;
  bitrate?: number;       // kbps
  codec?: string;
  frameRate?: number;
  productId?: string;
  campaignId?: string;
  source?: string;
}

// Queue message types
export type QueueMessageType = 
  | 'video_uploaded'
  | 'metadata_extract'
  | 'qa_validate'
  | 'qa_complete'
  | 'transcode_request'
  | 'transcode_complete'
  | 'cdn_purge';

export interface QueueMessage {
  type: QueueMessageType;
  uploadId: string;
  key: string;
  timestamp: number;
  metadata?: VideoMetadata;
  attempt?: number;
}

export interface VideoUploadedMessage extends QueueMessage {
  type: 'video_uploaded';
  contentType: string;
  size: number;
}

export interface MetadataExtractMessage extends QueueMessage {
  type: 'metadata_extract';
  ffprobeResult?: FFProbeResult;
}

export interface QAValidateMessage extends QueueMessage {
  type: 'qa_validate';
  validations: ValidationResult[];
}

export interface QACompleteMessage extends QueueMessage {
  type: 'qa_complete';
  passed: boolean;
  failures?: string[];
}

// FFmpeg/FFprobe types
export interface FFProbeResult {
  format: {
    duration: number;
    size: number;
    bit_rate: number;
    format_name: string;
  };
  streams: FFProbeStream[];
}

export interface FFProbeStream {
  codec_type: 'video' | 'audio';
  codec_name: string;
  width?: number;
  height?: number;
  r_frame_rate?: string;
  bit_rate?: number;
  channels?: number;
  sample_rate?: number;
}

// QA Validation types
export interface ValidationResult {
  check: string;
  passed: boolean;
  value?: number | string;
  expected?: string;
  message?: string;
}

export interface QAReport {
  uploadId: string;
  key: string;
  timestamp: number;
  overall: 'pass' | 'fail' | 'warning';
  validations: ValidationResult[];
  metadata: VideoMetadata;
}

// CDN Cache types
export interface CDNCacheRule {
  pattern: string;
  ttl: number;
  cacheControl: string;
}

// Upload state for KV
export interface UploadState {
  uploadId: string;
  key: string;
  status: 'pending' | 'uploading' | 'processing' | 'complete' | 'failed';
  createdAt: number;
  updatedAt: number;
  metadata?: VideoMetadata;
  qaReport?: QAReport;
  multipartUploadId?: string;
  completedParts?: number;
  totalParts?: number;
  error?: string;
}
