/**
 * Workflow Worker - Main Entry Point
 * Phase 6 of Cloudflare Migration
 * 
 * Provides:
 * - HTTP API to trigger and monitor workflows
 * - Dashboard endpoint for pipeline status
 * - Approval event submission endpoint
 * - Workflow status and history endpoints
 */

import type {
  Env,
  ProductInput,
  WorkflowState,
  WorkflowSummary,
  RecentWorkflow,
  ApprovalResult,
} from './types';

// Re-export the workflow class for Cloudflare binding
export { ProductPipelineWorkflow } from './workflow';

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
      if (method === 'GET' && path === '/health') {
        response = Response.json({
          status: 'healthy',
          service: 'workflow-orchestrator',
          version: '1.0.0',
          timestamp: Date.now(),
        });
        
      } else if (method === 'POST' && path === '/workflow/start') {
        // Start a new workflow
        response = await handleStartWorkflow(request, env);
        
      } else if (method === 'GET' && path.match(/^\/workflow\/[\w-]+$/)) {
        // Get workflow status
        const workflowId = path.split('/')[2];
        response = await handleGetWorkflow(workflowId, env);
        
      } else if (method === 'POST' && path.match(/^\/workflow\/[\w-]+\/approve$/)) {
        // Approve a workflow
        const workflowId = path.split('/')[2];
        response = await handleApproveWorkflow(workflowId, request, env);
        
      } else if (method === 'POST' && path.match(/^\/workflow\/[\w-]+\/reject$/)) {
        // Reject a workflow
        const workflowId = path.split('/')[2];
        response = await handleRejectWorkflow(workflowId, request, env);
        
      } else if (method === 'POST' && path.match(/^\/workflow\/[\w-]+\/cancel$/)) {
        // Cancel a workflow
        const workflowId = path.split('/')[2];
        response = await handleCancelWorkflow(workflowId, env);
        
      } else if (method === 'GET' && path === '/workflows') {
        // List workflows
        response = await handleListWorkflows(url, env);
        
      } else if (method === 'GET' && path === '/workflows/pending-approval') {
        // List workflows awaiting approval
        response = await handlePendingApprovals(env);
        
      } else if (method === 'GET' && path === '/dashboard') {
        // Dashboard HTML
        response = await handleDashboard(env);
        
      } else if (method === 'GET' && path === '/api/summary') {
        // API: Workflow summary
        response = await handleSummary(env);
        
      } else if (method === 'GET' && path === '/api/recent') {
        // API: Recent workflows
        response = await handleRecentWorkflows(env);
        
      } else {
        response = Response.json({
          service: 'workflow-orchestrator',
          endpoints: {
            'POST /workflow/start': 'Start a new product workflow',
            'GET /workflow/:id': 'Get workflow status',
            'POST /workflow/:id/approve': 'Approve workflow',
            'POST /workflow/:id/reject': 'Reject workflow',
            'POST /workflow/:id/cancel': 'Cancel workflow',
            'GET /workflows': 'List all workflows',
            'GET /workflows/pending-approval': 'List workflows awaiting approval',
            'GET /dashboard': 'View dashboard',
            'GET /api/summary': 'Get workflow summary stats',
            'GET /api/recent': 'Get recent workflows',
            'GET /health': 'Health check',
          },
        });
      }
      
      // Add CORS headers
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
        { error: 'Internal server error', message: String(error) },
        { status: 500, headers: corsHeaders }
      );
    }
  },
};

// ============ Handlers ============

/**
 * Start a new workflow
 */
async function handleStartWorkflow(request: Request, env: Env): Promise<Response> {
  const input = await request.json() as ProductInput;
  
  // Validate required fields
  if (!input.productId || !input.asin || !input.url || !input.name) {
    return Response.json(
      { error: 'Missing required fields: productId, asin, url, name' },
      { status: 400 }
    );
  }
  
  // Generate workflow ID
  const workflowId = `wf-${input.asin}-${Date.now().toString(36)}`;
  
  // Start the workflow
  const instance = await env.PRODUCT_PIPELINE.create({
    id: workflowId,
    params: input,
  });
  
  // Store workflow metadata
  await env.WORKFLOW_KV.put(
    `workflow:${workflowId}`,
    JSON.stringify({
      productId: input.productId,
      asin: input.asin,
      status: 'pending',
      steps: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }),
    { expirationTtl: 86400 * 7 }
  );
  
  // Add to workflow index
  await addToWorkflowIndex(env, workflowId);
  
  return Response.json({
    success: true,
    workflowId,
    status: 'pending',
    message: `Workflow started for ${input.asin}`,
  });
}

/**
 * Get workflow status
 */
async function handleGetWorkflow(workflowId: string, env: Env): Promise<Response> {
  const state = await env.WORKFLOW_KV.get<WorkflowState>(`workflow:${workflowId}`, 'json');
  
  if (!state) {
    return Response.json({ error: 'Workflow not found' }, { status: 404 });
  }
  
  // Try to get live status from workflow instance
  try {
    const instance = await env.PRODUCT_PIPELINE.get(workflowId);
    const status = await instance.status();
    
    return Response.json({
      workflowId,
      ...state,
      instanceStatus: status.status,
    });
  } catch {
    // Instance may have completed or not exist
    return Response.json({
      workflowId,
      ...state,
    });
  }
}

/**
 * Approve a workflow
 */
async function handleApproveWorkflow(
  workflowId: string,
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.json() as { approvedBy?: string };
  
  try {
    const instance = await env.PRODUCT_PIPELINE.get(workflowId);
    
    // Send approval event
    await instance.sendEvent('approval', {
      approved: true,
      approvedBy: body.approvedBy || 'api:unknown',
      approvedAt: Date.now(),
    } as ApprovalResult);
    
    // Update approval request in KV
    const approvalKey = `approval:${workflowId}`;
    const approvalRequest = await env.STEERING_KV.get<Record<string, unknown>>(approvalKey, 'json');
    if (approvalRequest) {
      approvalRequest.status = 'approved';
      approvalRequest.approvedBy = body.approvedBy || 'api:unknown';
      approvalRequest.approvedAt = Date.now();
      await env.STEERING_KV.put(approvalKey, JSON.stringify(approvalRequest));
    }
    
    return Response.json({
      success: true,
      workflowId,
      message: 'Workflow approved',
    });
  } catch (error) {
    return Response.json(
      { error: 'Failed to approve workflow', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Reject a workflow
 */
async function handleRejectWorkflow(
  workflowId: string,
  request: Request,
  env: Env
): Promise<Response> {
  const body = await request.json() as { rejectedBy?: string; reason?: string };
  
  try {
    const instance = await env.PRODUCT_PIPELINE.get(workflowId);
    
    // Send rejection event
    await instance.sendEvent('approval', {
      approved: false,
      approvedBy: body.rejectedBy || 'api:unknown',
      rejectedReason: body.reason || 'Rejected via API',
    } as ApprovalResult);
    
    // Update approval request in KV
    const approvalKey = `approval:${workflowId}`;
    const approvalRequest = await env.STEERING_KV.get<Record<string, unknown>>(approvalKey, 'json');
    if (approvalRequest) {
      approvalRequest.status = 'rejected';
      approvalRequest.rejectedBy = body.rejectedBy || 'api:unknown';
      approvalRequest.rejectedReason = body.reason;
      approvalRequest.rejectedAt = Date.now();
      await env.STEERING_KV.put(approvalKey, JSON.stringify(approvalRequest));
    }
    
    return Response.json({
      success: true,
      workflowId,
      message: 'Workflow rejected',
    });
  } catch (error) {
    return Response.json(
      { error: 'Failed to reject workflow', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * Cancel a workflow
 */
async function handleCancelWorkflow(workflowId: string, env: Env): Promise<Response> {
  try {
    const instance = await env.PRODUCT_PIPELINE.get(workflowId);
    await instance.abort();
    
    // Update state in KV
    const state = await env.WORKFLOW_KV.get<WorkflowState>(`workflow:${workflowId}`, 'json');
    if (state) {
      state.status = 'cancelled';
      state.completedAt = Date.now();
      await env.WORKFLOW_KV.put(`workflow:${workflowId}`, JSON.stringify(state));
    }
    
    return Response.json({
      success: true,
      workflowId,
      message: 'Workflow cancelled',
    });
  } catch (error) {
    return Response.json(
      { error: 'Failed to cancel workflow', details: String(error) },
      { status: 500 }
    );
  }
}

/**
 * List workflows
 */
async function handleListWorkflows(url: URL, env: Env): Promise<Response> {
  const status = url.searchParams.get('status');
  const limit = parseInt(url.searchParams.get('limit') || '20');
  
  const index = await getWorkflowIndex(env);
  const workflows: RecentWorkflow[] = [];
  
  for (const id of index.slice(0, Math.min(limit * 2, 100))) {
    const state = await env.WORKFLOW_KV.get<WorkflowState>(`workflow:${id}`, 'json');
    if (state) {
      if (status && state.status !== status) continue;
      
      workflows.push({
        id,
        productId: state.productId,
        asin: state.asin,
        status: state.status,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        currentStep: state.steps[state.steps.length - 1]?.step,
      });
      
      if (workflows.length >= limit) break;
    }
  }
  
  return Response.json({ workflows, total: index.length });
}

/**
 * List workflows pending approval
 */
async function handlePendingApprovals(env: Env): Promise<Response> {
  const queueIndex = await env.STEERING_KV.get<string[]>('approval:queue', 'json') || [];
  const pending: unknown[] = [];
  
  for (const workflowId of queueIndex) {
    const request = await env.STEERING_KV.get(`approval:${workflowId}`, 'json') as Record<string, unknown> | null;
    if (request && request.status === 'pending') {
      pending.push({
        workflowId,
        ...request,
      });
    }
  }
  
  return Response.json({ pendingApprovals: pending, count: pending.length });
}

/**
 * Get workflow summary stats
 */
async function handleSummary(env: Env): Promise<Response> {
  const index = await getWorkflowIndex(env);
  
  const summary: WorkflowSummary = {
    active: 0,
    completed: 0,
    failed: 0,
    awaitingApproval: 0,
    byStatus: {
      pending: 0,
      validating: 0,
      capturing_screenshot: 0,
      uploading_media: 0,
      generating_embed: 0,
      awaiting_approval: 0,
      publishing: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    },
  };
  
  // Sample recent workflows for stats (limit to avoid timeout)
  const sampleSize = Math.min(index.length, 100);
  for (let i = 0; i < sampleSize; i++) {
    const state = await env.WORKFLOW_KV.get<WorkflowState>(`workflow:${index[i]}`, 'json');
    if (state) {
      summary.byStatus[state.status]++;
      
      if (state.status === 'completed') summary.completed++;
      else if (state.status === 'failed') summary.failed++;
      else if (state.status === 'awaiting_approval') summary.awaitingApproval++;
      else if (!['cancelled'].includes(state.status)) summary.active++;
    }
  }
  
  return Response.json({ summary, totalTracked: index.length });
}

/**
 * Get recent workflows
 */
async function handleRecentWorkflows(env: Env): Promise<Response> {
  const index = await getWorkflowIndex(env);
  const recent: RecentWorkflow[] = [];
  
  for (const id of index.slice(0, 20)) {
    const state = await env.WORKFLOW_KV.get<WorkflowState>(`workflow:${id}`, 'json');
    if (state) {
      recent.push({
        id,
        productId: state.productId,
        asin: state.asin,
        status: state.status,
        createdAt: state.createdAt,
        updatedAt: state.updatedAt,
        currentStep: state.steps[state.steps.length - 1]?.step,
      });
    }
  }
  
  return Response.json({ workflows: recent });
}

/**
 * Dashboard HTML
 */
async function handleDashboard(env: Env): Promise<Response> {
  const index = await getWorkflowIndex(env);
  const queueIndex = await env.STEERING_KV.get<string[]>('approval:queue', 'json') || [];
  
  // Count statuses
  const stats = { active: 0, completed: 0, failed: 0, pending: 0 };
  const recent: RecentWorkflow[] = [];
  
  for (const id of index.slice(0, 50)) {
    const state = await env.WORKFLOW_KV.get<WorkflowState>(`workflow:${id}`, 'json');
    if (state) {
      if (state.status === 'completed') stats.completed++;
      else if (state.status === 'failed') stats.failed++;
      else if (state.status === 'awaiting_approval') stats.pending++;
      else stats.active++;
      
      if (recent.length < 10) {
        recent.push({
          id,
          productId: state.productId,
          asin: state.asin,
          status: state.status,
          createdAt: state.createdAt,
          updatedAt: state.updatedAt,
        });
      }
    }
  }
  
  const html = generateDashboardHtml(stats, recent, queueIndex.length);
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

// ============ Helpers ============

async function getWorkflowIndex(env: Env): Promise<string[]> {
  const index = await env.WORKFLOW_KV.get<string[]>('workflow:index', 'json');
  return index || [];
}

async function addToWorkflowIndex(env: Env, workflowId: string): Promise<void> {
  const index = await getWorkflowIndex(env);
  index.unshift(workflowId);
  
  // Keep only last 1000 workflows
  const trimmed = index.slice(0, 1000);
  await env.WORKFLOW_KV.put('workflow:index', JSON.stringify(trimmed));
}

function generateDashboardHtml(
  stats: { active: number; completed: number; failed: number; pending: number },
  recent: RecentWorkflow[],
  pendingApprovals: number
): string {
  const statusColors: Record<string, string> = {
    pending: '#6B7280',
    validating: '#3B82F6',
    capturing_screenshot: '#8B5CF6',
    uploading_media: '#EC4899',
    generating_embed: '#F59E0B',
    awaiting_approval: '#EAB308',
    publishing: '#10B981',
    completed: '#22C55E',
    failed: '#EF4444',
    cancelled: '#9CA3AF',
  };
  
  const recentHtml = recent.map(w => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
        <code style="font-size: 12px;">${w.id.slice(0, 16)}...</code>
      </td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${w.asin}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
        <span style="background: ${statusColors[w.status] || '#6B7280'}; color: white; padding: 2px 8px; border-radius: 4px; font-size: 12px;">
          ${w.status}
        </span>
      </td>
      <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">
        ${new Date(w.updatedAt).toLocaleString()}
      </td>
    </tr>
  `).join('');
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Pipeline Dashboard - Workflow Orchestrator</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f3f4f6; }
    .container { max-width: 1200px; margin: 0 auto; padding: 24px; }
    h1 { font-size: 24px; margin-bottom: 24px; color: #111827; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin-bottom: 24px; }
    .stat-card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .stat-value { font-size: 36px; font-weight: 700; }
    .stat-label { color: #6B7280; font-size: 14px; margin-top: 4px; }
    .stat-card.active .stat-value { color: #3B82F6; }
    .stat-card.completed .stat-value { color: #22C55E; }
    .stat-card.failed .stat-value { color: #EF4444; }
    .stat-card.pending .stat-value { color: #EAB308; }
    .card { background: white; border-radius: 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); padding: 20px; margin-bottom: 24px; }
    .card h2 { font-size: 18px; margin-bottom: 16px; color: #111827; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 8px; border-bottom: 2px solid #e5e7eb; font-size: 12px; text-transform: uppercase; color: #6B7280; }
    .refresh { float: right; color: #3B82F6; text-decoration: none; font-size: 14px; }
    .empty { color: #9CA3AF; text-align: center; padding: 24px; }
  </style>
  <script>setTimeout(() => location.reload(), 30000);</script>
</head>
<body>
  <div class="container">
    <h1>🔄 Pipeline Dashboard <a href="/dashboard" class="refresh">↻ Refresh</a></h1>
    
    <div class="stats">
      <div class="stat-card active">
        <div class="stat-value">${stats.active}</div>
        <div class="stat-label">Active Workflows</div>
      </div>
      <div class="stat-card pending">
        <div class="stat-value">${pendingApprovals}</div>
        <div class="stat-label">Awaiting Approval</div>
      </div>
      <div class="stat-card completed">
        <div class="stat-value">${stats.completed}</div>
        <div class="stat-label">Completed</div>
      </div>
      <div class="stat-card failed">
        <div class="stat-value">${stats.failed}</div>
        <div class="stat-label">Failed</div>
      </div>
    </div>
    
    <div class="card">
      <h2>Recent Workflows</h2>
      ${recent.length > 0 ? `
        <table>
          <thead>
            <tr>
              <th>Workflow ID</th>
              <th>ASIN</th>
              <th>Status</th>
              <th>Updated</th>
            </tr>
          </thead>
          <tbody>
            ${recentHtml}
          </tbody>
        </table>
      ` : '<div class="empty">No workflows yet. Start one via POST /workflow/start</div>'}
    </div>
    
    <div class="card">
      <h2>API Endpoints</h2>
      <ul style="list-style: none; font-family: monospace; font-size: 13px; line-height: 2;">
        <li><strong>POST</strong> /workflow/start — Start new workflow</li>
        <li><strong>GET</strong> /workflow/:id — Get workflow status</li>
        <li><strong>POST</strong> /workflow/:id/approve — Approve workflow</li>
        <li><strong>POST</strong> /workflow/:id/reject — Reject workflow</li>
        <li><strong>GET</strong> /workflows/pending-approval — List pending</li>
        <li><strong>GET</strong> /api/summary — Get stats</li>
      </ul>
    </div>
  </div>
</body>
</html>`;
}
