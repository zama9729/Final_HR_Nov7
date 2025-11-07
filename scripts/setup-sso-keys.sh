#!/bin/bash
# Setup SSO RSA Keys for HR-Payroll Integration
# This script reads the generated keys and sets them up in docker-compose.yml or .env

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
KEYS_DIR="$PROJECT_ROOT/.keys"

echo "🔐 Setting up SSO RSA Keys for HR-Payroll Integration..."
echo ""

# Check if keys exist
if [ ! -f "$KEYS_DIR/hr-payroll-private.pem" ] || [ ! -f "$KEYS_DIR/hr-payroll-public.pem" ]; then
    echo "❌ RSA keys not found. Generating keys first..."
    node "$SCRIPT_DIR/generate-rsa-keys.js"
fi

# Read keys
PRIVATE_KEY=$(cat "$KEYS_DIR/hr-payroll-private.pem" | tr '\n' '|' | sed 's/|/\\n/g')
PUBLIC_KEY=$(cat "$KEYS_DIR/hr-payroll-public.pem" | tr '\n' '|' | sed 's/|/\\n/g')

echo "✅ Keys loaded from .keys directory"
echo ""
echo "📝 Add these to your environment:"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "For HR System (.env in root directory):"
echo "HR_PAYROLL_JWT_PRIVATE_KEY=\"$PRIVATE_KEY\""
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "For Payroll System (docker-compose.yml or payroll-app/.env):"
echo "HR_PAYROLL_JWT_PUBLIC_KEY=\"$PUBLIC_KEY\""
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "⚠️  After adding keys, restart services:"
echo "   docker-compose restart api payroll-api"
echo ""

