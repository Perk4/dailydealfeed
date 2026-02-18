# HEARTBEAT.md

## Startup Check (first heartbeat of session)
If wrangler not installed or git remote not set, run:
```bash
/root/clawd/scripts/startup.sh
```

## Migration Orchestration Check
- Check subagents status: `subagents list`
- If phase complete + validation passed → spawn next phase
- If blocked/warning → report to Discord, await human input
- Update docs/plans/PHASE-PROGRESS.md with any changes

## Git Sync (every heartbeat)
```bash
cd /root/clawd && git add -A && git diff --cached --quiet || git commit -m "Auto-sync $(date -u +%Y-%m-%d_%H:%M)" && git push origin master 2>/dev/null || true
```
Only push if remote configured. Silent fail is OK.

## Current Phase
Phase 5: steering-controller (in progress)
