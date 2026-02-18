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
  retryItem,
  skipItem,
  getProcessingStats,
  flushFailedItems,
  getQueueItem,
  getProcessingLogs,
  getPipelineConfig,
  updatePipelineConfig,
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
    case 'retry':
      return handleRetryCommand(interaction, env);
    case 'skip':
      return handleSkipCommand(interaction, env);
    case 'stats':
      return handleStatsCommand(interaction, env);
    case 'flush':
      return handleFlushCommand(interaction, env);
    case 'trigger':
      return handleTriggerCommand(interaction, env);
    case 'preview':
      return handlePreviewCommand(interaction, env);
    case 'logs':
      return handleLogsCommand(interaction, env);
    case 'config':
      return handleConfigCommand(interaction, env);
    case 'help':
      return handleHelpCommand(interaction, env);
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

/**
 * /retry <id> - Retry a failed item
 */
async function handleRetryCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const itemId = getOptionValue<string>(interaction, 'id');
  const invoker = getInvoker(interaction);
  
  if (!itemId) {
    return createMessageResponse('❌ Usage: `/retry <id>`', true);
  }
  
  const item = await retryItem(env.STEERING_KV, itemId, invoker.username);
  
  if (!item) {
    return createMessageResponse(`❌ Item not found: \`${itemId}\``, true);
  }
  
  if (item.status === 'failed') {
    return createMessageResponse(
      `⚠️ Item \`${itemId.slice(0, 8)}\` could not be retried - check logs`,
      true
    );
  }
  
  return createEmbedResponse({
    title: '🔄 Retry Queued',
    description: `Item \`${itemId.slice(0, 8)}\` has been queued for retry`,
    color: EMBED_COLORS.INFO,
    fields: [
      {
        name: 'Retry Count',
        value: `Attempt ${(item.retryCount || 0) + 1}`,
        inline: true,
      },
    ],
    footer: { text: `Triggered by ${invoker.username}` },
  });
}

/**
 * /skip <id> - Skip/cancel an item
 */
async function handleSkipCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const itemId = getOptionValue<string>(interaction, 'id');
  const reason = getOptionValue<string>(interaction, 'reason') || 'Manual skip';
  const invoker = getInvoker(interaction);
  
  if (!itemId) {
    return createMessageResponse('❌ Usage: `/skip <id> [reason]`', true);
  }
  
  const item = await skipItem(env.STEERING_KV, itemId, invoker.username, reason);
  
  if (!item) {
    return createMessageResponse(`❌ Item not found: \`${itemId}\``, true);
  }
  
  return createEmbedResponse({
    title: '⏭️ Item Skipped',
    description: `Item \`${itemId.slice(0, 8)}\` has been skipped`,
    color: EMBED_COLORS.WARNING,
    fields: [
      {
        name: 'Reason',
        value: reason,
        inline: false,
      },
    ],
    footer: { text: `Skipped by ${invoker.username}` },
  });
}

/**
 * /stats - Show processing statistics
 */
async function handleStatsCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const stats = await getProcessingStats(env.STEERING_KV);
  
  const uptime = stats.startedAt 
    ? formatDuration(Math.floor((Date.now() - stats.startedAt) / 1000))
    : 'Unknown';
  
  return createEmbedResponse({
    title: '📈 Processing Statistics',
    color: EMBED_COLORS.INFO,
    fields: [
      {
        name: '📊 Today',
        value: [
          `✅ Processed: **${stats.today.processed}**`,
          `❌ Failed: **${stats.today.failed}**`,
          `📺 Published: **${stats.today.published}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '📅 All Time',
        value: [
          `✅ Total: **${stats.allTime.processed}**`,
          `📺 Published: **${stats.allTime.published}**`,
          `⏱️ Avg Time: **${stats.allTime.avgProcessingMs ? `${(stats.allTime.avgProcessingMs / 1000).toFixed(1)}s` : 'N/A'}**`,
        ].join('\n'),
        inline: true,
      },
      {
        name: '🖥️ System',
        value: [
          `⏰ Uptime: **${uptime}**`,
          `🔄 Queue Rate: **${stats.queueRate}/min**`,
          `💾 Storage: **${stats.storageUsedMB?.toFixed(1) || '?'} MB**`,
        ].join('\n'),
        inline: false,
      },
    ],
    footer: { text: `Last updated: ${new Date().toISOString()}` },
  });
}

/**
 * /flush - Clear failed items from queue
 */
async function handleFlushCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const confirm = getOptionValue<boolean>(interaction, 'confirm');
  const invoker = getInvoker(interaction);
  
  if (!confirm) {
    return createEmbedResponse({
      title: '⚠️ Confirm Flush',
      description: 'This will permanently remove all **failed** items from the queue.\n\nRun `/flush confirm:true` to proceed.',
      color: EMBED_COLORS.WARNING,
    });
  }
  
  const count = await flushFailedItems(env.STEERING_KV, invoker.username);
  
  return createEmbedResponse({
    title: '🗑️ Queue Flushed',
    description: `Removed **${count}** failed items from the queue`,
    color: EMBED_COLORS.SUCCESS,
    footer: { text: `Flushed by ${invoker.username}` },
  });
}

/**
 * /trigger - Manually trigger processing cycle
 */
async function handleTriggerCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const invoker = getInvoker(interaction);
  const state = await getPipelineState(env.STEERING_KV);
  
  if (state.status === 'paused') {
    return createMessageResponse(
      '⚠️ Cannot trigger - pipeline is paused. Use `/resume` first.',
      true
    );
  }
  
  // Send message to workflow queue to trigger processing
  try {
    await env.WORKFLOW_QUEUE.send({
      type: 'manual_trigger',
      triggeredBy: invoker.username,
      timestamp: Date.now(),
    });
    
    return createEmbedResponse({
      title: '⚡ Processing Triggered',
      description: 'A processing cycle has been manually triggered',
      color: EMBED_COLORS.SUCCESS,
      footer: { text: `Triggered by ${invoker.username}` },
    });
  } catch (error) {
    return createMessageResponse(
      `❌ Failed to trigger: ${error}`,
      true
    );
  }
}

/**
 * /preview <id> - Get detailed item preview
 */
async function handlePreviewCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const itemId = getOptionValue<string>(interaction, 'id');
  
  if (!itemId) {
    return createMessageResponse('❌ Usage: `/preview <id>`', true);
  }
  
  const item = await getQueueItem(env.STEERING_KV, itemId);
  
  if (!item) {
    return createMessageResponse(`❌ Item not found: \`${itemId}\``, true);
  }
  
  const statusEmoji = {
    pending: '⏳',
    processing: '⚙️',
    awaiting_approval: '👀',
    approved: '✅',
    published: '📺',
    failed: '❌',
    skipped: '⏭️',
  }[item.status] || '❓';
  
  const priorityEmoji = {
    critical: '🔴',
    high: '🟠',
    normal: '🟢',
    low: '⚪',
  }[item.priority];
  
  const fields = [
    {
      name: 'Status',
      value: `${statusEmoji} ${item.status}`,
      inline: true,
    },
    {
      name: 'Priority',
      value: `${priorityEmoji} ${item.priority}`,
      inline: true,
    },
    {
      name: 'Created',
      value: `<t:${Math.floor(item.createdAt / 1000)}:R>`,
      inline: true,
    },
  ];
  
  if (item.metadata?.source) {
    fields.push({
      name: 'Source',
      value: item.metadata.source,
      inline: true,
    });
  }
  
  if (item.metadata?.filename) {
    fields.push({
      name: 'Filename',
      value: `\`${item.metadata.filename}\``,
      inline: true,
    });
  }
  
  if (item.error) {
    fields.push({
      name: '❌ Error',
      value: `\`\`\`${item.error.slice(0, 200)}\`\`\``,
      inline: false,
    });
  }
  
  if (item.retryCount) {
    fields.push({
      name: 'Retries',
      value: `${item.retryCount}`,
      inline: true,
    });
  }
  
  return createEmbedResponse({
    title: `📄 Item: ${item.id.slice(0, 8)}`,
    description: item.metadata?.title || item.metadata?.url || '_No description_',
    color: item.status === 'failed' ? EMBED_COLORS.ERROR : EMBED_COLORS.INFO,
    fields,
    footer: { text: `Full ID: ${item.id}` },
  });
}

/**
 * /logs - Show recent processing logs
 */
async function handleLogsCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const limit = getOptionValue<number>(interaction, 'limit') || 10;
  const filter = getOptionValue<string>(interaction, 'filter');
  
  const logs = await getProcessingLogs(env.STEERING_KV, limit, filter);
  
  if (logs.length === 0) {
    return createEmbedResponse({
      title: '📜 Processing Logs',
      description: '_No logs found_',
      color: EMBED_COLORS.INFO,
    });
  }
  
  const logLines = logs.map(log => {
    const time = new Date(log.timestamp).toLocaleTimeString('en-US', { hour12: false });
    const levelEmoji = {
      info: 'ℹ️',
      warn: '⚠️',
      error: '❌',
      success: '✅',
    }[log.level] || '📝';
    return `\`${time}\` ${levelEmoji} ${log.message}`;
  }).join('\n');
  
  return createEmbedResponse({
    title: '📜 Processing Logs',
    description: logLines,
    color: EMBED_COLORS.INFO,
    footer: { text: `Showing ${logs.length} entries${filter ? ` (filtered: ${filter})` : ''}` },
  });
}

/**
 * /config - Show/update pipeline configuration
 */
async function handleConfigCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  const setting = getOptionValue<string>(interaction, 'setting');
  const value = getOptionValue<string>(interaction, 'value');
  const invoker = getInvoker(interaction);
  
  const config = await getPipelineConfig(env.STEERING_KV);
  
  // If no setting provided, show current config
  if (!setting) {
    return createEmbedResponse({
      title: '⚙️ Pipeline Configuration',
      color: EMBED_COLORS.INFO,
      fields: [
        {
          name: '🔄 Processing',
          value: [
            `Auto-process: **${config.autoProcess ? 'ON' : 'OFF'}**`,
            `Batch size: **${config.batchSize}**`,
            `Concurrency: **${config.concurrency}**`,
            `Retry limit: **${config.maxRetries}**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '📺 Publishing',
          value: [
            `Auto-publish: **${config.autoPublish ? 'ON' : 'OFF'}**`,
            `Require approval: **${config.requireApproval ? 'YES' : 'NO'}**`,
            `Min quality: **${config.minQualityScore}%**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '🔔 Notifications',
          value: [
            `On failure: **${config.notifyOnFailure ? 'ON' : 'OFF'}**`,
            `On publish: **${config.notifyOnPublish ? 'ON' : 'OFF'}**`,
          ].join('\n'),
          inline: true,
        },
      ],
      footer: { text: 'Use /config setting:<name> value:<value> to update' },
    });
  }
  
  // Update setting
  if (!value) {
    return createMessageResponse('❌ Value required. Usage: `/config setting:<name> value:<value>`', true);
  }
  
  const validSettings = [
    'autoProcess', 'autoPublish', 'requireApproval',
    'batchSize', 'concurrency', 'maxRetries', 'minQualityScore',
    'notifyOnFailure', 'notifyOnPublish'
  ];
  
  if (!validSettings.includes(setting)) {
    return createMessageResponse(
      `❌ Invalid setting. Valid: ${validSettings.join(', ')}`,
      true
    );
  }
  
  const updated = await updatePipelineConfig(env.STEERING_KV, setting, value, invoker.username);
  
  if (!updated) {
    return createMessageResponse(`❌ Failed to update ${setting}`, true);
  }
  
  return createEmbedResponse({
    title: '⚙️ Config Updated',
    description: `**${setting}** set to \`${value}\``,
    color: EMBED_COLORS.SUCCESS,
    footer: { text: `Updated by ${invoker.username}` },
  });
}

/**
 * /help - Show available commands
 */
async function handleHelpCommand(
  interaction: DiscordInteraction,
  env: Env
): Promise<Response> {
  return createEmbedResponse({
    title: '🤖 Pipeline Commands',
    color: EMBED_COLORS.INFO,
    fields: [
      {
        name: '📊 Monitoring',
        value: [
          '`/status` - Pipeline overview',
          '`/queue` - View queue items',
          '`/stats` - Processing statistics',
          '`/logs [limit] [filter]` - Recent logs',
          '`/preview <id>` - Item details',
        ].join('\n'),
        inline: false,
      },
      {
        name: '🎮 Control',
        value: [
          '`/pause` - Pause processing',
          '`/resume` - Resume processing',
          '`/trigger` - Manual process cycle',
          '`/config [setting] [value]` - View/edit config',
        ].join('\n'),
        inline: false,
      },
      {
        name: '📝 Item Actions',
        value: [
          '`/priority <id> <level>` - Set priority',
          '`/approve <id>` - Approve for publish',
          '`/retry <id>` - Retry failed item',
          '`/skip <id> [reason]` - Skip item',
          '`/flush confirm:true` - Clear failed items',
        ].join('\n'),
        inline: false,
      },
    ],
    footer: { text: 'DailyDealFeed Pipeline • v1.0.0' },
  });
}
