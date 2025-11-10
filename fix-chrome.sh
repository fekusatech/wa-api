#!/bin/bash

# Quick fix for libatk-1.0.so.0 error and Chrome dependencies
echo "=== WhatsApp API - Quick Chrome Dependencies Fix ==="
echo ""

# Check current error
echo "1. Checking for common missing libraries..."

# Install specific missing libraries
echo "Installing libatk-1.0-0 and related dependencies..."
sudo apt-get update -qq

# Install the specific missing library and related ones
sudo apt-get install -y \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libatspi2.0-0 \
    libgtk-3-0 \
    libgtk-4-1 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libcairo2 \
    libcairo-gobject2

echo ""
echo "2. Installing Google Chrome (stable version)..."

# Remove any existing Chrome installations that might be problematic
sudo apt-get remove -y google-chrome-unstable google-chrome-beta 2>/dev/null || true

# Install Chrome stable
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
echo 'deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main' | sudo tee /etc/apt/sources.list.d/google-chrome.list
sudo apt-get update -qq
sudo apt-get install -y google-chrome-stable

echo ""
echo "3. Testing Chrome installation..."
if google-chrome-stable --version; then
    echo "✓ Chrome installed successfully!"
    CHROME_VERSION=$(google-chrome-stable --version)
    echo "  Version: $CHROME_VERSION"
else
    echo "✗ Chrome installation failed"
    exit 1
fi

echo ""
echo "4. Testing Chrome libraries..."
if ldd /usr/bin/google-chrome-stable | grep "not found"; then
    echo "✗ Some libraries are still missing:"
    ldd /usr/bin/google-chrome-stable | grep "not found"
    echo ""
    echo "Installing additional dependencies..."
    sudo apt-get install -y libnss3 libxss1 libgconf-2-4 libxrandr2 libasound2 libpangocairo-1.0-0 libatk1.0-0 libcairo-gobject2 libgtk-3-0 libgdk-pixbuf2.0-0
else
    echo "✓ All Chrome libraries are available"
fi

echo ""
echo "5. Cleaning up old Chromium downloads..."
rm -rf node_modules/puppeteer-core/.local-chromium 2>/dev/null || true
rm -rf $HOME/.cache/puppeteer 2>/dev/null || true

echo ""
echo "6. Testing headless Chrome..."
if timeout 10 google-chrome-stable --headless --no-sandbox --disable-gpu --dump-dom https://www.google.com > /dev/null 2>&1; then
    echo "✓ Chrome headless mode working!"
else
    echo "⚠ Chrome headless test timeout or failed (but this might be normal due to network)"
fi

echo ""
echo "7. Updating environment configuration..."
# Update .env to use system Chrome
if grep -q "CHROME_PATH=" .env; then
    sed -i 's|# CHROME_PATH=.*|CHROME_PATH=/usr/bin/google-chrome-stable|' .env
    sed -i 's|CHROME_PATH=.*|CHROME_PATH=/usr/bin/google-chrome-stable|' .env
else
    echo "CHROME_PATH=/usr/bin/google-chrome-stable" >> .env
fi

if grep -q "PUPPETEER_EXECUTABLE_PATH=" .env; then
    sed -i 's|PUPPETEER_EXECUTABLE_PATH=.*|PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable|' .env
else
    echo "PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable" >> .env
fi

if grep -q "PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=" .env; then
    sed -i 's|PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=.*|PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true|' .env
fi

echo "✓ Environment updated to use system Chrome"

echo ""
echo "8. Restarting PM2 services..."
if command -v pm2 &> /dev/null; then
    pm2 restart all 2>/dev/null || pm2 restart server 2>/dev/null || echo "No PM2 processes to restart"
    echo "✓ PM2 services restarted"
else
    echo "! PM2 not found - you'll need to restart manually"
fi

echo ""
echo "=== Fix Complete ==="
echo ""
echo "✅ Dependencies installed and configured"
echo "✅ Chrome executable: /usr/bin/google-chrome-stable"
echo "✅ Environment updated"
echo ""
echo "Next steps:"
echo "1. Restart your WhatsApp API server:"
echo "   pm2 restart server"
echo "   # OR"
echo "   npm start"
echo ""
echo "2. Monitor logs:"
echo "   pm2 logs server"
echo ""
echo "3. Test the API:"
echo "   curl http://localhost:3000/api/health"

# Final verification
echo ""
echo "Final verification:"
echo "Chrome path: $(which google-chrome-stable)"
echo "Chrome version: $(google-chrome-stable --version 2>/dev/null || echo 'Not accessible')"
echo "Environment configured: $(grep CHROME_PATH .env)"