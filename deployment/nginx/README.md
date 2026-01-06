# Nginx Configuration

This directory contains the Nginx configuration file for the frontend container.

## Usage

The `nginx.conf` file is automatically copied into the frontend Docker image during build.

## Customization

To customize the Nginx configuration:

1. Edit `nginx.conf`
2. Rebuild the frontend image
3. Redeploy

## SSL/TLS Configuration

For production with SSL, add SSL configuration:

```nginx
server {
    listen 443 ssl http2;
    server_name your-domain.com;
    
    ssl_certificate /etc/nginx/ssl/cert.pem;
    ssl_certificate_key /etc/nginx/ssl/key.pem;
    
    # SSL configuration
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    
    # ... rest of configuration
}
```

## Reverse Proxy Setup

If using Nginx as a reverse proxy, add:

```nginx
location /api {
    proxy_pass http://api-service:3001;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

