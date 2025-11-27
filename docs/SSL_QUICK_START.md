# SSL/HTTPS Quick Start Guide

## 📁 Files Created

```
nginx/
├── nginx.conf          # Nginx configuration with SSL
├── ssl-setup.sh        # Linux/Mac script to generate certificates
├── ssl-setup.ps1       # Windows PowerShell script
├── ssl/                # SSL certificates directory
│   └── .gitkeep        # Keeps directory in git
└── README.md           # Nginx setup instructions

server/
└── utils/
    └── ssl-config.js   # SSL helper utilities for Node.js

docker-compose.ssl.yml  # Docker Compose with nginx SSL support
docs/
├── SSL_HTTPS_SETUP.md  # Complete setup guide
└── SSL_QUICK_START.md  # This file
```

## 🚀 Quick Setup (Development)

### Windows

```powershell
# 1. Generate self-signed certificates
.\nginx\ssl-setup.ps1

# 2. Start with SSL
docker-compose -f docker-compose.yml -f docker-compose.ssl.yml up -d

# 3. Access application
# Open https://localhost (accept self-signed certificate warning)
```

### Linux/Mac

```bash
# 1. Generate self-signed certificates
cd nginx
chmod +x ssl-setup.sh
./ssl-setup.sh
cd ..

# 2. Start with SSL
docker-compose -f docker-compose.yml -f docker-compose.ssl.yml up -d

# 3. Access application
# Open https://localhost (accept self-signed certificate warning)
```

## 🚀 Quick Setup (Production)

```bash
# 1. Install certbot
sudo apt-get install certbot

# 2. Generate Let's Encrypt certificate
sudo certbot certonly --standalone -d yourdomain.com

# 3. Update nginx.conf with certificate paths
# Edit nginx/nginx.conf:
#   ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
#   ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;

# 4. Start with SSL
docker-compose -f docker-compose.yml -f docker-compose.ssl.yml up -d

# 5. Set up auto-renewal
sudo certbot renew --dry-run
```

## 🔧 Configuration Options

### Option 1: Nginx Reverse Proxy (Recommended)

- ✅ Better performance
- ✅ Handles SSL termination
- ✅ Single entry point for all services
- ✅ Easy certificate management

**Usage:**
```bash
docker-compose -f docker-compose.yml -f docker-compose.ssl.yml up -d
```

### Option 2: Node.js Direct HTTPS

- ✅ No nginx needed
- ✅ Direct SSL in Express
- ⚠️ Less flexible for multiple services

**Usage:**
1. Set in `.env`:
   ```env
   SSL_ENABLED=true
   SSL_CERT_PATH=./nginx/ssl/cert.pem
   SSL_KEY_PATH=./nginx/ssl/key.pem
   ```

2. Start server:
   ```bash
   npm start
   ```

## 📋 Environment Variables

Add to `.env`:

```env
# Enable SSL
SSL_ENABLED=true

# Certificate paths (if using Node.js direct HTTPS)
SSL_CERT_PATH=./nginx/ssl/cert.pem
SSL_KEY_PATH=./nginx/ssl/key.pem

# Update URLs to HTTPS
FRONTEND_URL=https://localhost
VITE_API_URL=https://localhost/api
```

## 🔍 Verify SSL is Working

```bash
# Check nginx is running
docker-compose ps nginx

# Check SSL certificate
openssl s_client -connect localhost:443 -servername localhost

# Test with curl
curl -v https://localhost/api/health
```

## 📚 Full Documentation

See `docs/SSL_HTTPS_SETUP.md` for complete setup instructions, troubleshooting, and production best practices.

