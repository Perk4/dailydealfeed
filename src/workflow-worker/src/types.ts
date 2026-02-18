/**
 * Type definitions for the Product Pipeline Workflow
 * Phase 6 of Cloudflare Migration
 */

// ============ Environment Bindings ============

export interface Env {
  // Workflow binding
  PRODUCT_PIPELINE: Workflow;
  
  // Service bindings to other workers
  BROWSER_WORKER: Fetcher;
  MEDIA_WORKER: Fetcher;
  STEERING_WORKER: Fetcher;
  
  // KV namespaces
  WORKFLOW_KV: KVNamespace;
  STEERING_KV: KVNamespace;
  
  // R2 buckets
  EMBED_ASSETS: R2Bucket;
  
  // Queue producer
  PRODUCTION_QUEUE: Queue;
  
  // Configuration
  APPROVAL_TIMEOUT_HOURS: string;
  MAX_RETRIES: string;
  WEBHOOK_URL?: string;
}

// ============ Workflow Input/Output ============

export interface ProductInput {
  productId: string;
  asin: string;
  name: string;
  url: string;
  price?: number;
  originalPrice?: number;
  metadata?: Record<string, unknown>;
  priority?: 'critical' | 'high' | 'normal' | 'low';
  skipApproval?: boolean;
}

export interface WorkflowState {
  productId: string;
  asin: string;
  status: WorkflowStatus;
  steps: StepResult[];
  createdAt: number;
  updatedAt: number;
  completedAt?: number;
  error?: string;
  result?: PublishResult;
}

export type WorkflowStatus = 
  | 'pending'
  | 'validating'
  | 'capturing_screenshot'
  | 'uploading_media'
  | 'generating_embed'
  | 'awaiting_approval'
  | 'publishing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface StepResult {
  step: string;
  status: 'success' | 'failed' | 'skipped';
  startedAt: number;
  completedAt: number;
  output?: unknown;
  error?: string;
  retries?: number;
}

// ============ Step Outputs ============

export interface ValidationResult {
  valid: boolean;
  productId: string;
  asin: string;
  url: string;
  issues?: string[];
}

export interface ScreenshotResult {
  success: boolean;
  key?: string;
  url?: string;
  cached?: boolean;
  error?: string;
  retries?: number;
}

export interface MediaUploadResult {
  success: boolean;
  uploadId?: string;
  key?: string;
  mediaUrl?: string;
  thumbnailKey?: string;
  error?: string;
}

export interface EmbedResult {
  success: boolean;
  embedKey?: string;
  embedUrl?: string;
  previewUrl?: string;
  error?: string;
}

export interface ApprovalResult {
  approved: boolean;
  approvedBy?: string;
  approvedAt?: number;
  rejectedReason?: string;
  timedOut?: boolean;
}

export interface PublishResult {
  success: boolean;
  publishedAt?: number;
  embedUrl?: string;
  screenshotUrl?: string;
  mediaUrl?: string;
  error?: string;
}

// ============ Queue Messages ============

export interface ApprovalQueueMessage {
  type: 'approval_request';
  workflowId: string;
  productId: string;
  asin: string;
  productName: string;
  screenshotKey?: string;
  mediaKey?: string;
  embedKey?: string;
  requestedAt: number;
  timeoutAt: number;
}

export interface PublishQueueMessage {
  type: 'publish';
  workflowId: string;
  productId: string;
  asin: string;
  embedKey: string;
  screenshotKey?: string;
  mediaKey?: string;
  publishAt: number;
}

// ============ Workflow Events ============

export interface WorkflowEvent {
  type: 'approval_response' | 'cancel' | 'retry';
  payload: unknown;
}

export interface ApprovalResponseEvent {
  type: 'approval_response';
  payload: {
    approved: boolean;
    approvedBy?: string;
    rejectedReason?: string;
  };
}

// ============ Dashboard Types ============

export interface WorkflowSummary {
  active: number;
  completed: number;
  failed: number;
  awaitingApproval: number;
  byStatus: Record<WorkflowStatus, number>;
}

export interface RecentWorkflow {
  id: string;
  productId: string;
  asin: string;
  status: WorkflowStatus;
  createdAt: number;
  updatedAt: number;
  currentStep?: string;
}
