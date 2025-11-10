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
const client = new Client({
    authStrategy: new LocalAuth({
        clientId: process.env.WA_SESSION_NAME || 'whatsapp-session'
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
            '--single-process',
            '--disable-gpu'
        ]
    }
});

// WhatsApp Client Event Handlers
client.on('qr', (qr) => {
    logger.info('QR Code received, scan to authenticate:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    logger.info('WhatsApp client is ready!');
});

client.on('authenticated', () => {
    logger.info('WhatsApp client authenticated successfully');
});

client.on('auth_failure', (msg) => {
    logger.error('Authentication failed:', msg);
});

client.on('disconnected', (reason) => {
    logger.warn('WhatsApp client was disconnected:', reason);
});

// API Routes
const apiRouter = express.Router();

// Health check endpoint
apiRouter.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        whatsapp_ready: client.info ? true : false
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
        if (!client.info) {
            return res.status(503).json({
                status: false,
                error: 'WhatsApp client is not ready. Please scan QR code first.'
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
        if (!client.info) {
            return res.status(503).json({
                status: false,
                error: 'WhatsApp client is not ready'
            });
        }

        const info = client.info;
        return res.json({
            status: true,
            data: {
                user: info.wid.user,
                phone: info.wid.user,
                name: info.pushname,
                connected: true
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

// Logout endpoint
apiRouter.post('/logout', async (req, res) => {
    try {
        await client.logout();
        logger.info('WhatsApp client logged out successfully');
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
        await client.destroy();
        logger.info('WhatsApp client destroyed');
    } catch (error) {
        logger.error('Error destroying WhatsApp client:', error);
    }
    
    process.exit(0);
});

process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    
    try {
        await client.destroy();
        logger.info('WhatsApp client destroyed');
    } catch (error) {
        logger.error('Error destroying WhatsApp client:', error);
    }
    
    process.exit(0);
});

// Start the server
app.listen(port, () => {
    logger.info(`WhatsApp API Gateway server started on port ${port}`);
    logger.info(`API endpoints available at: http://localhost:${port}${process.env.API_BASE_PATH || '/api'}`);
    
    // Initialize WhatsApp client
    client.initialize().catch(error => {
        logger.error('Error initializing WhatsApp client:', error);
    });
});

module.exports = app;