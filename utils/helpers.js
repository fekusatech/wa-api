/**
 * Utility functions for WhatsApp API Gateway
 */

/**
 * Format phone number to WhatsApp format
 * @param {string} phoneNumber - Raw phone number
 * @returns {string|null} - Formatted phone number or null if invalid
 */
function formatPhoneNumber(phoneNumber) {
    if (!phoneNumber || typeof phoneNumber !== 'string') {
        return null;
    }

    // Remove all non-numeric characters
    let cleaned = phoneNumber.replace(/\D/g, '');
    
    // Handle different country code formats
    if (cleaned.startsWith('0')) {
        // Indonesian mobile number starting with 0
        cleaned = '62' + cleaned.substring(1);
    } else if (cleaned.startsWith('62')) {
        // Already has Indonesian country code
        cleaned = cleaned;
    } else if (cleaned.startsWith('+62')) {
        // Has + prefix
        cleaned = cleaned.substring(1);
    } else if (cleaned.length >= 10 && cleaned.length <= 13) {
        // Assume it's missing country code (Indonesian default)
        if (!cleaned.startsWith('62')) {
            cleaned = '62' + cleaned;
        }
    }

    // Validate Indonesian mobile number format
    // Indonesian mobile numbers: 62 + 8xx-xxx-xxxx (10-13 digits after 62)
    const indonesianMobilePattern = /^62[0-9]{9,13}$/;
    
    if (!indonesianMobilePattern.test(cleaned)) {
        return null;
    }

    return cleaned;
}

/**
 * Validate phone number format
 * @param {string} phoneNumber - Phone number to validate
 * @returns {boolean} - True if valid, false otherwise
 */
function isValidPhoneNumber(phoneNumber) {
    return formatPhoneNumber(phoneNumber) !== null;
}

/**
 * Logger utility with different log levels
 */
class Logger {
    constructor() {
        this.logLevel = process.env.LOG_LEVEL || 'info';
        this.levels = {
            error: 0,
            warn: 1,
            info: 2,
            debug: 3
        };
    }

    _shouldLog(level) {
        return this.levels[level] <= this.levels[this.logLevel];
    }

    _formatMessage(level, message, meta = {}) {
        const timestamp = new Date().toISOString();
        const logEntry = {
            timestamp,
            level: level.toUpperCase(),
            message,
            ...meta
        };

        return JSON.stringify(logEntry, null, 2);
    }

    error(message, meta = {}) {
        if (this._shouldLog('error')) {
            console.error(this._formatMessage('error', message, meta));
        }
    }

    warn(message, meta = {}) {
        if (this._shouldLog('warn')) {
            console.warn(this._formatMessage('warn', message, meta));
        }
    }

    info(message, meta = {}) {
        if (this._shouldLog('info')) {
            console.log(this._formatMessage('info', message, meta));
        }
    }

    debug(message, meta = {}) {
        if (this._shouldLog('debug')) {
            console.log(this._formatMessage('debug', message, meta));
        }
    }
}

/**
 * Sanitize message content
 * @param {string} message - Raw message content
 * @returns {string} - Sanitized message
 */
function sanitizeMessage(message) {
    if (!message || typeof message !== 'string') {
        return '';
    }

    // Remove potentially harmful content
    return message
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;')
        .trim()
        .substring(0, 4096); // Limit message length
}

/**
 * Validate request payload for send-message endpoint
 * @param {object} payload - Request payload
 * @returns {object} - Validation result with isValid and errors
 */
function validateSendMessagePayload(payload) {
    const errors = [];

    if (!payload.to) {
        errors.push('Field "to" is required');
    } else if (!isValidPhoneNumber(payload.to)) {
        errors.push('Field "to" must be a valid phone number');
    }

    if (!payload.message) {
        errors.push('Field "message" is required');
    } else if (typeof payload.message !== 'string') {
        errors.push('Field "message" must be a string');
    } else if (payload.message.trim().length === 0) {
        errors.push('Field "message" cannot be empty');
    } else if (payload.message.length > 4096) {
        errors.push('Field "message" is too long (max 4096 characters)');
    }

    if (payload.sender && typeof payload.sender !== 'string') {
        errors.push('Field "sender" must be a string');
    }

    if (payload.type && typeof payload.type !== 'string') {
        errors.push('Field "type" must be a string');
    }

    return {
        isValid: errors.length === 0,
        errors
    };
}

/**
 * Create a delay/sleep function
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise} - Promise that resolves after the delay
 */
function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry function with exponential backoff
 * @param {function} fn - Function to retry
 * @param {number} maxRetries - Maximum number of retries
 * @param {number} baseDelay - Base delay in milliseconds
 * @returns {Promise} - Promise that resolves with the function result
 */
async function retryWithBackoff(fn, maxRetries = 3, baseDelay = 1000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (error) {
            if (attempt === maxRetries) {
                throw error;
            }
            
            const delay = baseDelay * Math.pow(2, attempt - 1);
            logger.warn(`Attempt ${attempt} failed, retrying in ${delay}ms...`, {
                error: error.message,
                attempt,
                maxRetries,
                delay
            });
            
            await sleep(delay);
        }
    }
}

// Create logger instance
const logger = new Logger();

module.exports = {
    formatPhoneNumber,
    isValidPhoneNumber,
    sanitizeMessage,
    validateSendMessagePayload,
    sleep,
    retryWithBackoff,
    logger,
    Logger
};