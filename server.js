const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { formatPhoneNumber, logger, sanitizeMessage, validateSendMessagePayload } = require('./utils/helpers');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// WhatsApp Client Configuration
let client;
let clientInitialized = false;
let initializationAttempts = 0;
const maxInitAttempts = 3;
let sessionHealthCheck;
let messageQueue = [];
let processingQueue = false;
let lastHealthCheck = null;
let sessionRestartInProgress = false;

// Session Health Check Function
function checkSessionHealth() {
    if (!client || !clientInitialized) {
        return false;
    }

    try {
        // Simple check to see if client is still responsive
        return client.pupPage && !client.pupPage.isClosed();
    } catch (error) {
        logger.warn('Session health check failed:', error.message);
        return false;
    }
}

// Start session health monitoring
function startSessionHealthMonitoring() {
    if (sessionHealthCheck) {
        clearInterval(sessionHealthCheck);
    }

    sessionHealthCheck = setInterval(async () => {
        if (!clientInitialized) {
            return;
        }

        const isHealthy = checkSessionHealth();
        lastHealthCheck = new Date();

        if (!isHealthy && !sessionRestartInProgress) {
            logger.warn('Session health check failed, attempting to recover...');
            await recoverSession();
        }
    }, 30000); // Check every 30 seconds
}

// Session recovery function
async function recoverSession() {
    if (sessionRestartInProgress) {
        logger.info('Session restart already in progress, skipping...');
        return;
    }

    sessionRestartInProgress = true;
    logger.info('Starting session recovery...');

    try {
        // Try to destroy existing client gracefully
        if (client) {
            try {
                await client.destroy();
                logger.info('Old client destroyed successfully');
            } catch (error) {
                logger.warn('Error destroying old client:', error.message);
            }
        }

        // Reset client state
        client = null;
        clientInitialized = false;

        // Wait a moment before reinitializing
        await new Promise(resolve => setTimeout(resolve, 3000));

        // Reinitialize client
        const success = await initializeWhatsAppClient();
        
        if (success) {
            logger.info('Session recovery completed successfully');
        } else {
            logger.error('Session recovery failed');
        }
    } catch (error) {
        logger.error('Error during session recovery:', error);
    } finally {
        sessionRestartInProgress = false;
    }
}

// Message queue processing
async function processMessageQueue() {
    if (processingQueue || messageQueue.length === 0) {
        return;
    }

    processingQueue = true;
    
    while (messageQueue.length > 0) {
        const messageTask = messageQueue.shift();
        
        try {
            if (!client || !clientInitialized) {
                // Re-queue the message
                messageQueue.unshift(messageTask);
                break;
            }

            await messageTask.execute();
            messageTask.resolve(messageTask.result);
        } catch (error) {
            messageTask.reject(error);
        }

        // Small delay between messages to prevent overwhelming
        await new Promise(resolve => setTimeout(resolve, 1000));
    }
    
    processingQueue = false;
}

// Add message to queue
function queueMessage(chatId, message) {
    return new Promise((resolve, reject) => {
        const messageTask = {
            chatId,
            message,
            resolve,
            reject,
            timestamp: Date.now(),
            execute: async function() {
                try {
                    this.result = await client.sendMessage(this.chatId, this.message);
                } catch (err) {
                    // whatsapp-web.js occasionally throws an evaluation error
                    // when trying to mark the chat as unread (bug in library).
                    // we ignore it and return a dummy result so the queue continues.
                    if (err.message && err.message.includes('markedUnread')) {
                        logger.warn('Non‑critical sendMessage error (markedUnread), ignoring', {
                            error: err.message
                        });
                        this.result = { id: { id: null }, timestamp: Date.now() };
                    } else {
                        throw err;
                    }
                }
            }
        };

        messageQueue.push(messageTask);
        processMessageQueue();

        // Timeout after 2 minutes
        setTimeout(() => {
            reject(new Error('Message sending timeout'));
        }, 120000);
    });
}

function createWhatsAppClient() {
    // Try to find Chrome executable
    const chromePaths = [
        process.env.CHROME_PATH,
        process.env.PUPPETEER_EXECUTABLE_PATH,
        '/usr/bin/google-chrome-stable',
        '/usr/bin/google-chrome',
        '/usr/bin/chromium-browser',
        '/usr/bin/chromium',
        '/snap/bin/chromium'
    ].filter(Boolean);

    let executablePath = undefined;
    const fs = require('fs');
    
    for (const path of chromePaths) {
        try {
            if (fs.existsSync(path)) {
                executablePath = path;
                logger.info(`Using Chrome executable: ${executablePath}`);
                break;
            }
        } catch (error) {
            // Continue to next path
        }
    }

    return new Client({
        authStrategy: new LocalAuth({
            clientId: process.env.WA_SESSION_NAME || 'whatsapp-session',
            dataPath: './.wwebjs_auth'
        }),
        puppeteer: {
            headless: true,
            executablePath: executablePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-web-security',
                '--disable-extensions',
                '--disable-plugins',
                '--disable-images',
                '--disable-default-apps',
                '--disable-sync',
                '--disable-translate',
                '--hide-scrollbars',
                '--mute-audio',
                '--no-default-browser-check',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI',
                '--disable-ipc-flooding-protection',
                '--disable-hang-monitor',
                '--disable-client-side-phishing-detection',
                '--disable-component-update',
                '--disable-popup-blocking',
                '--disable-blink-features=AutomationControlled',
                '--disable-software-rasterizer',
                '--disable-background-networking',
                '--disable-default-apps',
                '--disable-extensions-file-access-check',
                '--disable-sync',
                '--disable-prompt-on-repost',
                '--no-default-browser-check',
                '--no-first-run',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-features=TranslateUI,BlinkGenPropertyTrees',
                '--disable-background-timer-throttling',
                '--memory-pressure-off',
                '--max_old_space_size=4096'
            ],
            timeout: 60000
        },
        webVersionCache: {
            type: 'remote',
            remotePath: 'https://raw.githubusercontent.com/wppconnect-team/wa-version/main/html/2.2412.54.html',
        }
    });
}

// Initialize WhatsApp client with retry mechanism
async function initializeWhatsAppClient() {
    if (clientInitialized) {
        return true;
    }

    if (initializationAttempts >= maxInitAttempts) {
        logger.error('Maximum initialization attempts reached. WhatsApp client will not be available.');
        return false;
    }

    initializationAttempts++;
    logger.info(`Initializing WhatsApp client (attempt ${initializationAttempts}/${maxInitAttempts})...`);

    try {
        client = createWhatsAppClient();
        
        // Set up event handlers
        client.on('qr', (qr) => {
            logger.info('QR Code received, scan to authenticate (raw data included)', { qr });
            // print to terminal for manual scanning as well
            qrcode.generate(qr, { small: true });
        });

        // set a watchdog in case "ready" never fires
        let readyTimeout = setTimeout(() => {
            if (!clientInitialized) {
                logger.warn('WhatsApp client has not emitted ready event within 60s. Make sure QR was scanned or OTP/2FA completed on the phone.');
            }
        }, 60000);

        client.on('ready', () => {
            clearTimeout(readyTimeout);
            logger.info('WhatsApp client is ready!');
            clientInitialized = true;
            initializationAttempts = 0; // Reset counter on success
            
            // Start session health monitoring
            startSessionHealthMonitoring();
            
            // Process any queued messages
            processMessageQueue();
        });

        client.on('authenticated', () => {
            logger.info('WhatsApp client authenticated successfully');
        });

        client.on('auth_failure', (msg) => {
            logger.error('Authentication failed (auth_failure event):', { message: msg });
            clientInitialized = false;
        });

        client.on('session_update', (session) => {
            logger.info('Session updated, data saved to disk');
        });

        client.on('change_state', (state) => {
            logger.info('WhatsApp client state changed:', state);
        });

        client.on('disconnected', (reason) => {
            logger.warn('WhatsApp client was disconnected:', reason);
            clientInitialized = false;
            
            // Clear health check interval
            if (sessionHealthCheck) {
                clearInterval(sessionHealthCheck);
            }
            
            // Retry connection after delay
            setTimeout(() => {
                if (!clientInitialized && !sessionRestartInProgress) {
                    logger.info('Attempting to reconnect WhatsApp client...');
                    initializeWhatsAppClient();
                }
            }, 10000);
        });
        
        // Add error handler for session crashes
        client.on('change_state', (state) => {
            logger.info('WhatsApp client state changed:', state);
            
            if (state === 'CONFLICT' || state === 'UNLAUNCHED') {
                logger.warn('Client in problematic state, attempting recovery...');
                setTimeout(() => recoverSession(), 5000);
            }
        });

        await client.initialize();
        return true;
    } catch (error) {
        logger.error('Error initializing WhatsApp client:', {
            error: error.message,
            stack: error.stack,
            attempt: initializationAttempts
        });
        
        // Clean up failed client
        if (client) {
            try {
                await client.destroy();
            } catch (destroyError) {
                logger.error('Error destroying failed client:', destroyError);
            }
            client = null;
        }
        
        // Retry after delay
        if (initializationAttempts < maxInitAttempts) {
            setTimeout(() => {
                initializeWhatsAppClient();
            }, 5000 * initializationAttempts); // Exponential backoff
        }
        
        return false;
    }
}

// WhatsApp Client Event Handlers (moved to initialization function)
// ... (event handlers moved to initializeWhatsAppClient function)

// API Routes
const apiRouter = express.Router();

// Health check endpoint
apiRouter.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        whatsapp_ready: clientInitialized,
        initialization_attempts: initializationAttempts,
        session_health: checkSessionHealth(),
        last_health_check: lastHealthCheck,
        message_queue_length: messageQueue.length,
        processing_queue: processingQueue,
        restart_in_progress: sessionRestartInProgress
    });
});

// Send message endpoint
apiRouter.post('/send-message', async (req, res) => {
    try {
        const { to, message, sender, type } = req.body;

        // validate and sanitize payload using helpers
        const validation = validateSendMessagePayload(req.body);
        if (!validation.isValid) {
            return res.status(400).json({
                status: false,
                errors: validation.errors
            });
        }

        // Check if WhatsApp client is ready
        if (!client || !clientInitialized) {
            return res.status(503).json({
                status: false,
                error: 'WhatsApp client is not ready. Please wait for initialization or scan QR code.',
                ready: clientInitialized,
                attempts: initializationAttempts
            });
        }

        // Format phone number
        const formattedPhone = formatPhoneNumber(to);
        if (!formattedPhone) {
            return res.status(400).json({
                status: false,
                error: `Invalid phone number format: ${to}`
            });
        }

        // Prepare message content (sanitize to prevent injection)
        let messageContent = sanitizeMessage(message);
        const senderLabel = sender ? sanitizeMessage(sender) : null;
        if (senderLabel) {
            messageContent = `*${senderLabel}*\n\n${messageContent}`;
        }

        // Log the message attempt
        logger.info(`Attempting to send message to ${formattedPhone}`, {
            to: formattedPhone,
            sender: senderLabel || 'Unknown',
            type: type || 'direct_message',
            messageLength: messageContent.length
        });

        // Send the message with retry mechanism
        const chatId = `${formattedPhone}@c.us`;
        let sentMessage;
        
        try {
            // Check if session is healthy before sending
            if (!checkSessionHealth()) {
                logger.warn('Session unhealthy, attempting recovery before sending message');
                await recoverSession();
                
                // Wait for recovery
                let retryCount = 0;
                while (!clientInitialized && retryCount < 30) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                    retryCount++;
                }
                
                if (!clientInitialized) {
                    throw new Error('Failed to recover session within timeout');
                }
            }
            
            // Use queue system for more reliable message sending
            sentMessage = await queueMessage(chatId, messageContent);
            
        } catch (error) {
            // If queue fails, try direct send as fallback
            if (error.message.includes('Session closed') || error.message.includes('Protocol error')) {
                logger.warn('Session error detected, attempting direct recovery and retry...');
                
                try {
                    await recoverSession();
                    
                    // Wait a bit for session to stabilize
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    
                    if (clientInitialized) {
                        sentMessage = await client.sendMessage(chatId, messageContent);
                    } else {
                        throw new Error('Session recovery failed, cannot send message');
                    }
                } catch (recoveryError) {
                    logger.error('Message sending failed even after recovery attempt:', recoveryError);
                    throw recoveryError;
                }
            } else {
                throw error;
            }
        }

        logger.info(`Message sent successfully to ${formattedPhone}`, {
            messageId: sentMessage.id.id,
            timestamp: sentMessage.timestamp
        });

        return res.json({
            status: true,
            message: 'Pesan berhasil dikirim',
            data: {
                messageId: sentMessage.id.id,
                to: formattedPhone,
                timestamp: sentMessage.timestamp,
                sender: sender || 'System',
                type: type || 'direct_message'
            }
        });

    } catch (error) {
        logger.error('Error sending WhatsApp message:', {
            error: error.message,
            stack: error.stack,
            to: req.body.to
        });

        return res.status(500).json({
            status: false,
            error: 'Failed to send message',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

// Get client info endpoint
apiRouter.get('/client-info', async (req, res) => {
    try {
        if (!client || !clientInitialized) {
            return res.status(503).json({
                status: false,
                error: 'WhatsApp client is not ready',
                ready: clientInitialized,
                attempts: initializationAttempts
            });
        }

        const info = client.info;
        return res.json({
            status: true,
            data: {
                user: info.wid.user,
                phone: info.wid.user,
                name: info.pushname,
                connected: true,
                ready: clientInitialized
            }
        });
    } catch (error) {
        logger.error('Error getting client info:', error);
        return res.status(500).json({
            status: false,
            error: 'Failed to get client information'
        });
    }
});

// Restart WhatsApp client endpoint
apiRouter.post('/restart-client', async (req, res) => {
    try {
        logger.info('Manually restarting WhatsApp client...');
        
        // Clear health check interval
        if (sessionHealthCheck) {
            clearInterval(sessionHealthCheck);
            sessionHealthCheck = null;
        }
        
        // Destroy existing client if any
        if (client) {
            try {
                await client.destroy();
            } catch (destroyError) {
                logger.warn('Error destroying existing client during restart:', destroyError);
            }
        }
        
        // Reset states
        client = null;
        clientInitialized = false;
        initializationAttempts = 0;
        
        // Initialize new client
        const success = await initializeWhatsAppClient();
        
        return res.json({
            status: true,
            message: 'WhatsApp client restart initiated',
            success: success
        });
    } catch (error) {
        logger.error('Error restarting WhatsApp client:', error);
        return res.status(500).json({
            status: false,
            error: 'Failed to restart WhatsApp client'
        });
    }
});

// Session recovery endpoint
apiRouter.post('/recover-session', async (req, res) => {
    try {
        logger.info('Manual session recovery requested...');
        
        if (sessionRestartInProgress) {
            return res.json({
                status: false,
                message: 'Session recovery already in progress'
            });
        }
        
        await recoverSession();
        
        return res.json({
            status: true,
            message: 'Session recovery initiated',
            ready: clientInitialized
        });
    } catch (error) {
        logger.error('Error during manual session recovery:', error);
        return res.status(500).json({
            status: false,
            error: 'Failed to recover session'
        });
    }
});

// Queue status endpoint
apiRouter.get('/queue-status', (req, res) => {
    return res.json({
        status: true,
        data: {
            queue_length: messageQueue.length,
            processing: processingQueue,
            oldest_message: messageQueue.length > 0 ? new Date(messageQueue[0].timestamp) : null,
            session_healthy: checkSessionHealth(),
            last_health_check: lastHealthCheck,
            restart_in_progress: sessionRestartInProgress
        }
    });
});

// Clear message queue endpoint
apiRouter.post('/clear-queue', (req, res) => {
    const clearedCount = messageQueue.length;
    messageQueue = [];
    processingQueue = false;
    
    logger.info(`Cleared ${clearedCount} messages from queue`);
    
    return res.json({
        status: true,
        message: `Cleared ${clearedCount} messages from queue`
    });
});

// Logout endpoint
apiRouter.post('/logout', async (req, res) => {
    try {
        // Clear health check interval
        if (sessionHealthCheck) {
            clearInterval(sessionHealthCheck);
        }
        
        if (client && clientInitialized) {
            await client.logout();
            clientInitialized = false;
            logger.info('WhatsApp client logged out successfully');
        }
        return res.json({
            status: true,
            message: 'Logged out successfully'
        });
    } catch (error) {
        logger.error('Error during logout:', error);
        return res.status(500).json({
            status: false,
            error: 'Failed to logout'
        });
    }
});

// Use API routes
app.use(process.env.API_BASE_PATH || '/api', apiRouter);

// Root endpoint
app.get('/', (req, res) => {
    res.json({
        name: 'WhatsApp API Gateway',
        version: '1.0.0',
        status: 'running',
        endpoints: {
            health: `${process.env.API_BASE_PATH || '/api'}/health`,
            sendMessage: `${process.env.API_BASE_PATH || '/api'}/send-message`,
            clientInfo: `${process.env.API_BASE_PATH || '/api'}/client-info`,
            recoverSession: `${process.env.API_BASE_PATH || '/api'}/recover-session`,
            queueStatus: `${process.env.API_BASE_PATH || '/api'}/queue-status`,
            clearQueue: `${process.env.API_BASE_PATH || '/api'}/clear-queue`,
            logout: `${process.env.API_BASE_PATH || '/api'}/logout`
        }
    });
});

// Error handling middleware
app.use((error, req, res, next) => {
    logger.error('Unhandled error:', {
        error: error.message,
        stack: error.stack,
        url: req.url,
        method: req.method
    });

    res.status(500).json({
        status: false,
        error: 'Internal server error',
        details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        status: false,
        error: 'Endpoint not found'
    });
});

// Graceful shutdown
process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    
    try {
        // Clear health check interval
        if (sessionHealthCheck) {
            clearInterval(sessionHealthCheck);
        }
        
        if (client && clientInitialized) {
            await client.destroy();
            logger.info('WhatsApp client destroyed');
        }
    } catch (error) {
        logger.error('Error destroying WhatsApp client:', error);
    }
    
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    
    try {
        // Clear health check interval
        if (sessionHealthCheck) {
            clearInterval(sessionHealthCheck);
        }
        
        if (client && clientInitialized) {
            await client.destroy();
            logger.info('WhatsApp client destroyed');
        }
    } catch (error) {
        logger.error('Error destroying WhatsApp client:', error);
    }
    
    process.exit(0);
});

// Start the server
app.listen(port, async () => {
    logger.info(`WhatsApp API Gateway server started on port ${port}`);
    logger.info(`API endpoints available at: http://localhost:${port}${process.env.API_BASE_PATH || '/api'}`);
    
    // Initialize WhatsApp client with delay to ensure server is ready
    setTimeout(() => {
        initializeWhatsAppClient().catch(error => {
            logger.error('Failed to initialize WhatsApp client during startup:', error);
        });
    }, 2000);
});

module.exports = app;