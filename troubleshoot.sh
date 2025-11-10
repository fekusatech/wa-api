#!/bin/bash

# WhatsApp API Troubleshooting Script
echo "=== WhatsApp API Gateway Troubleshooting ==="
echo ""

# Check Node.js version
echo "1. Checking Node.js version:"
node --version
echo ""

# Check if Chrome/Chromium is installed
echo "2. Checking Chrome/Chromium installation:"
if command -v google-chrome-stable &> /dev/null; then
    echo "✓ Google Chrome Stable found: $(google-chrome-stable --version)"
elif command -v chromium &> /dev/null; then
    echo "✓ Chromium found: $(chromium --version)"
elif command -v chromium-browser &> /dev/null; then
    echo "✓ Chromium Browser found: $(chromium-browser --version)"
else
    echo "✗ Chrome/Chromium not found!"
    echo "  Run: ./install-chrome.sh to install Chrome dependencies"
fi
echo ""

# Check dependencies
echo "3. Checking Node.js dependencies:"
if [ -f "package.json" ]; then
    if [ -d "node_modules" ]; then
        echo "✓ node_modules directory exists"
    else
        echo "✗ node_modules directory missing. Run: npm install"
    fi
else
    echo "✗ package.json not found"
fi
echo ""

# Check session directory
echo "4. Checking WhatsApp session:"
if [ -d ".wwebjs_auth" ]; then
    echo "✓ Session directory exists (.wwebjs_auth)"
    echo "  Session files:"
    ls -la .wwebjs_auth/ 2>/dev/null | head -10
else
    echo "! No session directory found (first run is normal)"
fi
echo ""

# Check environment file
echo "5. Checking environment configuration:"
if [ -f ".env" ]; then
    echo "✓ .env file found"
    echo "  Configuration:"
    cat .env | grep -v "^#" | grep -v "^$"
else
    echo "! .env file not found. Copy from .env.example"
fi
echo ""

# Check port availability
echo "6. Checking port availability:"
PORT=${1:-3000}
if lsof -i :$PORT &> /dev/null; then
    echo "✗ Port $PORT is in use:"
    lsof -i :$PORT
else
    echo "✓ Port $PORT is available"
fi
echo ""

# Memory and disk check
echo "7. System resources:"
echo "  Memory usage:"
free -h | head -2
echo "  Disk space:"
df -h . | tail -1
echo ""

# Test API connectivity (if server is running)
echo "8. Testing API connectivity:"
if curl -s http://localhost:$PORT/api/health &> /dev/null; then
    echo "✓ API server is responding:"
    curl -s http://localhost:$PORT/api/health | jq . 2>/dev/null || curl -s http://localhost:$PORT/api/health
else
    echo "✗ API server is not responding on port $PORT"
    echo "  Make sure the server is running: npm start"
fi
echo ""

# Check logs if PM2 is used
echo "9. Checking PM2 status (if used):"
if command -v pm2 &> /dev/null; then
    pm2 list | grep -E "(server|whatsapp|wa-api)" || echo "  No PM2 processes found with common names"
    echo ""
    echo "  Recent logs:"
    pm2 logs --lines 5 2>/dev/null | tail -10 || echo "  No PM2 logs available"
else
    echo "  PM2 not installed"
fi

echo ""
echo "=== Troubleshooting Complete ==="
echo ""
echo "Common solutions:"
echo "1. Install Chrome dependencies: ./install-chrome.sh"
echo "2. Install Node dependencies: npm install"
echo "3. Check environment config: cp .env.example .env"
echo "4. Clear session data: rm -rf .wwebjs_auth .wwebjs_cache"
echo "5. Restart server: pm2 restart server or npm start"
echo "6. Force client restart: curl -X POST http://localhost:$PORT/api/restart-client"