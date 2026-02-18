/**
 * Product Pipeline Workflow Definition
 * Phase 6 of Cloudflare Migration
 * 
 * Orchestrates the complete product processing pipeline:
 * 1. Validate product input
 * 2. Capture screenshot (browser-worker)
 * 3. Upload/process media (media-worker)
 * 4. Generate embed (embed-worker)
 * 5. Request approval (steering-worker)
 * 6. Publish on approval
 */

import {
  WorkflowEntrypoint,
  WorkflowStep,
  WorkflowEvent,
} from 'cloudflare:workers';

import type {
  Env,
  ProductInput,
  WorkflowState,
  ValidationResult,
  ScreenshotResult,
  MediaUploadResult,
  EmbedResult,
  ApprovalResult,
  PublishResult,
  StepResult,
} from './types';

// Retry configuration
const RETRY_CONFIG = {
  maxAttempts: 3,
  backoffMs: 1000,
  backoffMultiplier: 2,
};

// Default approval timeout (24 hours)
const DEFAULT_APPROVAL_TIMEOUT_MS = 24 * 60 * 60 * 1000;

export class ProductPipelineWorkflow extends WorkflowEntrypoint<Env, ProductInput> {
  /**
   * Main workflow execution
   */
  async run(event: WorkflowEvent<ProductInput>, step: WorkflowStep): Promise<WorkflowState> {
    const input = event.payload;
    const workflowId = event.instanceId;
    
    // Initialize workflow state
    const state: WorkflowState = {
      productId: input.productId,
      asin: input.asin,
      status: 'pending',
      steps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    
    try {
      // ============ Step 1: Validate Input ============
      state.status = 'validating';
      await this.updateState(workflowId, state);
      
      const validation = await step.do('validate', async () => {
        return await this.validateProduct(input);
      });
      
      state.steps.push(this.createStepResult('validate', validation));
      
      if (!validation.valid) {
        throw new Error(`Validation failed: ${validation.issues?.join(', ')}`);
      }
      
      // ============ Check Pipeline Pause Status ============
      const isPaused = await step.do('check_pipeline', async () => {
        return await this.checkPipelinePaused();
      });
      
      if (isPaused) {
        // Wait for pipeline to resume (sleep with periodic checks)
        await step.sleep('wait_for_resume', 60_000); // Check every minute
        // Re-check will happen on workflow resume
      }
      
      // ============ Step 2: Capture Screenshot ============
      state.status = 'capturing_screenshot';
      await this.updateState(workflowId, state);
      
      const screenshot = await step.do('capture_screenshot', {
        retries: {
          limit: RETRY_CONFIG.maxAttempts,
          delay: RETRY_CONFIG.backoffMs,
          backoff: 'exponential',
        },
      }, async () => {
        return await this.captureScreenshot(input);
      });
      
      state.steps.push(this.createStepResult('capture_screenshot', screenshot));
      
      // ============ Step 3: Upload/Process Media ============
      state.status = 'uploading_media';
      await this.updateState(workflowId, state);
      
      const media = await step.do('upload_media', {
        retries: {
          limit: RETRY_CONFIG.maxAttempts,
          delay: RETRY_CONFIG.backoffMs,
          backoff: 'exponential',
        },
      }, async () => {
        return await this.uploadMedia(input, screenshot);
      });
      
      state.steps.push(this.createStepResult('upload_media', media));
      
      // ============ Step 4: Generate Embed ============
      state.status = 'generating_embed';
      await this.updateState(workflowId, state);
      
      const embed = await step.do('generate_embed', {
        retries: {
          limit: RETRY_CONFIG.maxAttempts,
          delay: RETRY_CONFIG.backoffMs,
          backoff: 'exponential',
        },
      }, async () => {
        return await this.generateEmbed(input, screenshot, media);
      });
      
      state.steps.push(this.createStepResult('generate_embed', embed));
      
      if (!embed.success) {
        throw new Error(`Embed generation failed: ${embed.error}`);
      }
      
      // ============ Step 5: Approval Gate ============
      let approval: ApprovalResult;
      
      if (input.skipApproval) {
        // Auto-approve if flag is set
        approval = {
          approved: true,
          approvedBy: 'system:auto-approve',
          approvedAt: Date.now(),
        };
        state.steps.push(this.createStepResult('approval', { skipped: true }));
      } else {
        state.status = 'awaiting_approval';
        await this.updateState(workflowId, state);
        
        // Request approval from steering controller
        await step.do('request_approval', async () => {
          return await this.requestApproval(workflowId, input, screenshot, media, embed);
        });
        
        // Wait for approval event with timeout
        const timeoutMs = parseInt(this.env.APPROVAL_TIMEOUT_HOURS || '24') * 60 * 60 * 1000 || DEFAULT_APPROVAL_TIMEOUT_MS;
        
        const approvalEvent = await step.waitForEvent<ApprovalResult>('approval', {
          timeout: timeoutMs,
        });
        
        if (approvalEvent === null) {
          // Timeout - treat as rejection
          approval = {
            approved: false,
            timedOut: true,
            rejectedReason: 'Approval timed out',
          };
        } else {
          approval = approvalEvent;
        }
        
        state.steps.push(this.createStepResult('approval', approval));
      }
      
      // ============ Step 6: Publish ============
      if (!approval.approved) {
        state.status = 'cancelled';
        state.error = approval.rejectedReason || 'Approval denied';
        state.completedAt = Date.now();
        await this.updateState(workflowId, state);
        return state;
      }
      
      state.status = 'publishing';
      await this.updateState(workflowId, state);
      
      const publishResult = await step.do('publish', {
        retries: {
          limit: RETRY_CONFIG.maxAttempts,
          delay: RETRY_CONFIG.backoffMs,
          backoff: 'exponential',
        },
      }, async () => {
        return await this.publish(input, screenshot, media, embed);
      });
      
      state.steps.push(this.createStepResult('publish', publishResult));
      
      if (!publishResult.success) {
        throw new Error(`Publishing failed: ${publishResult.error}`);
      }
      
      // ============ Complete ============
      state.status = 'completed';
      state.completedAt = Date.now();
      state.result = publishResult;
      await this.updateState(workflowId, state);
      
      // Send completion webhook if configured
      await step.do('notify_complete', async () => {
        await this.notifyCompletion(workflowId, state);
      });
      
      return state;
      
    } catch (error) {
      // Handle workflow failure
      state.status = 'failed';
      state.error = error instanceof Error ? error.message : String(error);
      state.completedAt = Date.now();
      
      await this.updateState(workflowId, state);
      
      // Notify failure
      await step.do('notify_failure', async () => {
        await this.notifyFailure(workflowId, state, error);
      });
      
      throw error;
    }
  }
  
  // ============ Step Implementations ============
  
  /**
   * Validate product input
   */
  private async validateProduct(input: ProductInput): Promise<ValidationResult> {
    const issues: string[] = [];
    
    if (!input.productId) {
      issues.push('Missing productId');
    }
    
    if (!input.asin || !/^[A-Z0-9]{10}$/.test(input.asin)) {
      issues.push('Invalid ASIN format (must be 10 alphanumeric characters)');
    }
    
    if (!input.url || !input.url.startsWith('http')) {
      issues.push('Invalid product URL');
    }
    
    if (!input.name) {
      issues.push('Missing product name');
    }
    
    return {
      valid: issues.length === 0,
      productId: input.productId,
      asin: input.asin,
      url: input.url,
      issues: issues.length > 0 ? issues : undefined,
    };
  }
  
  /**
   * Check if pipeline is paused
   */
  private async checkPipelinePaused(): Promise<boolean> {
    try {
      const state = await this.env.STEERING_KV.get('pipeline:state', 'json') as { status?: string } | null;
      return state?.status === 'paused';
    } catch {
      return false;
    }
  }
  
  /**
   * Capture product screenshot via browser-worker
   */
  private async captureScreenshot(input: ProductInput): Promise<ScreenshotResult> {
    const response = await this.env.BROWSER_WORKER.fetch('https://browser-worker/screenshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: input.url,
        asin: input.asin,
        format: 'webp',
        width: 390,
        height: 844,
      }),
    });
    
    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Screenshot capture failed: ${response.status} ${text}`);
    }
    
    return await response.json() as ScreenshotResult;
  }
  
  /**
   * Upload media via media-worker
   */
  private async uploadMedia(
    input: ProductInput,
    screenshot: ScreenshotResult
  ): Promise<MediaUploadResult> {
    // Initialize upload with metadata
    const initResponse = await this.env.MEDIA_WORKER.fetch('https://media-worker/upload/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        productId: input.productId,
        asin: input.asin,
        type: 'product-embed',
        screenshotKey: screenshot.key,
        metadata: {
          productName: input.name,
          price: input.price,
          originalPrice: input.originalPrice,
        },
      }),
    });
    
    if (!initResponse.ok) {
      const text = await initResponse.text();
      throw new Error(`Media upload init failed: ${initResponse.status} ${text}`);
    }
    
    const result = await initResponse.json() as MediaUploadResult;
    return result;
  }
  
  /**
   * Generate embed via embed-worker (or local generation)
   */
  private async generateEmbed(
    input: ProductInput,
    screenshot: ScreenshotResult,
    media: MediaUploadResult
  ): Promise<EmbedResult> {
    // Generate embed HTML
    const embedHtml = this.generateEmbedHtml(input, screenshot, media);
    
    // Store in R2
    const embedKey = `embeds/${input.asin}/${Date.now()}.html`;
    
    await this.env.EMBED_ASSETS.put(embedKey, embedHtml, {
      httpMetadata: {
        contentType: 'text/html; charset=utf-8',
      },
      customMetadata: {
        productId: input.productId,
        asin: input.asin,
        generatedAt: new Date().toISOString(),
      },
    });
    
    // Store product data in KV
    await this.env.WORKFLOW_KV.put(
      `embed:${input.asin}`,
      JSON.stringify({
        key: embedKey,
        productId: input.productId,
        asin: input.asin,
        name: input.name,
        price: input.price,
        screenshotKey: screenshot.key,
        mediaKey: media.key,
        generatedAt: Date.now(),
      }),
      { expirationTtl: 86400 * 30 } // 30 days
    );
    
    return {
      success: true,
      embedKey,
      embedUrl: `/embed/${embedKey}`,
      previewUrl: screenshot.key ? `/preview/${screenshot.key}` : undefined,
    };
  }
  
  /**
   * Generate embed HTML
   */
  private generateEmbedHtml(
    input: ProductInput,
    screenshot: ScreenshotResult,
    media: MediaUploadResult
  ): string {
    const discount = input.originalPrice && input.price 
      ? Math.round(((input.originalPrice - input.price) / input.originalPrice) * 100)
      : null;
    
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${this.escapeHtml(input.name)}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
    .embed-card {
      max-width: 400px;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      background: #fff;
    }
    .embed-image {
      width: 100%;
      aspect-ratio: 1;
      object-fit: cover;
    }
    .embed-content {
      padding: 16px;
    }
    .embed-title {
      font-size: 16px;
      font-weight: 600;
      line-height: 1.3;
      margin-bottom: 8px;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .embed-price {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .current-price {
      font-size: 24px;
      font-weight: 700;
      color: #B12704;
    }
    .original-price {
      font-size: 14px;
      color: #565959;
      text-decoration: line-through;
    }
    .discount-badge {
      background: #CC0C39;
      color: white;
      padding: 2px 8px;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 600;
    }
    .cta-button {
      display: block;
      width: 100%;
      padding: 12px;
      margin-top: 12px;
      background: #FFD814;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      text-align: center;
      text-decoration: none;
      color: #0F1111;
    }
    .cta-button:hover {
      background: #F7CA00;
    }
  </style>
</head>
<body>
  <div class="embed-card">
    ${screenshot.key ? `<img class="embed-image" src="/screenshot/${screenshot.key}" alt="${this.escapeHtml(input.name)}">` : ''}
    <div class="embed-content">
      <h2 class="embed-title">${this.escapeHtml(input.name)}</h2>
      <div class="embed-price">
        ${input.price ? `<span class="current-price">$${input.price.toFixed(2)}</span>` : ''}
        ${input.originalPrice ? `<span class="original-price">$${input.originalPrice.toFixed(2)}</span>` : ''}
        ${discount ? `<span class="discount-badge">${discount}% OFF</span>` : ''}
      </div>
      <a class="cta-button" href="${this.escapeHtml(input.url)}" target="_blank" rel="noopener">
        View Deal →
      </a>
    </div>
  </div>
</body>
</html>`;
  }
  
  /**
   * Request approval from steering controller
   */
  private async requestApproval(
    workflowId: string,
    input: ProductInput,
    screenshot: ScreenshotResult,
    media: MediaUploadResult,
    embed: EmbedResult
  ): Promise<void> {
    // Store approval request in steering KV
    const approvalRequest = {
      workflowId,
      productId: input.productId,
      asin: input.asin,
      productName: input.name,
      screenshotKey: screenshot.key,
      mediaKey: media.key,
      embedKey: embed.embedKey,
      requestedAt: Date.now(),
      status: 'pending',
    };
    
    await this.env.STEERING_KV.put(
      `approval:${workflowId}`,
      JSON.stringify(approvalRequest),
      { expirationTtl: 86400 * 7 } // 7 days
    );
    
    // Add to approval queue index
    const queueIndex = await this.env.STEERING_KV.get<string[]>('approval:queue', 'json') || [];
    queueIndex.push(workflowId);
    await this.env.STEERING_KV.put('approval:queue', JSON.stringify(queueIndex));
    
    // Log activity
    await this.logActivity({
      action: 'approval_requested',
      workflowId,
      productId: input.productId,
      details: `Approval requested for ${input.name} (${input.asin})`,
    });
  }
  
  /**
   * Publish the product embed
   */
  private async publish(
    input: ProductInput,
    screenshot: ScreenshotResult,
    media: MediaUploadResult,
    embed: EmbedResult
  ): Promise<PublishResult> {
    // Mark as published in KV
    await this.env.WORKFLOW_KV.put(
      `published:${input.asin}`,
      JSON.stringify({
        productId: input.productId,
        asin: input.asin,
        name: input.name,
        embedKey: embed.embedKey,
        screenshotKey: screenshot.key,
        mediaKey: media.key,
        publishedAt: Date.now(),
      })
    );
    
    // Queue for production distribution
    await this.env.PRODUCTION_QUEUE.send({
      type: 'product_published',
      productId: input.productId,
      asin: input.asin,
      embedKey: embed.embedKey,
      publishedAt: Date.now(),
    });
    
    return {
      success: true,
      publishedAt: Date.now(),
      embedUrl: embed.embedUrl,
      screenshotUrl: screenshot.key ? `/screenshot/${screenshot.key}` : undefined,
      mediaUrl: media.mediaUrl,
    };
  }
  
  // ============ Helper Methods ============
  
  /**
   * Update workflow state in KV
   */
  private async updateState(workflowId: string, state: WorkflowState): Promise<void> {
    state.updatedAt = Date.now();
    await this.env.WORKFLOW_KV.put(
      `workflow:${workflowId}`,
      JSON.stringify(state),
      { expirationTtl: 86400 * 7 } // 7 days
    );
  }
  
  /**
   * Create a step result record
   */
  private createStepResult(step: string, output: unknown): StepResult {
    const now = Date.now();
    const isError = output && typeof output === 'object' && 'error' in output;
    
    return {
      step,
      status: isError ? 'failed' : 'success',
      startedAt: now,
      completedAt: now,
      output,
      error: isError ? String((output as { error: unknown }).error) : undefined,
    };
  }
  
  /**
   * Log activity to steering KV
   */
  private async logActivity(entry: {
    action: string;
    workflowId?: string;
    productId?: string;
    details?: string;
  }): Promise<void> {
    const activities = await this.env.STEERING_KV.get<unknown[]>('activity:recent', 'json') || [];
    activities.unshift({
      ...entry,
      timestamp: Date.now(),
      user: 'workflow:system',
    });
    
    // Keep only last 100 entries
    const trimmed = activities.slice(0, 100);
    await this.env.STEERING_KV.put('activity:recent', JSON.stringify(trimmed));
  }
  
  /**
   * Notify completion via webhook
   */
  private async notifyCompletion(workflowId: string, state: WorkflowState): Promise<void> {
    if (!this.env.WEBHOOK_URL) return;
    
    try {
      await fetch(this.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'workflow.completed',
          workflowId,
          productId: state.productId,
          asin: state.asin,
          result: state.result,
          completedAt: state.completedAt,
        }),
      });
    } catch (error) {
      console.error('Failed to send completion webhook:', error);
    }
  }
  
  /**
   * Notify failure via webhook
   */
  private async notifyFailure(
    workflowId: string,
    state: WorkflowState,
    error: unknown
  ): Promise<void> {
    await this.logActivity({
      action: 'workflow_failed',
      workflowId,
      productId: state.productId,
      details: `Workflow failed: ${state.error}`,
    });
    
    if (!this.env.WEBHOOK_URL) return;
    
    try {
      await fetch(this.env.WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'workflow.failed',
          workflowId,
          productId: state.productId,
          asin: state.asin,
          error: state.error,
          failedAt: state.completedAt,
        }),
      });
    } catch (err) {
      console.error('Failed to send failure webhook:', err);
    }
  }
  
  /**
   * Escape HTML special characters
   */
  private escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}
