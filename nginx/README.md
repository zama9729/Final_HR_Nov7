# Nginx SSL/HTTPS Configuration

This directory contains the Nginx configuration for SSL/HTTPS support.

## Files

- `nginx.conf` - Main Nginx configuration with SSL support
- `ssl-setup.sh` - Script to generate self-signed certificates for development
- `ssl/` - Directory for SSL certificates (certificates are git-ignored)

## Quick Setup

### Development (Self-Signed Certificates)

```bash
# Generate self-signed certificates
cd nginx
./ssl-setup.sh

# Start with SSL
cd ..
docker-compose -f docker-compose.yml -f docker-compose.ssl.yml up -d
```

### Production (Let's Encrypt)

1. Install certbot:
   ```bash
   sudo apt-get install certbot
   ```

2. Generate certificate:
   ```bash
   sudo certbot certonly --standalone -d yourdomain.com
   ```

3. Update `nginx.conf` with certificate paths:
   ```nginx
   ssl_certificate /etc/letsencrypt/live/yourdomain.com/fullchain.pem;
   ssl_certificate_key /etc/letsencrypt/live/yourdomain.com/privkey.pem;
   ```

4. Start services:
   ```bash
   docker-compose -f docker-compose.yml -f docker-compose.ssl.yml up -d
   ```

## Configuration

The `nginx.conf` includes:
- ✅ HTTP to HTTPS redirect
- ✅ Modern SSL/TLS protocols (TLS 1.2, 1.3)
- ✅ Security headers (HSTS, X-Frame-Options, etc.)
- ✅ Reverse proxy for all services
- ✅ CORS support
- ✅ Large file upload support (100MB)

## Documentation

See `docs/SSL_HTTPS_SETUP.md` for complete setup instructions.

