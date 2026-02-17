#!/bin/bash
# Setup Playwright for Amazon Recording
# Run this on fresh environments/containers

set -e

echo "=== Playwright Setup for @dailydealfeed ==="

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
  echo "❌ Run this from the dailydealfeed root directory"
  exit 1
fi

# Install node dependencies if needed
if [ ! -d "node_modules" ]; then
  echo "📦 Installing npm dependencies..."
  npm install
fi

# Install Playwright browsers
echo "🌐 Installing Playwright browsers..."
npx playwright install chromium

# Install system dependencies
echo "🔧 Installing system dependencies..."
if command -v apt-get &> /dev/null; then
  # Debian/Ubuntu
  apt-get update -qq
  apt-get install -y -qq \
    libnspr4 libnss3 libatk1.0-0 libatk-bridge2.0-0 \
    libcups2 libdrm2 libxkbcommon0 libxcomposite1 \
    libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    xvfb 2>/dev/null || true
elif command -v yum &> /dev/null; then
  # RHEL/CentOS
  yum install -y -q \
    nspr nss atk at-spi2-atk cups-libs libdrm libxkbcommon \
    libXcomposite libXdamage libXfixes libXrandr mesa-libgbm \
    alsa-lib 2>/dev/null || true
fi

# Verify installation
echo ""
echo "🧪 Verifying Playwright installation..."
node -e "
const { chromium } = require('playwright');
(async () => {
  try {
    const browser = await chromium.launch({ headless: true });
    await browser.close();
    console.log('✅ Playwright is ready!');
    process.exit(0);
  } catch (e) {
    console.error('❌ Playwright check failed:', e.message);
    process.exit(1);
  }
})();
"

echo ""
echo "=== Setup Complete ==="
echo "You can now run: node scripts/amazon-recorder.js <ASIN>"
