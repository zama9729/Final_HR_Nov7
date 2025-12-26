# Docker Super Admin Setup Guide

## Quick Fix for Super Admin Access in Docker

### Step 1: Verify .env file has the variable
Make sure your `.env` file (in project root) has:
```env
VITE_ADMIN_EMAILS=zama@hr.com
ADMIN_EMAILS=zama@hr.com
```

### Step 2: Rebuild and Restart Containers

#### If using Production Build (port 8080):
```bash
# Stop containers
docker-compose down

# Rebuild frontend with new env vars
docker-compose build app

# Start containers
docker-compose up -d
```

#### If using Dev Mode (port 3300):
```bash
# Stop containers
docker-compose down

# Rebuild and restart
docker-compose --profile dev up -d --build app-dev
```

### Step 3: Verify Access
1. Log in at: `http://localhost:8080/auth/login` (or your port)
2. Use email: `zama@hr.com`
3. Navigate to: `http://localhost:8080/superadmin`

## Troubleshooting

### Check if env var is loaded:
```bash
# For production container
docker exec hr-suite-app printenv | grep VITE_ADMIN

# For dev container  
docker exec hr-suite-app-dev printenv | grep VITE_ADMIN
```

### View container logs:
```bash
# Frontend logs
docker-compose logs -f app

# Or for dev
docker-compose logs -f app-dev
```

### Force rebuild without cache:
```bash
docker-compose build --no-cache app
docker-compose up -d
```

## Important Notes

- **Production builds**: Vite env vars must be passed as `ARG` during build time
- **Dev mode**: Vite env vars can be passed as `ENV` at runtime
- **After changes**: Always rebuild the frontend container
- **Email match**: Must match exactly (case-insensitive) with logged-in email

