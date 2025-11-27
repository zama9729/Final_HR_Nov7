#!/bin/bash
# SSL Certificate Setup Script
# This script helps generate self-signed certificates for DEVELOPMENT.
# For production, use certificates from Let's Encrypt or a trusted CA.

set -e

DOMAIN="${1:-localhost}"   # usage: ./ssl-setup.sh hr.yourcompany.com

SSL_DIR="./ssl"
mkdir -p "$SSL_DIR"

echo "🔐 Setting up SSL certificates for domain: $DOMAIN"

# Check if certificates already exist
if [ -f "$SSL_DIR/cert.pem" ] && [ -f "$SSL_DIR/key.pem" ]; then
    echo "✅ SSL certificates already exist in $SSL_DIR"
    echo "   To regenerate, delete the existing files and run this script again."
    exit 0
fi

# Generate self-signed certificate for development
echo "📝 Generating self-signed certificate (valid for 365 days)..."
openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
    -keyout "$SSL_DIR/key.pem" \
    -out "$SSL_DIR/cert.pem" \
    -subj "/C=IN/ST=State/L=City/O=Organization/CN=$DOMAIN" \
    -addext "subjectAltName=DNS:$DOMAIN,DNS:localhost,IP:127.0.0.1,IP:::1"

echo "✅ SSL certificates generated successfully!"
echo ""
echo "📋 Certificate details:"
echo "   Certificate: $SSL_DIR/cert.pem"
echo "   Private Key: $SSL_DIR/key.pem"
echo ""
echo "⚠️  Note: These are self-signed certificates for DEVELOPMENT only."
echo "   Browsers will show them as 'not secure' unless you trust the CA."
echo ""
echo "🔧 For PRODUCTION with a real domain (e.g. hr.yourcompany.com):"
echo "   1. Install certbot: sudo apt-get install certbot"
echo "   2. Run: sudo certbot certonly --standalone -d $DOMAIN"
echo "   3. Update nginx.conf with the certificate paths, for example:"
echo "      ssl_certificate /etc/letsencrypt/live/$DOMAIN/fullchain.pem;"
echo "      ssl_certificate_key /etc/letsencrypt/live/$DOMAIN/privkey.pem;"
