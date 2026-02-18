#!/bin/bash
# OpenClaw Startup Script - runs on container/session start
# Ensures critical tools are available

set -e

echo "🔧 OpenClaw Startup Check..."

# 1. Install wrangler if missing
if ! command -v wrangler &> /dev/null; then
    echo "📦 Installing wrangler..."
    npm install -g wrangler
else
    echo "✅ wrangler $(wrangler --version 2>/dev/null | head -1)"
fi

# 2. Verify Cloudflare auth
if [ -n "$CLOUDFLARE_API_TOKEN" ] || [ -n "$CF_API_TOKEN" ]; then
    echo "✅ Cloudflare API token configured"
    wrangler whoami 2>/dev/null | head -5 || echo "⚠️ Token may be invalid"
else
    echo "⚠️ No CLOUDFLARE_API_TOKEN set"
fi

# 3. Git config
git config --global user.email "biz@openclaw.ai" 2>/dev/null || true
git config --global user.name "Biz (OpenClaw)" 2>/dev/null || true
echo "✅ Git configured"

# 4. Configure git remote with GH_TOKEN
cd /root/clawd 2>/dev/null || exit 0
if [ -n "$GH_TOKEN" ]; then
    git remote set-url origin "https://${GH_TOKEN}@github.com/Perk4/dailydealfeed.git" 2>/dev/null || \
    git remote add origin "https://${GH_TOKEN}@github.com/Perk4/dailydealfeed.git" 2>/dev/null || true
    echo "✅ Git remote configured with GH_TOKEN"
    git fetch origin 2>/dev/null && echo "✅ Fetched from remote" || echo "⚠️ Fetch failed"
else
    echo "⚠️ GH_TOKEN not set - git push won't work"
fi

echo "🚀 Startup complete"
