# WhatsApp API Gateway

REST API Gateway untuk mengirim pesan WhatsApp menggunakan library `whatsapp-web.js`. Project ini memungkinkan integrasi WhatsApp dengan sistem existing melalui endpoint HTTP yang mudah digunakan.

## 🚀 Fitur

- ✅ REST API endpoint untuk mengirim pesan WhatsApp
- ✅ Format dan validasi nomor telepon otomatis
- ✅ Integrasi WhatsApp Web melalui whatsapp-web.js
- ✅ Support CORS untuk cross-origin requests
- ✅ Logging komprehensif dan error handling
- ✅ Compatible dengan PHP cURL requests
- ✅ Session management otomatis
- ✅ QR Code authentication

## 📋 Requirements

- Node.js >= 16.0.0
- NPM atau Yarn
- Chrome/Chromium browser (untuk headless browsing)

## 🛠 Installation

1. Clone atau download project ini
2. Install dependencies:
```bash
npm install
```

3. Copy file environment:
```bash
cp .env.example .env
```

4. Edit konfigurasi di file `.env`:
```env
PORT=3000
NODE_ENV=development
WA_SESSION_NAME=whatsapp-session
API_BASE_PATH=/api
LOG_LEVEL=info
```

## 🚀 Running the Application

### Development Mode
```bash
npm run dev
```

### Production Mode
```bash
npm start
```

## 📱 Authentication Setup

1. Jalankan aplikasi
2. Scan QR Code yang muncul di terminal menggunakan WhatsApp di phone Anda
3. Tunggu hingga authentication berhasil
4. API siap digunakan!

## 📚 API Documentation

### Base URL
```
http://localhost:3000/api
```

### Endpoints

#### 1. Health Check
```http
GET /api/health
```

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-10T10:00:00.000Z",
  "uptime": 1234.567,
  "whatsapp_ready": true
}
```

#### 2. Send Message
```http
POST /api/send-message
Content-Type: application/json

{
  "to": "08123456789",
  "message": "Hello from WhatsApp API!",
  "sender": "Your App Name",
  "type": "notification"
}
```

**Request Parameters:**
- `to` (required): Nomor telepon tujuan (format: 08xxx, +62xxx, atau 62xxx)
- `message` (required): Pesan yang akan dikirim (max 4096 karakter)
- `sender` (optional): Nama pengirim yang akan ditampilkan
- `type` (optional): Jenis pesan untuk tracking

**Success Response:**
```json
{
  "status": true,
  "message": "Pesan berhasil dikirim",
  "data": {
    "messageId": "message_id_here",
    "to": "628123456789",
    "timestamp": 1641801600,
    "sender": "Your App Name",
    "type": "notification"
  }
}
```

**Error Response:**
```json
{
  "status": false,
  "error": "Error message here"
}
```

#### 3. Get Client Info
```http
GET /api/client-info
```

**Response:**
```json
{
  "status": true,
  "data": {
    "user": "628123456789",
    "phone": "628123456789",
    "name": "Your WhatsApp Name",
    "connected": true
  }
}
```

#### 4. Logout
```http
POST /api/logout
```

**Response:**
```json
{
  "status": true,
  "message": "Logged out successfully"
}
```

## 🔧 PHP Integration Example

Sesuai dengan kebutuhan Anda, berikut adalah fungsi PHP yang dapat digunakan:

```php
function send_whatsapp_message($to, $message, $sender = 'System', $type = 'notification')
{
    $api_url = 'http://localhost:3000/api/send-message'; // Sesuaikan dengan domain Anda

    $payload = [
        'to' => $to,
        'message' => $message,
        'sender' => $sender,
        'type' => $type
    ];

    $ch = curl_init();
    curl_setopt_array($ch, [
        CURLOPT_URL => $api_url,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode($payload),
        CURLOPT_HTTPHEADER => [
            'Content-Type: application/json',
            'Accept: application/json'
        ]
    ]);

    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        return json_encode(['status' => false, 'error' => 'cURL Error: ' . $error]);
    }

    if ($http_code >= 200 && $http_code < 300) {
        return json_encode(['status' => true, 'message' => 'Pesan berhasil dikirim', 'response' => json_decode($response, true)]);
    } else {
        return json_encode(['status' => false, 'error' => 'Gagal mengirim pesan. Status: ' . $http_code, 'response' => $response]);
    }
}

// Contoh penggunaan:
$result = send_whatsapp_message('08123456789', 'Hello dari PHP!', 'GEU CS Team', 'sales_direct_message');
echo $result;
```

## 📞 Phone Number Format

API ini secara otomatis memformat nomor telepon ke format yang benar. Format yang didukung:

- `08123456789` → `628123456789`
- `+628123456789` → `628123456789`
- `628123456789` → `628123456789`

## 🔒 Security Features

- Helmet untuk security headers
- CORS configuration
- Input validation dan sanitization
- Rate limiting (dapat dikonfigurasi)
- Error handling yang aman

## 📝 Logging

Aplikasi menggunakan structured logging dengan level:
- `error`: Error yang memerlukan perhatian
- `warn`: Warning dan informasi penting
- `info`: Informasi umum aplikasi
- `debug`: Detail debugging

Set environment variable `LOG_LEVEL` untuk mengontrol level logging.

## 🐛 Troubleshooting

### QR Code tidak muncul
- Pastikan aplikasi berjalan di environment yang support terminal
- Cek apakah port 3000 tidak diblokir
- Restart aplikasi

### Authentication gagal
- Hapus folder `.wwebjs_auth` dan `.wwebjs_cache`
- Restart aplikasi dan scan QR code lagi

### Pesan tidak terkirim
- Cek status WhatsApp client dengan endpoint `/api/client-info`
- Pastikan nomor telepon target valid dan terdaftar di WhatsApp
- Cek logs untuk detail error

### Performance Issues
- Monitor memory usage, WhatsApp Web bisa memory-intensive
- Consider restarting aplikasi secara berkala
- Monitor disk space untuk session files

## 📦 Production Deployment

### 1. Environment Setup
```bash
NODE_ENV=production
LOG_LEVEL=warn
PORT=3000
```

### 2. Process Management (PM2)
```bash
npm install -g pm2
pm2 start server.js --name "whatsapp-api"
pm2 startup
pm2 save
```

### 3. Nginx Reverse Proxy
```nginx
server {
    listen 80;
    server_name your-domain.com;

    location /api {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 4. SSL dengan Certbot
```bash
sudo certbot --nginx -d your-domain.com
```

## 🔄 Updates

Untuk update library dan dependencies:
```bash
npm update
npm audit fix
```

## 📄 License

MIT License - Silakan gunakan untuk project komersial maupun non-komersial.

## 🤝 Support

Jika ada masalah atau pertanyaan:
1. Cek troubleshooting guide di atas
2. Review logs aplikasi
3. Buat issue di repository ini

---

## 📊 Monitoring

Untuk production, disarankan untuk setup monitoring:
- Health check endpoint: `/api/health`
- Log monitoring dengan tools seperti Winston + LogStash
- Memory dan CPU monitoring
- WhatsApp session health monitoring

## 🚀 Scaling

Untuk traffic tinggi:
- Setup multiple instances dengan load balancer
- Implement message queue (Redis/RabbitMQ)
- Database untuk message history dan analytics
- Rate limiting per client/IP