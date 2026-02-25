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
2. Perhatikan log, akan muncul event `QR Code received` yang menyertakan string QR (jika `LOG_LEVEL` diatur ke `info` atau lebih tinggi).
3. Scan QR Code tersebut dengan WhatsApp pada ponsel Anda. Tidak ada OTP yang dikirimkan oleh gateway—WhatsApp sendiri akan menampilkan notifikasi di aplikasi WA setelah QR dipindai.
4. **Penting:** Anda tidak boleh mengirim permintaan `/send-message` sampai log memasukkan baris `"WhatsApp client is ready!"`. Jika Anda mencoba lebih cepat, endpoint akan merespons 503 dan log akan berisi peringatan `send-message rejected: client not ready`.
5. Jika tidak ada log `ready` dalam 60 detik, cek QR/ponsel dan gunakan `/api/restart-client` bila perlu. Log juga sekarang mencatat `auth_failure`, `session_update`, dan status perubahan untuk membantu debugging.

Setelah client siap, permintaan yang berhasil akan menghasilkan log seperti:

```
INFO  Message sent successfully to 628123456789 {
  messageId: '...' ,
  timestamp: 1641801600,
  result: { …full message object… }
}
```

Logs ini membuktikan bahwa pesan dikirim; bila tidak ada baris seperti itu dan Anda menerima 503, berarti client masih belum siap.

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

#### 4. Restart WhatsApp Client
```http
POST /api/restart-client
```

**Response:**
```json
{
  "status": true,
  "message": "WhatsApp client restart initiated",
  "success": true
}
```

#### 5. Logout
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

## ⚠️ Known Issues & Troubleshooting

### Evaluation error on message send
If you see an error similar to the following when hitting `/send-message`:

```
Error sending WhatsApp message: Evaluation failed: TypeError: Cannot read properties of undefined (reading 'markedUnread')
```

This is a bug inside the `whatsapp-web.js` library where the underlying page tries to mark the chat as unread. It does **not** prevent the message from being sent, but it will cause your API request to fail unless handled.

To mitigate:

1. Upgrade to the latest `whatsapp-web.js` release where the issue is fixed (run `npm install whatsapp-web.js@latest`).
2. The server code already includes a catch‑and‑ignore heuristic around `markedUnread` errors, so you can safely ignore the warning in the logs.
3. If the problem persists, restart the WhatsApp client with `/api/restart-client` or re‑authenticate by deleting the `.wwebjs_auth` folder.

The bug does not affect message delivery; it merely generates a noisy error stack trace.

---

### Execution context destroyed / navigation errors
When the page inside Puppeteer reloads or navigates while the library is trying to inject helpers you may see:

```
Error: Execution context was destroyed, most likely because of a navigation.
    at rewriteError …
    at async exposeFunctionIfAbsent …
    at async Client.inject …
```

This usually happens during a version update of WhatsApp Web or a transient page reload. The process will log the full stack trace and the gateway now listens for those errors and will perform an automatic session recovery. After recovery the client should reconnect and eventually emit the `ready` event; you can watch for the `WhatsApp client is ready!` line to know it’s safe to send.

If the error persists repeatedly:

1. Inspect the log around the failure – it should contain entries like `Puppeteer page error` or `page crashed` followed by a recovery attempt.
2. Wait a minute for the ready log; the queue will resume after recovery.
3. Manually call `POST /api/restart-client` or restart the PM2 process if recovery does not succeed.
4. Setting `LOG_LEVEL=debug` gives more diagnostic detail.

---

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

### Quick Diagnosis
Jalankan script troubleshooting untuk diagnosis cepat:
```bash
./troubleshoot.sh
```

### Common Issues & Solutions

#### 1. "Error initializing WhatsApp client"
**Penyebab:** Missing Chrome dependencies atau puppeteer configuration issues.

**Solusi:**
```bash
# Install Chrome dependencies (Ubuntu/Debian)
./install-chrome.sh

# Atau manual install Chrome
sudo apt-get update
sudo apt-get install -y google-chrome-stable

# Clear session data dan restart
rm -rf .wwebjs_auth .wwebjs_cache
pm2 restart server
```

#### 2. QR Code tidak muncul
**Penyebab:** Terminal tidak support atau environment issues.

**Solusi:**
- Pastikan running di terminal yang support output
- Cek logs: `pm2 logs server`
- Force restart client: `curl -X POST http://localhost:3000/api/restart-client`
- Cek status: `curl http://localhost:3000/api/health`

#### 3. Authentication gagal berulang
**Solusi:**
```bash
# Hapus semua session data
rm -rf .wwebjs_auth .wwebjs_cache
pm2 restart server

# Monitor logs untuk QR code baru
pm2 logs server --lines 50
```

#### 4. Pesan tidak terkirim
**Diagnosis:**
```bash
# Cek status client
curl http://localhost:3000/api/client-info

# Cek health
curl http://localhost:3000/api/health
```

**Solusi:**
- Pastikan WhatsApp client ready (client-info endpoint)
- Validasi format nomor telepon
- Cek logs untuk error detail

#### 5. High Memory Usage
**Solusi:**
```bash
# Restart aplikasi secara berkala
pm2 restart server

# Monitor memory usage
pm2 monit

# Set memory limit di PM2
pm2 start server.js --max-memory-restart 500M
```

#### 6. Port sudah digunakan
```bash
# Cek proses yang menggunakan port
lsof -i :3000

# Kill proses jika diperlukan
sudo kill -9 <PID>

# Atau gunakan port lain di .env
echo "PORT=3001" >> .env
```

### Environment-Specific Issues

#### Ubuntu/Debian
```bash
# Install dependencies lengkap
sudo apt-get update
sudo apt-get install -y nodejs npm google-chrome-stable

# Fix permission issues
sudo chown -R $USER:$USER .wwebjs_auth
```

#### CentOS/RHEL
```bash
# Install Chrome
wget https://dl.google.com/linux/direct/google-chrome-stable_current_x86_64.rpm
sudo yum localinstall google-chrome-stable_current_x86_64.rpm
```

#### Docker Issues
Jika running di Docker, tambahkan di Dockerfile:
```dockerfile
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*
```

### Debug Mode
Untuk debugging detail, set environment:
```bash
export NODE_ENV=development
export LOG_LEVEL=debug
npm start
```

### Performance Issues
**Monitor performance:**
```bash
# CPU dan memory usage
top -p $(pgrep -f "node.*server.js")

# PM2 monitoring
pm2 monit

# Check disk space
df -h
```

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