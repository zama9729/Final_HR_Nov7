#!/bin/bash
# Test SSO Endpoint
# This script tests the SSO endpoint to verify it's working correctly

set -e

echo "🧪 Testing SSO Endpoint..."
echo ""

# Check if Payroll API is running
echo "1. Checking if Payroll API is running..."
if curl -s -f http://localhost:4000/health > /dev/null; then
    echo "✅ Payroll API is running"
else
    echo "❌ Payroll API is not running on port 4000"
    echo "   Start it with: docker-compose up payroll-api"
    exit 1
fi

# Check if HR API is running
echo ""
echo "2. Checking if HR API is running..."
if curl -s -f http://localhost:3001/health > /dev/null; then
    echo "✅ HR API is running"
else
    echo "❌ HR API is not running on port 3001"
    echo "   Start it with: docker-compose up api"
    exit 1
fi

# Test SSO endpoint without token (should fail)
echo ""
echo "3. Testing SSO endpoint without token (should fail)..."
RESPONSE=$(curl -s -w "\n%{http_code}" http://localhost:4000/sso 2>&1)
HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
if [ "$HTTP_CODE" = "401" ]; then
    echo "✅ SSO endpoint correctly rejects requests without token"
else
    echo "⚠️  Unexpected response: HTTP $HTTP_CODE"
    echo "   Response: $(echo "$RESPONSE" | head -n-1)"
fi

# Check environment variables
echo ""
echo "4. Checking environment variables..."
if docker exec petal-hr-suite-16029-payroll-api-1 env | grep -q "HR_PAYROLL_JWT_PUBLIC_KEY"; then
    echo "✅ HR_PAYROLL_JWT_PUBLIC_KEY is set in Payroll API"
else
    echo "⚠️  HR_PAYROLL_JWT_PUBLIC_KEY is not set in Payroll API"
    echo "   Add it to .env file or docker-compose.yml"
fi

if docker exec petal-hr-suite-16029-api-1 env | grep -q "HR_PAYROLL_JWT_PRIVATE_KEY"; then
    echo "✅ HR_PAYROLL_JWT_PRIVATE_KEY is set in HR API"
else
    echo "⚠️  HR_PAYROLL_JWT_PRIVATE_KEY is not set in HR API"
    echo "   Add it to .env file"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📝 Next Steps:"
echo "   1. Ensure RSA keys are set in environment variables"
echo "   2. Login to HR system and click 'Payroll' link"
echo "   3. Should automatically redirect to Payroll app with SSO"
echo ""

