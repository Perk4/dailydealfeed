#!/bin/bash
# Ask DeepWiki a question about a repository
# Usage: ask.sh <owner/repo> "<question>" [endpoint]
#
# Example: ask.sh Perk4/openclaw-worker "What is the architecture of this project?"

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${1:-}"
QUESTION="${2:-}"
ENDPOINT="${3:-}"

if [[ -z "$REPO" || -z "$QUESTION" ]]; then
  echo "Usage: ask.sh <owner/repo> \"<question>\" [endpoint]" >&2
  exit 1
fi

PARAMS=$(jq -cn --arg repo "$REPO" --arg question "$QUESTION" '{repoName: $repo, question: $question}')

"$SCRIPT_DIR/mcp-call.sh" "ask_question" "$PARAMS" ${ENDPOINT:+"$ENDPOINT"}
