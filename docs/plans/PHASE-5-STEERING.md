# Phase 5: Steering Controller

**Status:** ✅ Complete  
**Agent:** steering-controller  
**Created:** 2026-02-18

## Overview

KV-backed Discord command handling for the dailydealfeed pipeline. Provides operational control via Discord slash commands and a polling-friendly dashboard API.

## Architecture

```
┌─────────────────┐     ┌─────────────────────────────────────┐
│   Discord       │     │  steering-controller Worker         │
│   Interactions  │────▶│                                     │
│   API           │     │  ┌─────────────┐  ┌──────────────┐  │
└─────────────────┘     │  │ Command     │  │ Dashboard    │  │
                        │  │ Handler     │  │ API          │  │
┌─────────────────┐     │  └─────────────┘  └──────────────┘  │
│   Dashboard     │────▶│         │              │            │
│   (Browser/Bot) │     │         ▼              ▼            │
└─────────────────┘     │  ┌─────────────────────────────┐    │
                        │  │       State Manager          │    │
                        │  │       (KV-backed)            │    │
                        │  └─────────────────────────────┘    │
                        │              │                       │
                        │              ▼                       │
                        │  ┌─────────────────────────────┐    │
                        │  │   STEERING_KV + MEDIA_KV    │    │
                        │  └─────────────────────────────┘    │
                        └─────────────────────────────────────┘
```

## Cloudflare Resources

### KV Namespace
- **STEERING_KV** - Pipeline state, queue items, activity log
  - `pipeline:state` - Current pipeline status (running/paused)
  - `queue:index` - Sorted list of queue items by priority
  - `item:{id}` - Individual queue item state
  - `commands:pending` - Offline command queue
  - `activity:recent` - Last 100 activity entries

### Queue Bindings
- **PROCESSING_QUEUE** → `migration-stage-queue` (producer)

## Discord Slash Commands

| Command | Description | Options |
|---------|-------------|---------|
| `/status` | Pipeline status overview | - |
| `/queue` | Show pending items | - |
| `/priority` | Set item priority | `id`, `level` (critical/high/normal/low) |
| `/pause` | Pause processing | - |
| `/resume` | Resume processing | - |
| `/approve` | Approve video for publish | `id` |

### Interactions API

Uses Discord's Interactions API (webhook-based):
- No persistent gateway connection needed
- Worker receives POST to `/interactions`
- Ed25519 signature verification
- Immediate response (no deferral needed for simple commands)

## Dashboard API

All endpoints return JSON with CORS headers.

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/dashboard` | GET | Full dashboard data |
| `/api/status` | GET | Pipeline status only |
| `/api/queue` | GET | Queue items (supports `?status=`, `?priority=`, `?limit=`) |
| `/api/health` | GET | System health checks |
| `/api/activity` | GET | Recent activity log |
| `/dashboard` | GET | HTML dashboard (auto-refresh) |

### Polling Strategy

Dashboard consumers should poll:
- `/api/status` every 10-30 seconds
- `/api/queue` when changes detected
- `/api/health` every 60 seconds

## State Machine

### Pipeline States
```
running ──pause──▶ paused
   ▲                  │
   └────resume────────┘
```

### Queue Item States
```
pending ──▶ processing ──▶ awaiting_approval ──▶ approved ──▶ published
    │           │                │                   │
    └───────────┴────────────────┴───────────────────┴──▶ failed
```

### Priority Levels
1. **critical** - Process immediately, skip queue
2. **high** - Process before normal items
3. **normal** - Default priority
4. **low** - Process after all higher priorities

## Offline Command Queueing

When the pipeline is busy or paused, commands can be queued:

```typescript
interface QueuedCommand {
  id: string;
  command: string;
  args: Record<string, any>;
  userId: string;
  username: string;
  queuedAt: number;
  status: 'pending' | 'executed' | 'failed';
}
```

Commands are stored in `commands:pending` KV key and executed when pipeline resumes.

## Files Created

```
src/steering-worker/
├── src/
│   ├── index.ts      # Main entry, request routing
│   ├── types.ts      # TypeScript types and interfaces
│   ├── discord.ts    # Discord signature verification, response helpers
│   ├── commands.ts   # Slash command handlers
│   ├── dashboard.ts  # Dashboard API endpoints
│   └── state.ts      # KV-backed state management
├── wrangler.toml     # Worker configuration
├── package.json      # Dependencies
└── tsconfig.json     # TypeScript config
```

## Deployment

### 1. Create KV Namespace
```bash
cd src/steering-worker
wrangler kv:namespace create STEERING_KV
# Note the ID and update wrangler.toml
```

### 2. Configure Discord Secrets
```bash
wrangler secret put DISCORD_PUBLIC_KEY
wrangler secret put DISCORD_APPLICATION_ID
wrangler secret put DISCORD_BOT_TOKEN  # Optional, for command registration
```

### 3. Deploy Worker
```bash
npm install
wrangler deploy
```

### 4. Register Discord Commands
```bash
# Get the worker URL from wrangler deploy output
curl -X POST https://steering-controller.<subdomain>.workers.dev/register-commands
```

### 5. Configure Discord Application
1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Select your application
3. Go to "General Information" → copy Public Key
4. Go to "Interactions Endpoint URL"
5. Set to: `https://steering-controller.<subdomain>.workers.dev/interactions`
6. Discord will verify the endpoint (PING/PONG)

## Security

- **Signature Verification**: All Discord interactions verified via Ed25519
- **No Gateway**: Webhook-based, no persistent connection needed
- **Secrets**: Discord credentials stored as Cloudflare secrets
- **CORS**: Dashboard API allows all origins (adjust for production)

## Integration Points

### With Media Worker (Phase 4)
- Reads from `MEDIA_KV` to sync upload states
- Item IDs correspond to upload IDs

### With Workflow (Phase 6)
- Pipeline state (`running`/`paused`) controls workflow execution
- Priority changes trigger queue reordering
- Approvals unlock publish step

## Monitoring

### Logs
```bash
wrangler tail steering-controller
```

### Dashboard
- HTML: `https://steering-controller.<subdomain>.workers.dev/dashboard`
- JSON: `https://steering-controller.<subdomain>.workers.dev/api/dashboard`

## Future Enhancements

1. **Discord Buttons** - Interactive approval buttons
2. **Webhooks** - Push notifications on state changes
3. **Metrics** - Processing time tracking, queue depth history
4. **Permissions** - Role-based command access
5. **Autocomplete** - Item ID suggestions for commands
