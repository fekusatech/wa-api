const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const { formatPhoneNumber, logger } = require('./utils/helpers');
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

function createWhatsAppClient() {
    return new Client({
        authStrategy: new LocalAuth({
            clientId: process.env.WA_SESSION_NAME || 'whatsapp-session',
            dataPath: './.wwebjs_auth'
        }),
        puppeteer: {
            headless: true,
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
                '--disable-javascript',
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
                '--disable-ipc-flooding-protection'
            ],
            executablePath: process.env.CHROME_PATH || undefined,
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
            logger.info('QR Code received, scan to authenticate:');
            qrcode.generate(qr, { small: true });
        });

        client.on('ready', () => {
            logger.info('WhatsApp client is ready!');
            clientInitialized = true;
            initializationAttempts = 0; // Reset counter on success
        });

        client.on('authenticated', () => {
            logger.info('WhatsApp client authenticated successfully');
        });

        client.on('auth_failure', (msg) => {
            logger.error('Authentication failed:', msg);
            clientInitialized = false;
        });

        client.on('disconnected', (reason) => {
            logger.warn('WhatsApp client was disconnected:', reason);
            clientInitialized = false;
            
            // Retry connection after delay
            setTimeout(() => {
                if (!clientInitialized) {
                    logger.info('Attempting to reconnect WhatsApp client...');
                    initializeWhatsAppClient();
                }
            }, 10000);
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
        initialization_attempts: initializationAttempts
    });
});

// Send message endpoint
apiRouter.post('/send-message', async (req, res) => {
    try {
        const { to, message, sender, type } = req.body;

        // Validate required fields
        if (!to || !message) {
            return res.status(400).json({
                status: false,
                error: 'Missing required fields: to, message'
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

        // Prepare message content
        let messageContent = message;
        if (sender) {
            messageContent = `*${sender}*\n\n${message}`;
        }

        // Log the message attempt
        logger.info(`Attempting to send message to ${formattedPhone}`, {
            to: formattedPhone,
            sender: sender || 'Unknown',
            type: type || 'direct_message',
            messageLength: message.length
        });

        // Send the message
        const chatId = `${formattedPhone}@c.us`;
        const sentMessage = await client.sendMessage(chatId, messageContent);

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

// Logout endpoint
apiRouter.post('/logout', async (req, res) => {
    try {
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