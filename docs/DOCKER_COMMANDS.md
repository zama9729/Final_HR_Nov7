# Docker Commands for Payroll App Changes

## Quick Restart (Recommended - Changes are already in mounted volumes)

Since the `payroll-app` service has volumes mounted (`./payroll-app:/app`), your changes should already be reflected. If not, restart the container:

```bash
# Restart just the payroll frontend container
docker-compose restart payroll-app

# Or restart all payroll-related services
docker-compose restart payroll-app payroll-api
```

## Rebuild and Restart (If changes aren't showing)

If you need to rebuild the containers:

```bash
# Rebuild and restart the payroll frontend
docker-compose up -d --build payroll-app

# Rebuild and restart both frontend and API
docker-compose up -d --build payroll-app payroll-api
```

## Full Rebuild (Complete rebuild from scratch)

```bash
# Stop all services
docker-compose down

# Rebuild all containers
docker-compose build --no-cache

# Start all services
docker-compose up -d
```

## View Logs (To check if changes are applied)

```bash
# View payroll app logs
docker-compose logs -f payroll-app

# View payroll API logs
docker-compose logs -f payroll-api

# View all logs
docker-compose logs -f
```

## Copy Files into Running Container (Alternative method)

If you need to manually copy files into a running container:

```bash
# Copy the CreatePayrollDialog file into the container
docker cp payroll-app/src/components/payroll/CreatePayrollDialog.tsx \
  $(docker-compose ps -q payroll-app):/app/src/components/payroll/CreatePayrollDialog.tsx

# Copy the PayrollReviewDialog file
docker cp payroll-app/src/components/payroll/PayrollReviewDialog.tsx \
  $(docker-compose ps -q payroll-app):/app/src/components/payroll/PayrollReviewDialog.tsx

# Copy the backend routes file
docker cp payroll-app/server/src/routes/app.ts \
  $(docker-compose ps -q payroll-api):/usr/src/app/src/routes/app.ts
```

## Verify Changes

```bash
# Check if files are mounted correctly
docker-compose exec payroll-app ls -la /app/src/components/payroll/

# View the file content in container
docker-compose exec payroll-app cat /app/src/components/payroll/CreatePayrollDialog.tsx | head -20
```

## Development Workflow (Recommended)

Since volumes are mounted, the recommended workflow is:

1. **Make changes locally** (already done ✅)
2. **Restart the container** to ensure hot-reload picks up changes:
   ```bash
   docker-compose restart payroll-app
   ```
3. **Check logs** to verify:
   ```bash
   docker-compose logs -f payroll-app
   ```

The changes should be automatically picked up by the development server due to volume mounting.

