---
name: deepwiki
description: Query DeepWiki/Devin for codebase analysis and second opinions. Use when needing architecture insights, code understanding, or external perspective on repository structure and design decisions. Triggers on "deepwiki", "second opinion", "what does Devin think", "architecture review", or requests to analyze a GitHub repo externally.
---

# DeepWiki Skill

Query Cognition's DeepWiki (via Devin MCP) for AI-powered codebase analysis.

## Endpoints

| Endpoint | Auth | Use Case |
|----------|------|----------|
| `https://mcp.deepwiki.com/mcp` | None | Public repos (default) |
| `https://mcp.devin.ai/mcp` | `DEVIN_API_KEY` | Private repos |

## Quick Reference

### Ask a question
```bash
skills/deepwiki/scripts/ask.sh Perk4/openclaw-worker "What is the architecture?"
```

### Get wiki structure
```bash
skills/deepwiki/scripts/wiki.sh Perk4/openclaw-worker structure
```

### Get wiki contents
```bash
skills/deepwiki/scripts/wiki.sh Perk4/openclaw-worker contents
```

### Use private repo endpoint
```bash
export DEVIN_API_KEY=your-key
skills/deepwiki/scripts/ask.sh Perk4/openclaw-worker "question" https://mcp.devin.ai/mcp
```

## Workflow: Get Second Opinion

1. **Ask specific question** about architecture, patterns, or approach:
   ```bash
   skills/deepwiki/scripts/ask.sh Perk4/openclaw-worker "How does the R2 sync work?"
   ```

2. **Save response** for analysis:
   ```bash
   skills/deepwiki/scripts/ask.sh Perk4/openclaw-worker "..." > memory/deepwiki/$(date +%Y%m%d)-topic.md
   ```

3. **Compare** DeepWiki's understanding with actual code to identify:
   - Gaps in documentation
   - Architectural insights you missed
   - Suggested improvements

## Storage Convention

Store DeepWiki responses in `memory/deepwiki/`:
- `YYYYMMDD-<topic>.md` — Question responses
- `architecture.md` — Cached architecture overview
- `suggestions.md` — Aggregated improvement ideas

## Available Methods

| Method | Purpose |
|--------|---------|
| `ask_question` | Ask natural language questions about a repo |
| `read_wiki_structure` | Get wiki outline/table of contents |
| `read_wiki_contents` | Get full wiki documentation |

## Example Questions

Good questions for second opinions:
- "What is the high-level architecture of this project?"
- "How does authentication flow work?"
- "What are potential improvements to the error handling?"
- "How could the R2 sync be made more robust?"
- "What patterns does this codebase follow?"
- "What are the security considerations?"
