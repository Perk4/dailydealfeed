#!/bin/bash
# Fetch DeepWiki structure or contents for a repository
# Usage: wiki.sh <owner/repo> [structure|contents] [endpoint]
#
# Example: wiki.sh Perk4/openclaw-worker structure
# Example: wiki.sh Perk4/openclaw-worker contents

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${1:-}"
MODE="${2:-structure}"
ENDPOINT="${3:-}"

if [[ -z "$REPO" ]]; then
  echo "Usage: wiki.sh <owner/repo> [structure|contents] [endpoint]" >&2
  exit 1
fi

PARAMS=$(jq -cn --arg repo "$REPO" '{repoName: $repo}')

case "$MODE" in
  structure)
    METHOD="read_wiki_structure"
    ;;
  contents)
    METHOD="read_wiki_contents"
    ;;
  *)
    echo "Error: mode must be 'structure' or 'contents'" >&2
    exit 1
    ;;
esac

"$SCRIPT_DIR/mcp-call.sh" "$METHOD" "$PARAMS" ${ENDPOINT:+"$ENDPOINT"}
