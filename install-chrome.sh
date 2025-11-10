#!/bin/bash

# Install Chrome dependencies for Ubuntu/Debian
echo "Installing Chrome dependencies..."

# Update package lists
sudo apt-get update

# Install essential dependencies first
sudo apt-get install -y wget curl gnupg

# Add Google's signing key
wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | sudo apt-key add -

# Add Google Chrome repository
echo 'deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main' | sudo tee /etc/apt/sources.list.d/google-chrome.list

# Update package lists again
sudo apt-get update

# Install Chrome and all dependencies
sudo apt-get install -y google-chrome-stable

# Install additional dependencies that might be missing
sudo apt-get install -y \
    gconf-service \
    libasound2 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libc6 \
    libcairo2 \
    libcups2 \
    libdbus-1-3 \
    libexpat1 \
    libfontconfig1 \
    libgcc1 \
    libgconf-2-4 \
    libgdk-pixbuf2.0-0 \
    libglib2.0-0 \
    libgtk-3-0 \
    libnspr4 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libstdc++6 \
    libx11-6 \
    libx11-xcb1 \
    libxcb1 \
    libxcomposite1 \
    libxcursor1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxi6 \
    libxrandr2 \
    libxrender1 \
    libxss1 \
    libxtst6 \
    ca-certificates \
    fonts-liberation \
    libappindicator1 \
    libappindicator3-1 \
    libnss3 \
    lsb-release \
    xdg-utils \
    libdrm2 \
    libgtk-4-1 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    libgbm1 \
    libxss1 \
    libasound2

# Test Chrome installation
echo ""
echo "Testing Chrome installation..."
if google-chrome-stable --version; then
    echo "✓ Chrome installed successfully!"
else
    echo "✗ Chrome installation failed"
    exit 1
fi

# Test headless mode
echo ""
echo "Testing Chrome headless mode..."
if google-chrome-stable --headless --no-sandbox --disable-gpu --dump-dom https://www.google.com > /dev/null 2>&1; then
    echo "✓ Chrome headless mode working!"
else
    echo "✗ Chrome headless mode failed"
fi

# Set proper permissions
echo ""
echo "Setting up permissions..."
sudo chown -R $USER:$USER $HOME/.cache 2>/dev/null || true
sudo chown -R $USER:$USER $HOME/.config 2>/dev/null || true

echo ""
echo "Chrome dependencies installed successfully!"
echo "Chrome version: $(google-chrome-stable --version)"
echo ""
echo "You can now run the WhatsApp API server with:"
echo "  npm start"