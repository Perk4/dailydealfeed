/**
 * Dashboard API Endpoints
 * Polling-friendly status endpoints for external dashboards
 */

import type { Env, DashboardData, SystemHealth, HealthCheck } from './types';
import {
  getPipelineState,
  getQueueSummary,
  getQueueItems,
  getRecentActivity,
} from './state';

/**
 * Handle dashboard API requests
 */
export async function handleDashboardRequest(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  
  // CORS headers for dashboard access
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-cache',
  };
  
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  let response: Response;
  
  try {
    switch (path) {
      case '/api/dashboard':
        response = await handleFullDashboard(env);
        break;
      case '/api/status':
        response = await handleStatusEndpoint(env);
        break;
      case '/api/queue':
        response = await handleQueueEndpoint(request, env);
        break;
      case '/api/health':
        response = await handleHealthEndpoint(env);
        break;
      case '/api/activity':
        response = await handleActivityEndpoint(request, env);
        break;
      default:
        response = Response.json({ error: 'Not found' }, { status: 404 });
    }
  } catch (error) {
    console.error('Dashboard error:', error);
    response = Response.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
  
  // Add CORS headers
  const headers = new Headers(response.headers);
  Object.entries(corsHeaders).forEach(([k, v]) => headers.set(k, v));
  
  return new Response(response.body, {
    status: response.status,
    headers,
  });
}

/**
 * GET /api/dashboard - Full dashboard data
 */
async function handleFullDashboard(env: Env): Promise<Response> {
  const [pipeline, queue, activity, health] = await Promise.all([
    getPipelineState(env.STEERING_KV),
    getQueueSummary(env.STEERING_KV),
    getRecentActivity(env.STEERING_KV, 20),
    checkSystemHealth(env),
  ]);
  
  const data: DashboardData = {
    pipeline,
    queue,
    recentActivity: activity,
    systemHealth: health,
  };
  
  return Response.json(data);
}

/**
 * GET /api/status - Pipeline status only
 */
async function handleStatusEndpoint(env: Env): Promise<Response> {
  const state = await getPipelineState(env.STEERING_KV);
  const summary = await getQueueSummary(env.STEERING_KV);
  
  return Response.json({
    status: state.status,
    isPaused: state.status === 'paused',
    pausedAt: state.pausedAt,
    pausedBy: state.pausedBy,
    lastActivity: state.lastActivity,
    queue: summary,
  });
}

/**
 * GET /api/queue - Queue items with filtering
 */
async function handleQueueEndpoint(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const status = url.searchParams.get('status') as any;
  const priority = url.searchParams.get('priority') as any;
  const limit = parseInt(url.searchParams.get('limit') || '50');
  
  const items = await getQueueItems(env.STEERING_KV, {
    status: status || undefined,
    priority: priority || undefined,
    limit: Math.min(limit, 100),
  });
  
  const summary = await getQueueSummary(env.STEERING_KV);
  
  return Response.json({
    items,
    total: items.length,
    summary,
  });
}

/**
 * GET /api/health - System health check
 */
async function handleHealthEndpoint(env: Env): Promise<Response> {
  const health = await checkSystemHealth(env);
  
  const statusCode = health.status === 'healthy' ? 200 : 
                     health.status === 'degraded' ? 200 : 503;
  
  return Response.json(health, { status: statusCode });
}

/**
 * GET /api/activity - Recent activity log
 */
async function handleActivityEndpoint(
  request: Request,
  env: Env
): Promise<Response> {
  const url = new URL(request.url);
  const limit = parseInt(url.searchParams.get('limit') || '20');
  
  const activity = await getRecentActivity(env.STEERING_KV, Math.min(limit, 100));
  
  return Response.json({
    activity,
    count: activity.length,
  });
}

/**
 * Run system health checks
 */
async function checkSystemHealth(env: Env): Promise<SystemHealth> {
  const checks: HealthCheck[] = [];
  
  // Check KV access
  try {
    const start = Date.now();
    await env.STEERING_KV.get('health:check');
    checks.push({
      name: 'kv_access',
      status: 'pass',
      latencyMs: Date.now() - start,
    });
  } catch (error) {
    checks.push({
      name: 'kv_access',
      status: 'fail',
      message: String(error),
    });
  }
  
  // Check pipeline state
  try {
    const state = await getPipelineState(env.STEERING_KV);
    checks.push({
      name: 'pipeline_state',
      status: 'pass',
      message: `Status: ${state.status}`,
    });
  } catch (error) {
    checks.push({
      name: 'pipeline_state',
      status: 'fail',
      message: String(error),
    });
  }
  
  // Check MEDIA_KV access (if bound)
  if (env.MEDIA_KV) {
    try {
      const start = Date.now();
      await env.MEDIA_KV.get('health:check');
      checks.push({
        name: 'media_kv_access',
        status: 'pass',
        latencyMs: Date.now() - start,
      });
    } catch (error) {
      checks.push({
        name: 'media_kv_access',
        status: 'fail',
        message: String(error),
      });
    }
  }
  
  // Determine overall status
  const failedChecks = checks.filter(c => c.status === 'fail');
  let status: SystemHealth['status'];
  
  if (failedChecks.length === 0) {
    status = 'healthy';
  } else if (failedChecks.length < checks.length / 2) {
    status = 'degraded';
  } else {
    status = 'unhealthy';
  }
  
  return { status, checks };
}

/**
 * Generate a simple HTML dashboard (optional, for direct browser viewing)
 */
export function generateDashboardHTML(data: DashboardData): string {
  const statusColors = {
    running: '#00ff00',
    paused: '#ffaa00',
    maintenance: '#ff6600',
  };
  
  return `<!DOCTYPE html>
<html>
<head>
  <title>Pipeline Dashboard</title>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="30">
  <style>
    body { font-family: system-ui, sans-serif; background: #1a1a2e; color: #eee; padding: 20px; }
    .container { max-width: 800px; margin: 0 auto; }
    .card { background: #16213e; border-radius: 8px; padding: 20px; margin: 10px 0; }
    .status { display: inline-block; padding: 4px 12px; border-radius: 4px; font-weight: bold; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 15px; }
    .stat { text-align: center; }
    .stat-value { font-size: 2em; font-weight: bold; }
    .stat-label { font-size: 0.9em; color: #888; }
    h1 { margin-top: 0; }
    ul { list-style: none; padding: 0; }
    li { padding: 8px 0; border-bottom: 1px solid #333; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎬 DailyDeal Pipeline</h1>
    
    <div class="card">
      <h2>Status</h2>
      <span class="status" style="background: ${statusColors[data.pipeline.status]}; color: #000;">
        ${data.pipeline.status.toUpperCase()}
      </span>
      ${data.pipeline.pausedBy ? `<p>Paused by ${data.pipeline.pausedBy}</p>` : ''}
    </div>
    
    <div class="card">
      <h2>Queue</h2>
      <div class="grid">
        <div class="stat">
          <div class="stat-value">${data.queue.pending}</div>
          <div class="stat-label">Pending</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.queue.processing}</div>
          <div class="stat-label">Processing</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.queue.awaitingApproval}</div>
          <div class="stat-label">Awaiting</div>
        </div>
        <div class="stat">
          <div class="stat-value">${data.queue.failed}</div>
          <div class="stat-label">Failed</div>
        </div>
      </div>
    </div>
    
    <div class="card">
      <h2>Recent Activity</h2>
      <ul>
        ${data.recentActivity.slice(0, 10).map(a => `
          <li>
            <strong>${a.action}</strong>
            ${a.user ? `by ${a.user}` : ''}
            <small style="color:#888">${new Date(a.timestamp).toLocaleString()}</small>
          </li>
        `).join('')}
      </ul>
    </div>
    
    <div class="card">
      <h2>System Health: ${data.systemHealth.status}</h2>
      <ul>
        ${data.systemHealth.checks.map(c => `
          <li>
            ${c.status === 'pass' ? '✅' : '❌'} ${c.name}
            ${c.latencyMs ? `(${c.latencyMs}ms)` : ''}
            ${c.message ? `- ${c.message}` : ''}
          </li>
        `).join('')}
      </ul>
    </div>
  </div>
</body>
</html>`;
}
