# WhatsApp API Gateway - Troubleshooting Guide

## Problem: "Session closed" Error

### Symptoms
- Error: `Protocol error (Runtime.callFunctionOn): Session closed. Most likely the page has been closed.`
- Messages fail to send
- WhatsApp client becomes unresponsive

### Root Causes
1. **Browser Session Crash**: Puppeteer browser session unexpectedly closes
2. **Memory Issues**: High memory usage causing browser to crash
3. **Network Instability**: Connection issues with WhatsApp Web
4. **Session Timeout**: WhatsApp Web session expires

### Solutions Implemented

#### 1. Session Health Monitoring
- **Health Check**: Runs every 30 seconds to verify session status
- **Auto Recovery**: Automatically restarts session if unhealthy
- **Monitoring**: Tracks last health check and session status

#### 2. Message Queue System
- **Queue Processing**: Messages are queued to prevent overwhelming the browser
- **Retry Logic**: Failed messages are retried automatically
- **Timeout Protection**: Messages timeout after 2 minutes

#### 3. Enhanced Error Handling
- **Session Recovery**: Automatic recovery when session errors occur
- **Graceful Restart**: Proper cleanup before restarting client
- **Fallback Mechanisms**: Multiple retry attempts with different strategies

#### 4. Browser Optimization
- **Memory Management**: Better memory allocation arguments
- **Resource Cleanup**: Proper cleanup of browser resources
- **Stability Options**: Additional browser flags for stability

## New API Endpoints

### Health Check (Enhanced)
```
GET /api/health
```
Returns detailed health information including:
- Session health status
- Queue length
- Last health check time
- Restart status

### Session Recovery
```
POST /api/recover-session
```
Manually trigger session recovery

### Queue Status
```
GET /api/queue-status
```
Check message queue status and processing state

### Clear Queue
```
POST /api/clear-queue
```
Clear all pending messages from queue

## Monitoring Commands

### Check Health
```bash
curl http://localhost:3000/api/health
```

### Check Queue Status
```bash
curl http://localhost:3000/api/queue-status
```

### Manual Recovery
```bash
curl -X POST http://localhost:3000/api/recover-session
```

## Log Messages to Watch For

### Normal Operation
- `Session health check passed`
- `Message sent successfully`
- `WhatsApp client is ready!`

### Warning Signs
- `Session health check failed`
- `Starting session recovery...`
- `Client in problematic state`

### Critical Errors
- `Session recovery failed`
- `Maximum initialization attempts reached`
- `Failed to recover session within timeout`

## Prevention Tips

1. **Monitor Resources**: Keep an eye on server memory usage
2. **Regular Restarts**: Restart the service daily if possible
3. **Network Stability**: Ensure stable internet connection
4. **Chrome Updates**: Keep Chrome/Chromium updated
5. **PM2 Configuration**: Use PM2 with proper restart policies

## PM2 Restart Policy

Add to your PM2 ecosystem file:
```json
{
  "apps": [{
    "name": "whatsapp-api",
    "script": "server.js",
    "instances": 1,
    "autorestart": true,
    "watch": false,
    "max_memory_restart": "1G",
    "restart_delay": 10000,
    "exp_backoff_restart_delay": 100
  }]
}
```

## Emergency Recovery

If the service is completely unresponsive:

1. **Stop the service**:
   ```bash
   pm2 stop server
   ```

2. **Clear session data**:
   ```bash
   rm -rf ./.wwebjs_auth/*
   ```

3. **Restart service**:
   ```bash
   pm2 start server
   ```

4. **Re-scan QR code** when prompted

## Performance Optimization

### Server Configuration
- Minimum RAM: 2GB
- Recommended RAM: 4GB+
- CPU: 2+ cores recommended

### Environment Variables
```bash
export NODE_OPTIONS="--max-old-space-size=4096"
export CHROME_PATH="/usr/bin/google-chrome-stable"
```

## Changelog

### Version 1.1.0 (Current Update)
- Added session health monitoring
- Implemented message queue system
- Enhanced error recovery mechanisms
- Added new monitoring endpoints
- Improved browser stability configuration
- Better resource cleanup on shutdown