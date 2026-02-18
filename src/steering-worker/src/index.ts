/**
 * Steering Controller Worker - Main Entry Point
 * Phase 5 of Cloudflare Migration
 * 
 * Handles:
 * - Discord slash commands via Interactions API
 * - Pipeline state management (pause/resume)
 * - Priority queue steering
 * - Offline command queueing
 * - Dashboard API endpoints
 */

import type { Env, DiscordInteraction, InteractionType } from './types';
import { verifyDiscordSignature, createPongResponse, createMessageResponse } from './discord';
import { handleCommand } from './commands';
import { handleDashboardRequest, generateDashboardHTML } from './dashboard';
import { getPipelineState, getQueueSummary, getRecentActivity } from './state';

export default {
  /**
   * HTTP Request Handler
   */
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;
    const path = url.pathname;
    
    try {
      // ============ Health Check ============
      if (path === '/health') {
        return Response.json({
          status: 'healthy',
          version: '1.0.0',
          timestamp: Date.now(),
        });
      }
      
      // ============ Dashboard Endpoints ============
      if (path.startsWith('/api/')) {
        return handleDashboardRequest(request, env);
      }
      
      // ============ HTML Dashboard ============
      if (path === '/dashboard' || path === '/') {
        return handleHTMLDashboard(env);
      }
      
      // ============ Discord Interactions ============
      if (path === '/interactions' && method === 'POST') {
        return handleDiscordInteraction(request, env);
      }
      
      // ============ Register Commands (Admin) ============
      if (path === '/register-commands' && method === 'POST') {
        return handleRegisterCommands(request, env);
      }
      
      // Not found
      return Response.json({ error: 'Not found' }, { status: 404 });
      
    } catch (error) {
      console.error('Request error:', error);
      return Response.json(
        { error: 'Internal server error', message: String(error) },
        { status: 500 }
      );
    }
  },
};

/**
 * Handle Discord interaction requests
 */
async function handleDiscordInteraction(
  request: Request,
  env: Env
): Promise<Response> {
  // Verify signature
  const { valid, body } = await verifyDiscordSignature(request, env.DISCORD_PUBLIC_KEY);
  
  if (!valid) {
    return new Response('Invalid signature', { status: 401 });
  }
  
  const interaction: DiscordInteraction = JSON.parse(body!);
  
  // Handle PING (Discord verification)
  if (interaction.type === 1) { // PING
    console.log('Discord PING received');
    return createPongResponse();
  }
  
  // Handle slash commands
  if (interaction.type === 2) { // APPLICATION_COMMAND
    return handleCommand(interaction, env);
  }
  
  // Unknown interaction type
  return createMessageResponse('Unknown interaction type', true);
}

/**
 * Generate HTML dashboard
 */
async function handleHTMLDashboard(env: Env): Promise<Response> {
  const [pipeline, queue, activity] = await Promise.all([
    getPipelineState(env.STEERING_KV),
    getQueueSummary(env.STEERING_KV),
    getRecentActivity(env.STEERING_KV, 10),
  ]);
  
  // Simple health check inline
  const health = {
    status: 'healthy' as const,
    checks: [{ name: 'kv', status: 'pass' as const }],
  };
  
  const html = generateDashboardHTML({
    pipeline,
    queue,
    recentActivity: activity,
    systemHealth: health,
  });
  
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

/**
 * Register Discord slash commands
 * POST /register-commands with Authorization header
 */
async function handleRegisterCommands(
  request: Request,
  env: Env
): Promise<Response> {
  // Require bot token
  if (!env.DISCORD_BOT_TOKEN) {
    return Response.json(
      { error: 'DISCORD_BOT_TOKEN not configured' },
      { status: 500 }
    );
  }
  
  const commands = [
    {
      name: 'status',
      description: 'Show pipeline status overview',
    },
    {
      name: 'queue',
      description: 'Show pending queue items',
    },
    {
      name: 'priority',
      description: 'Set item priority level',
      options: [
        {
          name: 'id',
          description: 'Item ID (first 8 characters)',
          type: 3, // STRING
          required: true,
        },
        {
          name: 'level',
          description: 'Priority level',
          type: 3, // STRING
          required: true,
          choices: [
            { name: 'Critical', value: 'critical' },
            { name: 'High', value: 'high' },
            { name: 'Normal', value: 'normal' },
            { name: 'Low', value: 'low' },
          ],
        },
      ],
    },
    {
      name: 'pause',
      description: 'Pause pipeline processing',
    },
    {
      name: 'resume',
      description: 'Resume pipeline processing',
    },
    {
      name: 'approve',
      description: 'Approve video for publishing',
      options: [
        {
          name: 'id',
          description: 'Item ID to approve',
          type: 3, // STRING
          required: true,
        },
      ],
    },
  ];
  
  // Register global commands
  const url = `https://discord.com/api/v10/applications/${env.DISCORD_APPLICATION_ID}/commands`;
  
  const response = await fetch(url, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bot ${env.DISCORD_BOT_TOKEN}`,
    },
    body: JSON.stringify(commands),
  });
  
  if (!response.ok) {
    const error = await response.text();
    return Response.json(
      { error: 'Failed to register commands', details: error },
      { status: response.status }
    );
  }
  
  const result = await response.json();
  
  return Response.json({
    success: true,
    message: 'Commands registered successfully',
    commands: result,
  });
}
