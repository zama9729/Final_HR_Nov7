# SSL/HTTPS Configuration Guide

This guide explains how to set up SSL/HTTPS for the HR Suite application.

## Overview

The application supports SSL/HTTPS in two ways:
1. **Nginx Reverse Proxy (Recommended)** - Handles SSL termination at the proxy level
2. **Node.js HTTPS Server** - Direct SSL support in the Express server

## Option 1: Nginx Reverse Proxy (Recommended for Production)

### Setup Steps

1. **Generate SSL Certificates**

   For development (self-signed):
   ```bash
   cd nginx
   chmod +x ssl-setup.sh
   ./ssl-setup.sh
   ```

   For production (Let's Encrypt):
   ```bash
   # Install certbot
   sudo apt-get update
   sudo apt-get install certbot

   # Generate certificate
   sudo certbot certonly --standalone -d yourdomain.com -d www.yourdomain.com

   # Certificates will be in:
   # /etc/letsencrypt/live/yourdomain.com/fullchain.pem
   # /etc/letsencrypt/live/yourdomain.com/privkey.pem
   ```

2. **Update Nginx Configuration**

   Edit `nginx/nginx.conf` and update certificate paths:
   ```nginx
   ssl_certificate /etc/nginx/ssl/cert.pem;  # Or /etc/letsencrypt/live/yourdomain.com/fullchain.pem
   ssl_certificate_key /etc/nginx/ssl/key.pem;  # Or /etc/letsencrypt/live/yourdomain.com/privkey.pem
   ```

3. **Start Services with SSL**

   ```bash
   # Start all services including nginx
   docker-compose -f docker-compose.yml -f docker-compose.ssl.yml up -d
   ```

4. **Access Application**

   - Frontend: `https://localhost`
   - API: `https://localhost/api`
   - Payroll: `https://localhost/payroll`

### Nginx Configuration Features

- ✅ Automatic HTTP to HTTPS redirect
- ✅ Modern SSL/TLS protocols (TLS 1.2, 1.3)
- ✅ Security headers (HSTS, X-Frame-Options, etc.)
- ✅ Reverse proxy for all services
- ✅ CORS support for API endpoints
- ✅ Large file upload support (100MB)

## Option 2: Node.js HTTPS Server (Direct SSL)

### Setup Steps

1. **Place SSL Certificates**

   Place your certificate files in `nginx/ssl/`:
   ```
   nginx/ssl/
     ├── cert.pem  (certificate)
     └── key.pem   (private key)
   ```

2. **Configure Environment Variables**

   Add to `.env`:
   ```env
   SSL_ENABLED=true
   SSL_CERT_PATH=./nginx/ssl/cert.pem
   SSL_KEY_PATH=./nginx/ssl/key.pem
   PORT=3443  # Use different port for HTTPS
   ```

3. **Start Server**

   ```bash
   npm start
   # Or
   docker-compose up api
   ```

4. **Access Application**

   - API: `https://localhost:3443/api`

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `SSL_ENABLED` | Enable SSL/HTTPS | `false` |
| `HTTPS_ENABLED` | Alias for SSL_ENABLED | `false` |
| `SSL_CERT_PATH` | Path to SSL certificate file | `./nginx/ssl/cert.pem` |
| `SSL_KEY_PATH` | Path to SSL private key file | `./nginx/ssl/key.pem` |
| `SSL_CERT_DIR` | Directory containing SSL certificates | `./nginx/ssl` |

## Production Checklist

- [ ] Use Let's Encrypt or trusted CA certificates (not self-signed)
- [ ] Configure proper domain names in certificates
- [ ] Set up certificate auto-renewal (certbot with cron)
- [ ] Enable HSTS header (already in nginx.conf)
- [ ] Configure firewall to allow ports 80 and 443
- [ ] Update `FRONTEND_URL` and `VITE_API_URL` to use HTTPS
- [ ] Test SSL configuration with SSL Labs: https://www.ssllabs.com/ssltest/
- [ ] Set up monitoring for certificate expiration

## Certificate Renewal (Let's Encrypt)

Let's Encrypt certificates expire every 90 days. Set up auto-renewal:

```bash
# Add to crontab (runs twice daily)
0 0,12 * * * certbot renew --quiet --deploy-hook "docker-compose -f docker-compose.yml -f docker-compose.ssl.yml restart nginx"
```

Or use systemd timer:
```bash
sudo systemctl enable certbot.timer
sudo systemctl start certbot.timer
```

## Troubleshooting

### Certificate Errors

**Error: "certificate has expired"**
- Renew certificate: `sudo certbot renew`
- Restart nginx: `docker-compose restart nginx`

**Error: "self-signed certificate"**
- Browser warning is expected for self-signed certs
- For production, use Let's Encrypt or trusted CA

**Error: "certificate not found"**
- Check file paths in nginx.conf
- Verify files exist: `ls -la nginx/ssl/`
- Check file permissions: `chmod 644 nginx/ssl/*.pem`

### Connection Issues

**Port 443 not accessible**
- Check firewall: `sudo ufw allow 443/tcp`
- Verify nginx is running: `docker-compose ps nginx`
- Check nginx logs: `docker-compose logs nginx`

**Mixed Content Warnings**
- Ensure all API calls use HTTPS
- Update `VITE_API_URL` to use `https://`
- Check browser console for HTTP requests

### Testing SSL

```bash
# Test SSL connection
openssl s_client -connect localhost:443 -servername localhost

# Check certificate details
openssl x509 -in nginx/ssl/cert.pem -text -noout

# Test with curl
curl -v https://localhost/api/health
```

## Security Best Practices

1. **Use Strong Ciphers**: Already configured in nginx.conf
2. **Enable HSTS**: Already configured
3. **Disable Weak Protocols**: Only TLS 1.2+ enabled
4. **Regular Updates**: Keep nginx and certificates updated
5. **Monitor Expiration**: Set up alerts for certificate expiration
6. **Use OCSP Stapling**: Can be added to nginx.conf for better performance

## Files Structure

```
.
├── nginx/
│   ├── nginx.conf          # Nginx configuration with SSL
│   ├── ssl-setup.sh        # Script to generate self-signed certs
│   └── ssl/                # SSL certificates directory
│       ├── cert.pem        # Certificate file
│       └── key.pem         # Private key file
├── docker-compose.ssl.yml  # Docker Compose with nginx SSL
├── server/
│   └── utils/
│       └── ssl-config.js   # SSL helper utilities
└── docs/
    └── SSL_HTTPS_SETUP.md  # This file
```

## Quick Start (Development)

```bash
# 1. Generate self-signed certificates
cd nginx && ./ssl-setup.sh && cd ..

# 2. Start with SSL
docker-compose -f docker-compose.yml -f docker-compose.ssl.yml up -d

# 3. Access application
# Open https://localhost (accept self-signed certificate warning)
```

## Quick Start (Production)

```bash
# 1. Get Let's Encrypt certificate
sudo certbot certonly --standalone -d yourdomain.com

# 2. Update nginx.conf with certificate paths
# Edit nginx/nginx.conf and update ssl_certificate paths

# 3. Start with SSL
docker-compose -f docker-compose.yml -f docker-compose.ssl.yml up -d

# 4. Set up auto-renewal
sudo certbot renew --dry-run
```

