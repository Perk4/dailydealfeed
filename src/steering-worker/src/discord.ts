/**
 * Discord Interactions Handler
 * Verifies and routes Discord slash command interactions
 */

import type {
  Env,
  DiscordInteraction,
  InteractionResponse,
  InteractionType,
  InteractionResponseType,
} from './types';

// Ed25519 signature verification for Discord
const DISCORD_EPOCH = 1420070400000;

/**
 * Verify Discord interaction signature using Ed25519
 */
export async function verifyDiscordSignature(
  request: Request,
  publicKey: string
): Promise<{ valid: boolean; body?: string }> {
  const signature = request.headers.get('X-Signature-Ed25519');
  const timestamp = request.headers.get('X-Signature-Timestamp');
  
  if (!signature || !timestamp) {
    return { valid: false };
  }
  
  const body = await request.text();
  const message = timestamp + body;
  
  try {
    const key = await crypto.subtle.importKey(
      'raw',
      hexToUint8Array(publicKey),
      { name: 'Ed25519' },
      false,
      ['verify']
    );
    
    const isValid = await crypto.subtle.verify(
      'Ed25519',
      key,
      hexToUint8Array(signature),
      new TextEncoder().encode(message)
    );
    
    return { valid: isValid, body };
  } catch (error) {
    console.error('Signature verification error:', error);
    return { valid: false };
  }
}

/**
 * Convert hex string to Uint8Array
 */
function hexToUint8Array(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.substring(i, i + 2), 16);
  }
  return bytes;
}

/**
 * Create a PONG response for Discord ping
 */
export function createPongResponse(): Response {
  const response: InteractionResponse = {
    type: 1, // PONG
  };
  return Response.json(response);
}

/**
 * Create a message response
 */
export function createMessageResponse(
  content: string,
  ephemeral = false
): Response {
  const response: InteractionResponse = {
    type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      content,
      flags: ephemeral ? 64 : 0, // 64 = ephemeral
    },
  };
  return Response.json(response);
}

/**
 * Create an embed response
 */
export function createEmbedResponse(
  embed: {
    title?: string;
    description?: string;
    color?: number;
    fields?: Array<{ name: string; value: string; inline?: boolean }>;
    footer?: { text: string };
  },
  ephemeral = false
): Response {
  const response: InteractionResponse = {
    type: 4,
    data: {
      embeds: [embed],
      flags: ephemeral ? 64 : 0,
    },
  };
  return Response.json(response);
}

/**
 * Create a deferred response (for long-running commands)
 */
export function createDeferredResponse(ephemeral = false): Response {
  const response: InteractionResponse = {
    type: 5, // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
    data: {
      flags: ephemeral ? 64 : 0,
    },
  };
  return Response.json(response);
}

/**
 * Follow up to a deferred response
 */
export async function followUpInteraction(
  applicationId: string,
  interactionToken: string,
  content: string,
  botToken?: string
): Promise<void> {
  const url = `https://discord.com/api/v10/webhooks/${applicationId}/${interactionToken}`;
  
  await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(botToken && { Authorization: `Bot ${botToken}` }),
    },
    body: JSON.stringify({ content }),
  });
}

/**
 * Extract option value from interaction data
 */
export function getOptionValue<T = string>(
  interaction: DiscordInteraction,
  optionName: string
): T | undefined {
  const options = interaction.data?.options;
  if (!options) return undefined;
  
  const option = options.find(o => o.name === optionName);
  return option?.value as T | undefined;
}

/**
 * Get the user who invoked the command
 */
export function getInvoker(interaction: DiscordInteraction): {
  id: string;
  username: string;
} {
  const user = interaction.member?.user || interaction.user;
  return {
    id: user?.id || 'unknown',
    username: user?.username || 'Unknown User',
  };
}

// Color palette for embeds
export const EMBED_COLORS = {
  SUCCESS: 0x00ff00,   // Green
  ERROR: 0xff0000,     // Red
  WARNING: 0xffaa00,   // Orange
  INFO: 0x0099ff,      // Blue
  PAUSED: 0xffff00,    // Yellow
  CRITICAL: 0xff00ff,  // Magenta
};
