/**
 * KV-backed State Management
 * Pipeline state, queue items, and command queueing
 */

import type {
  Env,
  PipelineState,
  PipelineStats,
  QueueItem,
  QueuePriority,
  QueuedCommand,
  ActivityEntry,
  QueueSummary,
  KV_KEYS,
} from './types';

// KV key constants
const KEYS = {
  PIPELINE_STATE: 'pipeline:state',
  QUEUE_INDEX: 'queue:index',
  COMMAND_QUEUE: 'commands:pending',
  ACTIVITY_LOG: 'activity:recent',
  STATS: 'stats:current',
  item: (id: string) => `item:${id}`,
  upload: (uploadId: string) => `upload:${uploadId}`,
};

// Priority weights for sorting
const PRIORITY_WEIGHTS: Record<QueuePriority, number> = {
  critical: 4,
  high: 3,
  normal: 2,
  low: 1,
};

// ============ Pipeline State ============

/**
 * Get current pipeline state
 */
export async function getPipelineState(kv: KVNamespace): Promise<PipelineState> {
  const state = await kv.get<PipelineState>(KEYS.PIPELINE_STATE, 'json');
  
  if (!state) {
    // Return default state
    return {
      status: 'running',
      lastActivity: Date.now(),
      stats: {
        totalProcessed: 0,
        totalFailed: 0,
        totalPending: 0,
        avgProcessingTime: 0,
        lastUpdated: Date.now(),
      },
    };
  }
  
  return state;
}

/**
 * Update pipeline state
 */
export async function updatePipelineState(
  kv: KVNamespace,
  update: Partial<PipelineState>
): Promise<PipelineState> {
  const current = await getPipelineState(kv);
  const newState: PipelineState = {
    ...current,
    ...update,
    lastActivity: Date.now(),
  };
  
  await kv.put(KEYS.PIPELINE_STATE, JSON.stringify(newState));
  return newState;
}

/**
 * Pause the pipeline
 */
export async function pausePipeline(
  kv: KVNamespace,
  userId: string,
  username: string
): Promise<PipelineState> {
  const state = await updatePipelineState(kv, {
    status: 'paused',
    pausedAt: Date.now(),
    pausedBy: username,
  });
  
  await logActivity(kv, {
    timestamp: Date.now(),
    action: 'pipeline_paused',
    user: username,
    details: `Pipeline paused by ${username}`,
  });
  
  return state;
}

/**
 * Resume the pipeline
 */
export async function resumePipeline(
  kv: KVNamespace,
  userId: string,
  username: string
): Promise<PipelineState> {
  const state = await updatePipelineState(kv, {
    status: 'running',
    resumedAt: Date.now(),
    resumedBy: username,
    pausedAt: undefined,
    pausedBy: undefined,
  });
  
  await logActivity(kv, {
    timestamp: Date.now(),
    action: 'pipeline_resumed',
    user: username,
    details: `Pipeline resumed by ${username}`,
  });
  
  return state;
}

// ============ Queue Management ============

/**
 * Get queue index (list of item IDs with priorities)
 */
async function getQueueIndex(kv: KVNamespace): Promise<Array<{ id: string; priority: QueuePriority }>> {
  const index = await kv.get<Array<{ id: string; priority: QueuePriority }>>(
    KEYS.QUEUE_INDEX,
    'json'
  );
  return index || [];
}

/**
 * Save queue index
 */
async function saveQueueIndex(
  kv: KVNamespace,
  index: Array<{ id: string; priority: QueuePriority }>
): Promise<void> {
  // Sort by priority (critical > high > normal > low)
  index.sort((a, b) => PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority]);
  await kv.put(KEYS.QUEUE_INDEX, JSON.stringify(index));
}

/**
 * Get a queue item by ID
 */
export async function getQueueItem(kv: KVNamespace, id: string): Promise<QueueItem | null> {
  return await kv.get<QueueItem>(KEYS.item(id), 'json');
}

/**
 * Get all queue items
 */
export async function getQueueItems(
  kv: KVNamespace,
  options?: {
    status?: QueueItem['status'];
    priority?: QueuePriority;
    limit?: number;
  }
): Promise<QueueItem[]> {
  const index = await getQueueIndex(kv);
  const items: QueueItem[] = [];
  
  for (const entry of index) {
    if (options?.limit && items.length >= options.limit) break;
    if (options?.priority && entry.priority !== options.priority) continue;
    
    const item = await getQueueItem(kv, entry.id);
    if (item) {
      if (options?.status && item.status !== options.status) continue;
      items.push(item);
    }
  }
  
  return items;
}

/**
 * Add or update a queue item
 */
export async function upsertQueueItem(
  kv: KVNamespace,
  item: QueueItem
): Promise<void> {
  // Save the item
  await kv.put(KEYS.item(item.id), JSON.stringify(item));
  
  // Update index
  const index = await getQueueIndex(kv);
  const existingIdx = index.findIndex(e => e.id === item.id);
  
  if (existingIdx >= 0) {
    index[existingIdx].priority = item.priority;
  } else {
    index.push({ id: item.id, priority: item.priority });
  }
  
  await saveQueueIndex(kv, index);
}

/**
 * Update item priority
 */
export async function updateItemPriority(
  kv: KVNamespace,
  itemId: string,
  priority: QueuePriority,
  username: string
): Promise<QueueItem | null> {
  const item = await getQueueItem(kv, itemId);
  if (!item) return null;
  
  const oldPriority = item.priority;
  item.priority = priority;
  item.updatedAt = Date.now();
  
  await upsertQueueItem(kv, item);
  
  await logActivity(kv, {
    timestamp: Date.now(),
    action: 'priority_changed',
    user: username,
    details: `Item ${itemId}: ${oldPriority} → ${priority}`,
  });
  
  return item;
}

/**
 * Approve an item for publishing
 */
export async function approveItem(
  kv: KVNamespace,
  itemId: string,
  username: string
): Promise<QueueItem | null> {
  const item = await getQueueItem(kv, itemId);
  if (!item) return null;
  
  if (item.status !== 'awaiting_approval') {
    return item; // Can only approve items awaiting approval
  }
  
  item.status = 'approved';
  item.updatedAt = Date.now();
  
  await upsertQueueItem(kv, item);
  
  await logActivity(kv, {
    timestamp: Date.now(),
    action: 'item_approved',
    user: username,
    details: `Item ${itemId} approved for publishing`,
  });
  
  return item;
}

/**
 * Get queue summary statistics
 */
export async function getQueueSummary(kv: KVNamespace): Promise<QueueSummary> {
  const items = await getQueueItems(kv);
  
  const summary: QueueSummary = {
    pending: 0,
    processing: 0,
    awaitingApproval: 0,
    failed: 0,
    byPriority: {
      critical: 0,
      high: 0,
      normal: 0,
      low: 0,
    },
  };
  
  for (const item of items) {
    // Count by status
    switch (item.status) {
      case 'pending':
        summary.pending++;
        break;
      case 'processing':
        summary.processing++;
        break;
      case 'awaiting_approval':
        summary.awaitingApproval++;
        break;
      case 'failed':
        summary.failed++;
        break;
    }
    
    // Count by priority (only pending items)
    if (item.status === 'pending' || item.status === 'awaiting_approval') {
      summary.byPriority[item.priority]++;
    }
  }
  
  return summary;
}

// ============ Command Queueing (Offline Mode) ============

/**
 * Queue a command for later execution (when pipeline is busy)
 */
export async function queueCommand(
  kv: KVNamespace,
  command: Omit<QueuedCommand, 'id' | 'status' | 'queuedAt'>
): Promise<QueuedCommand> {
  const queued: QueuedCommand = {
    ...command,
    id: crypto.randomUUID(),
    status: 'pending',
    queuedAt: Date.now(),
  };
  
  const pendingCommands = await kv.get<QueuedCommand[]>(KEYS.COMMAND_QUEUE, 'json') || [];
  pendingCommands.push(queued);
  
  await kv.put(KEYS.COMMAND_QUEUE, JSON.stringify(pendingCommands));
  
  return queued;
}

/**
 * Get pending commands
 */
export async function getPendingCommands(kv: KVNamespace): Promise<QueuedCommand[]> {
  const commands = await kv.get<QueuedCommand[]>(KEYS.COMMAND_QUEUE, 'json');
  return commands?.filter(c => c.status === 'pending') || [];
}

/**
 * Mark command as executed
 */
export async function markCommandExecuted(
  kv: KVNamespace,
  commandId: string,
  result: string
): Promise<void> {
  const commands = await kv.get<QueuedCommand[]>(KEYS.COMMAND_QUEUE, 'json') || [];
  const idx = commands.findIndex(c => c.id === commandId);
  
  if (idx >= 0) {
    commands[idx].status = 'executed';
    commands[idx].result = result;
    commands[idx].executedAt = Date.now();
    
    await kv.put(KEYS.COMMAND_QUEUE, JSON.stringify(commands));
  }
}

// ============ Activity Logging ============

const MAX_ACTIVITY_ENTRIES = 100;

/**
 * Log an activity entry
 */
export async function logActivity(
  kv: KVNamespace,
  entry: ActivityEntry
): Promise<void> {
  const activities = await kv.get<ActivityEntry[]>(KEYS.ACTIVITY_LOG, 'json') || [];
  
  activities.unshift(entry);
  
  // Keep only recent entries
  const trimmed = activities.slice(0, MAX_ACTIVITY_ENTRIES);
  
  await kv.put(KEYS.ACTIVITY_LOG, JSON.stringify(trimmed));
}

/**
 * Get recent activity
 */
export async function getRecentActivity(
  kv: KVNamespace,
  limit = 10
): Promise<ActivityEntry[]> {
  const activities = await kv.get<ActivityEntry[]>(KEYS.ACTIVITY_LOG, 'json') || [];
  return activities.slice(0, limit);
}

// ============ Upload State Integration ============

/**
 * Sync upload state from MEDIA_KV to steering queue
 */
export async function syncUploadToQueue(
  steeringKv: KVNamespace,
  mediaKv: KVNamespace,
  uploadId: string
): Promise<QueueItem | null> {
  // Get upload state from media worker's KV
  const uploadState = await mediaKv.get<{
    uploadId: string;
    key: string;
    status: string;
    metadata?: {
      filename?: string;
      size?: number;
      productId?: string;
    };
  }>(KEYS.upload(uploadId), 'json');
  
  if (!uploadState) return null;
  
  // Create or update queue item
  const item: QueueItem = {
    id: uploadId,
    uploadId: uploadState.uploadId,
    productId: uploadState.metadata?.productId,
    status: mapUploadStatus(uploadState.status),
    priority: 'normal',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    metadata: {
      filename: uploadState.metadata?.filename,
      size: uploadState.metadata?.size,
    },
  };
  
  await upsertQueueItem(steeringKv, item);
  
  return item;
}

/**
 * Map media worker status to steering status
 */
function mapUploadStatus(status: string): QueueItem['status'] {
  switch (status) {
    case 'pending':
    case 'uploading':
      return 'pending';
    case 'processing':
      return 'processing';
    case 'complete':
      return 'awaiting_approval';
    case 'failed':
      return 'failed';
    default:
      return 'pending';
  }
}

// ============ Additional Control Functions ============

/**
 * Retry a failed item
 */
export async function retryItem(
  kv: KVNamespace,
  itemId: string,
  username: string
): Promise<QueueItem | null> {
  // Try partial match
  const index = await getQueueIndex(kv);
  const match = index.find(e => e.id.startsWith(itemId));
  const fullId = match?.id || itemId;
  
  const item = await getQueueItem(kv, fullId);
  if (!item) return null;
  
  if (item.status !== 'failed') {
    return item; // Only retry failed items
  }
  
  item.status = 'pending';
  item.retryCount = (item.retryCount || 0) + 1;
  item.error = undefined;
  item.updatedAt = Date.now();
  
  await upsertQueueItem(kv, item);
  
  await logActivity(kv, {
    timestamp: Date.now(),
    action: 'item_retried',
    user: username,
    details: `Item ${fullId.slice(0, 8)} queued for retry (attempt ${item.retryCount})`,
  });
  
  return item;
}

/**
 * Skip an item (remove from active queue)
 */
export async function skipItem(
  kv: KVNamespace,
  itemId: string,
  username: string,
  reason: string
): Promise<QueueItem | null> {
  const index = await getQueueIndex(kv);
  const match = index.find(e => e.id.startsWith(itemId));
  const fullId = match?.id || itemId;
  
  const item = await getQueueItem(kv, fullId);
  if (!item) return null;
  
  item.status = 'skipped' as QueueItem['status'];
  item.error = `Skipped: ${reason}`;
  item.updatedAt = Date.now();
  
  await upsertQueueItem(kv, item);
  
  await logActivity(kv, {
    timestamp: Date.now(),
    action: 'item_skipped',
    user: username,
    details: `Item ${fullId.slice(0, 8)} skipped: ${reason}`,
  });
  
  return item;
}

/**
 * Get processing statistics
 */
export async function getProcessingStats(kv: KVNamespace): Promise<{
  today: { processed: number; failed: number; published: number };
  allTime: { processed: number; published: number; avgProcessingMs: number | null };
  startedAt: number | null;
  queueRate: number;
  storageUsedMB: number | null;
}> {
  const stats = await kv.get<{
    daily: Record<string, { processed: number; failed: number; published: number }>;
    allTime: { processed: number; published: number; totalProcessingMs: number };
    startedAt: number;
  }>(KEYS.STATS, 'json');
  
  const today = new Date().toISOString().split('T')[0];
  const todayStats = stats?.daily?.[today] || { processed: 0, failed: 0, published: 0 };
  const allTime = stats?.allTime || { processed: 0, published: 0, totalProcessingMs: 0 };
  
  // Calculate average processing time
  const avgProcessingMs = allTime.processed > 0
    ? allTime.totalProcessingMs / allTime.processed
    : null;
  
  // Calculate queue rate (items/min over last hour - simplified)
  const queueRate = Math.round(todayStats.processed / 60) || 0;
  
  return {
    today: todayStats,
    allTime: {
      processed: allTime.processed,
      published: allTime.published,
      avgProcessingMs,
    },
    startedAt: stats?.startedAt || null,
    queueRate,
    storageUsedMB: null, // Would need R2 API call
  };
}

/**
 * Flush (remove) all failed items from queue
 */
export async function flushFailedItems(
  kv: KVNamespace,
  username: string
): Promise<number> {
  const items = await getQueueItems(kv, { status: 'failed' });
  const index = await getQueueIndex(kv);
  
  let count = 0;
  for (const item of items) {
    // Remove from index
    const idx = index.findIndex(e => e.id === item.id);
    if (idx >= 0) {
      index.splice(idx, 1);
      count++;
    }
    
    // Delete item data
    await kv.delete(KEYS.item(item.id));
  }
  
  await saveQueueIndex(kv, index);
  
  await logActivity(kv, {
    timestamp: Date.now(),
    action: 'queue_flushed',
    user: username,
    details: `Flushed ${count} failed items`,
  });
  
  return count;
}

/**
 * Get processing logs
 */
export async function getProcessingLogs(
  kv: KVNamespace,
  limit: number,
  filter?: string
): Promise<Array<{ timestamp: number; level: string; message: string }>> {
  const logs = await kv.get<Array<{ timestamp: number; level: string; message: string }>>(
    'logs:processing',
    'json'
  ) || [];
  
  let filtered = logs;
  if (filter) {
    const lowerFilter = filter.toLowerCase();
    filtered = logs.filter(log =>
      log.message.toLowerCase().includes(lowerFilter) ||
      log.level === lowerFilter
    );
  }
  
  return filtered.slice(0, limit);
}

/**
 * Get pipeline configuration
 */
export async function getPipelineConfig(kv: KVNamespace): Promise<{
  autoProcess: boolean;
  autoPublish: boolean;
  requireApproval: boolean;
  batchSize: number;
  concurrency: number;
  maxRetries: number;
  minQualityScore: number;
  notifyOnFailure: boolean;
  notifyOnPublish: boolean;
}> {
  const config = await kv.get<Record<string, unknown>>('config:pipeline', 'json');
  
  // Return defaults merged with stored config
  return {
    autoProcess: true,
    autoPublish: false,
    requireApproval: true,
    batchSize: 10,
    concurrency: 3,
    maxRetries: 3,
    minQualityScore: 70,
    notifyOnFailure: true,
    notifyOnPublish: true,
    ...config,
  };
}

/**
 * Update a pipeline configuration setting
 */
export async function updatePipelineConfig(
  kv: KVNamespace,
  setting: string,
  value: string,
  username: string
): Promise<boolean> {
  const config = await getPipelineConfig(kv);
  
  // Type coercion based on setting
  let parsedValue: unknown;
  const boolSettings = ['autoProcess', 'autoPublish', 'requireApproval', 'notifyOnFailure', 'notifyOnPublish'];
  const numSettings = ['batchSize', 'concurrency', 'maxRetries', 'minQualityScore'];
  
  if (boolSettings.includes(setting)) {
    parsedValue = value.toLowerCase() === 'true' || value === '1' || value.toLowerCase() === 'on';
  } else if (numSettings.includes(setting)) {
    parsedValue = parseInt(value, 10);
    if (isNaN(parsedValue as number)) return false;
  } else {
    parsedValue = value;
  }
  
  (config as Record<string, unknown>)[setting] = parsedValue;
  
  await kv.put('config:pipeline', JSON.stringify(config));
  
  await logActivity(kv, {
    timestamp: Date.now(),
    action: 'config_updated',
    user: username,
    details: `${setting} = ${value}`,
  });
  
  return true;
}
