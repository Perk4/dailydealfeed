# Phase 6: Workflow Orchestrator

**Status:** ✅ Complete  
**Agent:** workflow-master  
**Date:** 2026-02-18

## Overview

Phase 6 completes the Cloudflare migration by introducing Durable Workflows for end-to-end orchestration. This ties together all workers from Phases 1-5 into a cohesive, resilient pipeline with human-in-the-loop approval gates.

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    WORKFLOW ORCHESTRATOR                        │
│                  (Cloudflare Durable Workflows)                 │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────┐   ┌──────────┐   ┌───────────┐   ┌─────────────┐  │
│  │ Validate │──▶│Screenshot│──▶│Upload Media│──▶│Generate Embed│  │
│  └─────────┘   └──────────┘   └───────────┘   └─────────────┘  │
│        │             │              │                │          │
│        │       browser-worker  media-worker    embed logic      │
│        ▼                                             │          │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │                   APPROVAL GATE                          │   │
│  │              (waitForEvent with timeout)                │   │
│  └─────────────────────────────────────────────────────────┘   │
│        │                                                        │
│        │ steering-worker integration                           │
│        ▼                                                        │
│  ┌─────────┐                                                   │
│  │ Publish │──▶ production-queue                               │
│  └─────────┘                                                   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Workflow Steps

### 1. Validate Product Input
- Validates productId, ASIN, URL, and name
- Returns early with validation errors
- No retry needed (deterministic)

### 2. Check Pipeline Pause Status
- Queries `STEERING_KV:pipeline:state`
- If paused, workflow sleeps and re-checks
- Respects manual pipeline controls

### 3. Capture Screenshot (browser-worker)
- Calls `POST /screenshot` on browser-worker
- Mobile viewport emulation (iPhone 14 Pro)
- Stores result in R2 `SCREENSHOTS` bucket
- **Retries:** 3 attempts with exponential backoff

### 4. Upload/Process Media (media-worker)
- Calls `POST /upload/init` on media-worker
- Links screenshot and metadata
- **Retries:** 3 attempts with exponential backoff

### 5. Generate Embed
- Creates responsive HTML embed card
- Includes price, discount badge, CTA button
- Stores in R2 `embed-assets` bucket
- Caches in `WORKFLOW_KV`

### 6. Approval Gate
- Stores approval request in `STEERING_KV`
- Uses `step.waitForEvent('approval')` 
- **Timeout:** 24 hours (configurable)
- Can be approved/rejected via:
  - Workflow API (`POST /workflow/:id/approve`)
  - Discord commands (`/approve <id>`)
  - Steering dashboard
- Option to skip approval (`skipApproval: true`)

### 7. Publish
- Stores final product in `WORKFLOW_KV`
- Queues to `production-queue` for distribution
- Sends webhook notification (if configured)

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/workflow/start` | Start a new product workflow |
| `GET` | `/workflow/:id` | Get workflow status and steps |
| `POST` | `/workflow/:id/approve` | Approve workflow (sends event) |
| `POST` | `/workflow/:id/reject` | Reject workflow with reason |
| `POST` | `/workflow/:id/cancel` | Abort workflow immediately |
| `GET` | `/workflows` | List workflows (with filters) |
| `GET` | `/workflows/pending-approval` | List awaiting approval |
| `GET` | `/dashboard` | HTML dashboard |
| `GET` | `/api/summary` | JSON workflow stats |
| `GET` | `/api/recent` | Recent workflows |
| `GET` | `/health` | Health check |

## Starting a Workflow

```bash
curl -X POST https://workflow-orchestrator.workers.dev/workflow/start \
  -H "Content-Type: application/json" \
  -d '{
    "productId": "prod-123",
    "asin": "B09XYZ1234",
    "name": "Sample Product Name",
    "url": "https://amazon.com/dp/B09XYZ1234",
    "price": 29.99,
    "originalPrice": 49.99,
    "priority": "normal"
  }'
```

Response:
```json
{
  "success": true,
  "workflowId": "wf-B09XYZ1234-m4k7h2",
  "status": "pending",
  "message": "Workflow started for B09XYZ1234"
}
```

## Approving a Workflow

```bash
curl -X POST https://workflow-orchestrator.workers.dev/workflow/wf-B09XYZ1234-m4k7h2/approve \
  -H "Content-Type: application/json" \
  -d '{"approvedBy": "admin@example.com"}'
```

## Error Handling

### Retry Strategy
- **Screenshot, Media, Publish:** 3 retries with exponential backoff
- **Validation, Approval:** No retries (user-controlled)

### Fallback Branches
- Screenshot fallback: Uses cached/existing screenshot if available
- Media fallback: Continues without media if not critical
- Workflow failure: Logs to `activity:recent`, sends webhook

### Failure States
- `failed`: Unrecoverable error during processing
- `cancelled`: Manually cancelled or approval timeout

## Bindings

### Service Bindings
```toml
[[services]]
binding = "BROWSER_WORKER"
service = "browser-renderer"

[[services]]
binding = "MEDIA_WORKER"
service = "media-processor"

[[services]]
binding = "STEERING_WORKER"
service = "steering-controller"
```

### KV Namespaces
- `WORKFLOW_KV`: Workflow state, embed cache
- `STEERING_KV`: Approval requests, activity log

### R2 Buckets
- `EMBED_ASSETS`: Generated embed HTML

### Queues
- `PRODUCTION_QUEUE`: Published products for distribution

## Files Created

```
src/workflow-worker/
├── package.json
├── tsconfig.json
├── wrangler.toml
└── src/
    ├── index.ts      # HTTP API, dashboard
    ├── workflow.ts   # Durable Workflow definition
    └── types.ts      # TypeScript interfaces
```

## Deployment

### Prerequisites
1. Create KV namespace:
   ```bash
   cd src/workflow-worker
   wrangler kv:namespace create WORKFLOW_KV
   ```
2. Update `wrangler.toml` with the returned KV ID
3. Ensure other workers are deployed (browser-renderer, media-processor, steering-controller)

### Deploy
```bash
cd src/workflow-worker
npm install
wrangler deploy
```

### Verify
```bash
curl https://workflow-orchestrator.workers.dev/health
```

## Monitoring

### Dashboard
Access at `https://workflow-orchestrator.workers.dev/dashboard`
- Auto-refreshes every 30 seconds
- Shows active, pending, completed, failed counts
- Recent workflows table with status

### Webhook Notifications
Set `WEBHOOK_URL` secret for event notifications:
```bash
wrangler secret put WEBHOOK_URL
```

Events sent:
- `workflow.completed`
- `workflow.failed`

## Integration with Steering Controller

The workflow integrates with the steering controller from Phase 5:
- Reads pipeline pause state from `STEERING_KV:pipeline:state`
- Stores approval requests in `STEERING_KV:approval:{workflowId}`
- Logs activity to `STEERING_KV:activity:recent`
- Discord `/approve` command can trigger approval via API

## Security Considerations

1. **CORS**: Enabled for browser access (configure origins in production)
2. **Authentication**: Add Authorization header checks for production
3. **Rate Limiting**: Consider adding rate limiting for `/workflow/start`
4. **Webhook Validation**: Verify webhook signatures if receiving callbacks

---

## Migration Complete Summary

With Phase 6 complete, the full Cloudflare migration includes:

| Phase | Component | Status |
|-------|-----------|--------|
| 1 | Queues (staging, production, DLQ) | ✅ |
| 2 | R2 embed-assets, KV EMBED_PRODUCTS | ✅ |
| 3 | Browser Rendering worker | ✅ |
| 4 | Media Processing worker | ✅ |
| 5 | Steering Controller | ✅ |
| 6 | Workflow Orchestrator | ✅ |

**Total Resources Created:**
- 4 Cloudflare Workers
- 3 Queues
- 2 R2 Buckets
- 4 KV Namespaces
- 1 Durable Workflow definition

The pipeline is now fully orchestrated with:
- ✅ Screenshot capture (Browser Rendering)
- ✅ Media upload/processing
- ✅ Embed generation
- ✅ Human-in-the-loop approval
- ✅ Discord command integration
- ✅ Dashboard monitoring
- ✅ Automatic retries & fallbacks
- ✅ Queue-based distribution
