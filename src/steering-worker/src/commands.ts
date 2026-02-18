/**
 * Discord Slash Command Handlers
 * Implements pipeline control commands
 */

import type { Env, DiscordInteraction, QueuePriority } from './types';
import {
  createMessageResponse,
  createEmbedResponse,
  getOptionValue,
  getInvoker,
  EMBED_COLORS,
} from './discord';
import {
  getPipelineState,
  pausePipeline,
  resumePipeline,
  getQueueItems,
  getQueueSummary,
  updateItemPriority,
  approveItem,
  getRecentActivity,
} from './state';

/**
 * Route command to appropriate handler
 */
export async function handleCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const commandName = interaction.data?.name;
  const invoker = getInvoker(interaction);
  
  console.log(`Command: /${commandName} by ${invoker.username}`);
  
  switch (commandName) {
    case 'status':
      return handleStatusCommand(interaction, env);
    case 'queue':
      return handleQueueCommand(interaction, env);
    case 'priority':
      return handlePriorityCommand(interaction, env);
    case 'pause':
      return handlePauseCommand(interaction, env);
    case 'resume':
      return handleResumeCommand(interaction, env);
    case 'approve':
      return handleApproveCommand(interaction, env);
    default:
      return createMessageResponse(`Unknown command: ${commandName}`, true);
  }
}

/**
 * /status - Pipeline status overview
 */
async function handleStatusCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const state = await getPipelineState(env.STEERING_KV);
  const summary = await getQueueSummary(env.STEERING_KV);
  const activity = await getRecentActivity(env.STEERING_KV, 5);
  
  // Status emoji based on state
  const statusEmoji = {
    running: '🟢',
    paused: '🟡',
    maintenance: '🔧',
  }[state.status];
  
  // Format activity log
  const activityLog = activity.length > 0
    ? activity.map(a => {
        const time = new Date(a.timestamp).toLocaleTimeString('en-US', { hour12: false });
        return `\`${time}\` ${a.action}${a.user ? ` (${a.user})` : ''}`;
      }).join('\n')
    : '_No recent activity_';
  
  return createEmbedResponse({
    title: `${statusEmoji} Pipeline Status`,
    description: state.status === 'paused'
      ? `⚠️ **Paused** by ${state.pausedBy || 'unknown'} at <t:${Math.floor((state.pausedAt || Date.now()) / 1000)}:R>`
      : `Pipeline is **${state.status}**`,
    color: state.status === 'running' ? EMBED_COLORS.SUCCESS : EMBED_COLORS.PAUSED,
    fields: [
      {
        name: '📊 Queue',
        value: [
          `⏳ Pending: **${summary.pending}**`,
          `⚙️ Processing: **${summary.processing}**`,
          `👀 Awaiting Approval: **${summary.awaitingApproval}**`,
          `❌ Failed: **${summary.failed}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🎯 By Priority',
        value: [
          `🔴 Critical: **${summary.byPriority.critical}**`,
          `🟠 High: **${summary.byPriority.high}**`,
          `🟢 Normal: **${summary.byPriority.normal}**`,
          `⚪ Low: **${summary.byPriority.low}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '📜 Recent Activity',
        value: activityLog,
        inline: false,
      },
    ],
    footer: { text: `Last activity: ${new Date(state.lastActivity).toISOString()}` },
  });
}

/**
 * /queue - Show pending items
 */
async function handleQueueCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const items = await getQueueItems(env.STEERING_KV, { limit: 15 });
  
  if (items.length === 0) {
    return createEmbedResponse({
      title: '📋 Queue',
      description: '_No items in queue_',
      color: EMBED_COLORS.INFO,
    });
  }
  
  // Priority emoji mapping
  const priorityEmoji = {
    critical: '🔴',
    high: '🟠',
    normal: '🟢',
    low: '⚪',
  };
  
  // Status emoji mapping
  const statusEmoji = {
    pending: '⏳',
    processing: '⚙️',
    awaiting_approval: '👀',
    approved: '✅',
    published: '📺',
    failed: '❌',
  };
  
  const itemList = items.map((item, idx) => {
    const pEmoji = priorityEmoji[item.priority];
    const sEmoji = statusEmoji[item.status];
    const name = item.metadata?.filename || item.id.slice(0, 8);
    return `${idx + 1}. ${pEmoji}${sEmoji} \`${item.id.slice(0, 8)}\` - ${name}`;
  }).join('\n');
  
  return createEmbedResponse({
    title: '📋 Queue Items',
    description: itemList,
    color: EMBED_COLORS.INFO,
    footer: { text: `Showing ${items.length} items • Use /priority to reorder` },
  });
}

/**
 * /priority <id> <level> - Set item priority
 */
async function handlePriorityCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const itemId = getOptionValue<string>(interaction, 'id');
  const level = getOptionValue<string>(interaction, 'level') as QueuePriority;
  const invoker = getInvoker(interaction);
  
  if (!itemId || !level) {
    return createMessageResponse('❌ Usage: `/priority <id> <level>`', true);
  }
  
  // Validate priority level
  const validPriorities: QueuePriority[] = ['low', 'normal', 'high', 'critical'];
  if (!validPriorities.includes(level)) {
    return createMessageResponse(
      `❌ Invalid priority. Use: ${validPriorities.join(', ')}`,
      true
    );
  }
  
  const item = await updateItemPriority(env.STEERING_KV, itemId, level, invoker.username);
  
  if (!item) {
    return createMessageResponse(`❌ Item not found: \`${itemId}\``, true);
  }
  
  const priorityEmoji = {
    critical: '🔴',
    high: '🟠',
    normal: '🟢',
    low: '⚪',
  }[level];
  
  return createEmbedResponse({
    title: '🎯 Priority Updated',
    description: `Item \`${itemId.slice(0, 8)}\` set to ${priorityEmoji} **${level}**`,
    color: EMBED_COLORS.SUCCESS,
    footer: { text: `Updated by ${invoker.username}` },
  });
}

/**
 * /pause - Pause processing
 */
async function handlePauseCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const invoker = getInvoker(interaction);
  const currentState = await getPipelineState(env.STEERING_KV);
  
  if (currentState.status === 'paused') {
    return createMessageResponse(
      `⚠️ Pipeline is already paused (by ${currentState.pausedBy || 'unknown'})`,
      true
    );
  }
  
  await pausePipeline(env.STEERING_KV, invoker.id, invoker.username);
  
  return createEmbedResponse({
    title: '⏸️ Pipeline Paused',
    description: `Processing has been paused by **${invoker.username}**.\n\nUse \`/resume\` to continue.`,
    color: EMBED_COLORS.PAUSED,
  });
}

/**
 * /resume - Resume processing
 */
async function handleResumeCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const invoker = getInvoker(interaction);
  const currentState = await getPipelineState(env.STEERING_KV);
  
  if (currentState.status === 'running') {
    return createMessageResponse('⚠️ Pipeline is already running', true);
  }
  
  await resumePipeline(env.STEERING_KV, invoker.id, invoker.username);
  
  const pauseDuration = currentState.pausedAt
    ? Math.floor((Date.now() - currentState.pausedAt) / 1000)
    : 0;
  
  return createEmbedResponse({
    title: '▶️ Pipeline Resumed',
    description: `Processing has been resumed by **${invoker.username}**.\n\n${pauseDuration > 0 ? `Was paused for ${formatDuration(pauseDuration)}` : ''}`,
    color: EMBED_COLORS.SUCCESS,
  });
}

/**
 * /approve <id> - Approve video for publish
 */
async function handleApproveCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const itemId = getOptionValue<string>(interaction, 'id');
  const invoker = getInvoker(interaction);
  
  if (!itemId) {
    return createMessageResponse('❌ Usage: `/approve <id>`', true);
  }
  
  const item = await approveItem(env.STEERING_KV, itemId, invoker.username);
  
  if (!item) {
    return createMessageResponse(`❌ Item not found: \`${itemId}\``, true);
  }
  
  if (item.status !== 'approved') {
    return createMessageResponse(
      `⚠️ Item \`${itemId.slice(0, 8)}\` is in status \`${item.status}\` - can only approve items awaiting approval`,
      true
    );
  }
  
  return createEmbedResponse({
    title: '✅ Approved for Publishing',
    description: `Item \`${itemId.slice(0, 8)}\` has been approved by **${invoker.username}**`,
    color: EMBED_COLORS.SUCCESS,
    fields: [
      {
        name: 'Next Steps',
        value: 'Item will be queued for publishing in the next processing cycle.',
        inline: false,
      },
    ],
  });
}

/**
 * Format seconds to human-readable duration
 */
function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
  const hours = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${mins}m`;
}
