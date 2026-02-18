/**
 * Steering Worker Types - Phase 5 Cloudflare Migration
 * Discord Interactions API + KV-backed Pipeline Control
 */

export interface Env {
  // KV bindings
  STEERING_KV: KVNamespace;
  MEDIA_KV: KVNamespace;
  
  // Queue bindings for steering
  PROCESSING_QUEUE: Queue;
  WORKFLOW_QUEUE: Queue;
  
  // Discord configuration
  DISCORD_PUBLIC_KEY: string;
  DISCORD_APPLICATION_ID: string;
  DISCORD_BOT_TOKEN?: string;
  
  // Environment
  LOG_LEVEL: string;
}

// ============ Discord Interactions API Types ============

export enum InteractionType {
  PING = 1,
  APPLICATION_COMMAND = 2,
  MESSAGE_COMPONENT = 3,
  APPLICATION_COMMAND_AUTOCOMPLETE = 4,
  MODAL_SUBMIT = 5,
}

export enum InteractionResponseType {
  PONG = 1,
  CHANNEL_MESSAGE_WITH_SOURCE = 4,
  DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE = 5,
  DEFERRED_UPDATE_MESSAGE = 6,
  UPDATE_MESSAGE = 7,
  APPLICATION_COMMAND_AUTOCOMPLETE_RESULT = 8,
  MODAL = 9,
}

export interface DiscordInteraction {
  id: string;
  application_id: string;
  type: InteractionType;
  data?: InteractionData;
  guild_id?: string;
  channel_id?: string;
  member?: DiscordMember;
  user?: DiscordUser;
  token: string;
  version: number;
}

export interface InteractionData {
  id: string;
  name: string;
  type: number;
  options?: CommandOption[];
  custom_id?: string;
  values?: string[];
}

export interface CommandOption {
  name: string;
  type: number;
  value?: string | number | boolean;
  options?: CommandOption[];
}

export interface DiscordMember {
  user: DiscordUser;
  nick?: string;
  roles: string[];
  permissions: string;
}

export interface DiscordUser {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
}

export interface InteractionResponse {
  type: InteractionResponseType;
  data?: InteractionResponseData;
}

export interface InteractionResponseData {
  content?: string;
  embeds?: DiscordEmbed[];
  flags?: number;
  components?: any[];
}

export interface DiscordEmbed {
  title?: string;
  description?: string;
  color?: number;
  fields?: EmbedField[];
  footer?: { text: string; icon_url?: string };
  timestamp?: string;
}

export interface EmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

// ============ Pipeline State Types ============

export type PipelineStatus = 'running' | 'paused' | 'maintenance';

export interface PipelineState {
  status: PipelineStatus;
  pausedAt?: number;
  pausedBy?: string;
  resumedAt?: number;
  resumedBy?: string;
  lastActivity: number;
  stats: PipelineStats;
}

export interface PipelineStats {
  totalProcessed: number;
  totalFailed: number;
  totalPending: number;
  avgProcessingTime: number;
  lastUpdated: number;
}

// ============ Queue Item Types ============

export type QueuePriority = 'low' | 'normal' | 'high' | 'critical';

export interface QueueItem {
  id: string;
  uploadId: string;
  productId?: string;
  status: 'pending' | 'processing' | 'awaiting_approval' | 'approved' | 'published' | 'failed' | 'skipped';
  priority: QueuePriority;
  createdAt: number;
  updatedAt: number;
  retryCount?: number;
  metadata?: {
    filename?: string;
    size?: number;
    duration?: number;
    source?: string;
    title?: string;
    url?: string;
  };
  error?: string;
}

// ============ Command Queue Types (Offline Queueing) ============

export interface QueuedCommand {
  id: string;
  command: string;
  args: Record<string, string | number | boolean>;
  userId: string;
  username: string;
  channelId: string;
  queuedAt: number;
  status: 'pending' | 'executed' | 'failed';
  result?: string;
  executedAt?: number;
}

// ============ Dashboard Types ============

export interface DashboardData {
  pipeline: PipelineState;
  queue: QueueSummary;
  recentActivity: ActivityEntry[];
  systemHealth: SystemHealth;
}

export interface QueueSummary {
  pending: number;
  processing: number;
  awaitingApproval: number;
  failed: number;
  byPriority: Record<QueuePriority, number>;
}

export interface ActivityEntry {
  timestamp: number;
  action: string;
  user?: string;
  details?: string;
}

export interface SystemHealth {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: HealthCheck[];
}

export interface HealthCheck {
  name: string;
  status: 'pass' | 'fail';
  message?: string;
  latencyMs?: number;
}

// ============ KV Key Patterns ============

export const KV_KEYS = {
  PIPELINE_STATE: 'pipeline:state',
  QUEUE_ITEMS: 'queue:items',
  QUEUE_INDEX: (priority: QueuePriority) => `queue:index:${priority}`,
  ITEM: (id: string) => `item:${id}`,
  COMMAND_QUEUE: 'commands:pending',
  ACTIVITY_LOG: 'activity:recent',
  STATS: 'stats:current',
} as const;
