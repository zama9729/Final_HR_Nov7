# Step-by-Step Guide to Fix Payroll SSO Issue

## Problem
Getting `ERR_EMPTY_RESPONSE` when accessing `/sso?token=...` on port 4000.

## Solution
Enable development mode to allow unverified RS256 tokens (for local development only).

---

## Step 1: Check Current Status

### 1.1 Check if services are running
```bash
docker-compose ps
```

You should see:
- `payroll-api` running on port 4000
- `payroll-app` running on port 3002
- `api` (HR backend) running on port 3001

### 1.2 Check payroll-api logs
```bash
docker-compose logs payroll-api --tail=50
```

Look for any error messages related to SSO or JWT verification.

---

## Step 2: Configure Environment Variables

### Option A: Using .env file (Recommended)

1. **Check if `.env` file exists in the root directory:**
   ```bash
   ls -la .env
   # or on Windows:
   dir .env
   ```

2. **If `.env` doesn't exist, create it:**
   ```bash
   # On Linux/Mac
   touch .env
   
   # On Windows PowerShell
   New-Item .env -ItemType File
   ```

3. **Add these lines to your `.env` file:**
   ```env
   # Payroll SSO Configuration (Development Mode)
   ALLOW_UNVERIFIED_SSO=true
   NODE_ENV=development
   
   # Optional: If you have the public key, use this instead (more secure)
   # HR_PAYROLL_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"
   ```

4. **Save the file**

### Option B: Modify docker-compose.yml directly

1. **Open `docker-compose.yml` in a text editor**

2. **Find the `payroll-api` service (around line 127)**

3. **Add these environment variables to the `environment` section:**
   ```yaml
   payroll-api:
     # ... existing config ...
     environment:
       # ... existing variables ...
       - ALLOW_UNVERIFIED_SSO=true
       - DEV_MODE=true
   ```

4. **Save the file**

---

## Step 3: Restart Payroll API Service

### 3.1 Stop the payroll-api service
```bash
docker-compose stop payroll-api
```

### 3.2 Start it again (this will pick up new environment variables)
```bash
docker-compose up -d payroll-api
```

### 3.3 Or restart all services
```bash
docker-compose restart
```

---

## Step 4: Verify Configuration

### 4.1 Check if the service started successfully
```bash
docker-compose logs payroll-api --tail=20
```

You should see:
```
API listening on :4000
```

### 4.2 Test the health endpoint
```bash
curl http://localhost:4000/health
```

Expected response:
```json
{"ok":true}
```

### 4.3 Check environment variables are loaded
```bash
docker-compose exec payroll-api env | grep -E "ALLOW_UNVERIFIED|NODE_ENV|DEV_MODE"
```

You should see:
```
ALLOW_UNVERIFIED_SSO=true
NODE_ENV=development
DEV_MODE=true
```

---

## Step 5: Test SSO Flow

### 5.1 Access HR System
1. Open your browser: `http://localhost:3000` (or your HR frontend URL)
2. Login with your credentials

### 5.2 Click on "Payroll" in the sidebar
- This should call `/api/payroll/sso` from HR backend
- It will generate a JWT token
- It will redirect to `http://localhost:3002/sso?token=...`

### 5.3 Check payroll-api logs
```bash
docker-compose logs payroll-api --follow
```

You should see logs like:
```
[REQUEST] GET /sso (with SSO token)
🔍 Token algorithm: RS256
⚠️  DEVELOPMENT MODE: Allowing unverified RS256 token (no public key configured)
✅ Token decoded (unverified) in development mode
✅ SSO token verified: your-email@example.com (payroll_admin) from org ...
✅ Processing SSO for user: your-email@example.com
✅ SSO successful: your-email@example.com (payroll_admin) from org ...
✅ Redirecting to: http://localhost:3002/pin-auth?sso=true
```

### 5.4 Expected Result
- You should be redirected to the Payroll app PIN authentication page
- If you haven't set a PIN, you'll be redirected to setup PIN page
- If you have a PIN, you'll be asked to enter it

---

## Step 6: Troubleshooting

### Issue: Still getting empty response

**Check 1: Is the service running?**
```bash
docker-compose ps payroll-api
```

**Check 2: Check for errors in logs**
```bash
docker-compose logs payroll-api --tail=100 | grep -i error
```

**Check 3: Verify environment variables**
```bash
docker-compose exec payroll-api printenv | grep -E "ALLOW|NODE_ENV|DEV"
```

**Check 4: Rebuild the service (if code changes were made)**
```bash
docker-compose up -d --build payroll-api
```

### Issue: "SSO configuration error" message

This means the environment variable wasn't picked up. Try:

1. **Stop and remove the container:**
   ```bash
   docker-compose stop payroll-api
   docker-compose rm -f payroll-api
   ```

2. **Start it again:**
   ```bash
   docker-compose up -d payroll-api
   ```

### Issue: Token verification still failing

1. **Check the token algorithm in HR backend:**
   - The HR backend might be using HS256 instead of RS256
   - Check `server/routes/payroll-sso.js` to see which algorithm is used

2. **If using HS256, ensure shared secret matches:**
   ```env
   # In HR backend .env
   PAYROLL_JWT_SECRET=your-shared-secret
   
   # In payroll-api .env (or docker-compose.yml)
   HR_JWT_SECRET=your-shared-secret  # Must match!
   ```

---

## Step 7: Production Setup (For Later)

When deploying to production, you should:

1. **Remove `ALLOW_UNVERIFIED_SSO=true`**

2. **Set the public key:**
   ```env
   HR_PAYROLL_JWT_PUBLIC_KEY="-----BEGIN PUBLIC KEY-----
   MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...
   -----END PUBLIC KEY-----"
   ```

3. **Set production mode:**
   ```env
   NODE_ENV=production
   ```

---

## Quick Reference Commands

```bash
# Check services status
docker-compose ps

# View payroll-api logs
docker-compose logs payroll-api --follow

# Restart payroll-api
docker-compose restart payroll-api

# Rebuild and restart
docker-compose up -d --build payroll-api

# Check environment variables
docker-compose exec payroll-api env | grep -E "ALLOW|NODE_ENV"

# Test health endpoint
curl http://localhost:4000/health
```

---

## Summary

The fix involves:
1. ✅ Adding `ALLOW_UNVERIFIED_SSO=true` to enable development mode
2. ✅ Restarting the payroll-api service to pick up the change
3. ✅ Testing the SSO flow from HR system

This allows the payroll backend to accept RS256 tokens without requiring the public key in development mode.

