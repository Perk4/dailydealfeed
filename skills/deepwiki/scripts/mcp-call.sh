#!/bin/bash
# Generic MCP JSON-RPC caller for Devin/DeepWiki
# Usage: mcp-call.sh <method> <params_json> [endpoint]
#
# Auto-selects endpoint based on DEVIN_API_KEY:
#   - With key:    https://mcp.devin.ai/mcp (private repos)
#   - Without key: https://mcp.deepwiki.com/mcp (public only)

set -euo pipefail

METHOD="${1:-}"
PARAMS="${2}"
PARAMS="${PARAMS:-"{}"}"

# Auto-select endpoint: authenticated if key present
if [[ -n "${DEVIN_API_KEY:-}" ]]; then
  DEFAULT_ENDPOINT="https://mcp.devin.ai/mcp"
else
  DEFAULT_ENDPOINT="https://mcp.deepwiki.com/mcp"
fi
ENDPOINT="${3:-$DEFAULT_ENDPOINT}"

if [[ -z "$METHOD" ]]; then
  echo "Usage: mcp-call.sh <method> [params_json] [endpoint]" >&2
  exit 1
fi

# MCP uses JSON-RPC 2.0 with tools/call wrapper
REQUEST=$(jq -n \
  --arg method "$METHOD" \
  --argjson params "$PARAMS" \
  '{
    jsonrpc: "2.0",
    id: 1,
    method: "tools/call",
    params: {
      name: $method,
      arguments: $params
    }
  }')

# Build curl command
CURL_ARGS=(-s -X POST "$ENDPOINT"
  -H "Content-Type: application/json"
  -H "Accept: application/json, text/event-stream")

# Add auth header if API key present
if [[ -n "${DEVIN_API_KEY:-}" ]]; then
  CURL_ARGS+=(-H "Authorization: Bearer ${DEVIN_API_KEY}")
fi

# Make request
RESPONSE=$(curl "${CURL_ARGS[@]}" -d "$REQUEST")

# Extract text from SSE response
echo "$RESPONSE" | grep -o 'data: {.*' | sed 's/^data: //' | jq -r '.result.content[0].text // .error.message // .'
