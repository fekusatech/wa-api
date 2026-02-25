# WhatsApp API Gateway Project

This is a Node.js WhatsApp API Gateway project using whatsapp-web.js library.

## Project Overview
- **Technology Stack**: Node.js, Express.js, whatsapp-web.js
- **Purpose**: REST API gateway for sending WhatsApp messages
- **Target API**: Compatible with PHP cURL requests from existing systems

## Key Features
- REST API endpoint for sending messages
- Phone number formatting and validation
- WhatsApp Web integration via whatsapp-web.js
- CORS support for cross-origin requests
- Comprehensive logging and error handling

## API Endpoint
- `POST /api/send-message` - Send WhatsApp message
  - Expected payload: `{to, message, sender, type}`
  - Returns: JSON response with status and result

## Development Guidelines
- Use ES6+ JavaScript syntax
- Implement proper error handling
- Follow REST API best practices
- Include comprehensive logging
- Maintain compatibility with existing PHP integration