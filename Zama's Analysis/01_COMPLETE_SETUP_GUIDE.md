# Complete Setup Guide - HR Suite Application
## Step-by-Step Installation & Deployment Instructions

This guide will walk you through setting up the HR Suite application from scratch, including database migrations, Docker containers, and running all services.

---

## 📋 Table of Contents

1. [Prerequisites](#prerequisites)
2. [System Requirements](#system-requirements)
3. [Initial Setup](#initial-setup)
4. [Database Setup & Migrations](#database-setup--migrations)
5. [Environment Configuration](#environment-configuration)
6. [Building Docker Containers](#building-docker-containers)
7. [Running Services Locally](#running-services-locally)
8. [Kubernetes Deployment (Production)](#kubernetes-deployment-production)
9. [Verification & Testing](#verification--testing)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
- **Node.js** v20.x or higher
- **PostgreSQL** v14+ (or Docker for containerized DB)
- **Redis** v6+ (or Docker for containerized Redis)
- **Docker** v20.10+ and Docker Compose v2.0+
- **Git** for cloning the repository
- **kubectl** (for Kubernetes deployment only)
- **MinIO** or S3-compatible storage (for file uploads)

### Required Accounts/Keys
- PostgreSQL database credentials
- Redis connection details
- AWS S3 credentials (or MinIO setup)
- JWT secret keys (generate using provided scripts)

---

## System Requirements

### Minimum Requirements (Development)
- **CPU**: 4 cores
- **RAM**: 8 GB
- **Storage**: 20 GB free space
- **OS**: Windows 10/11, macOS 10.15+, or Linux (Ubuntu 20.04+)

### Recommended Requirements (Production)
- **CPU**: 8+ cores
- **RAM**: 16 GB
- **Storage**: 100 GB SSD
- **OS**: Linux (Ubuntu 22.04 LTS or RHEL 8+)

### Production Kubernetes Cluster
- **Nodes**: 3+ worker nodes
- **CPU per node**: 4+ cores
- **RAM per node**: 8+ GB
- **Storage**: 50+ GB per node

---

## Initial Setup

### Step 1: Clone the Repository

```bash
# Clone the repository
git clone https://github.com/zama9729/Final_HR_Nov7.git
cd Final_HR_Nov7
```

### Step 2: Install Node.js Dependencies

```bash
# Install root dependencies (frontend)
npm install

# Install backend dependencies
cd server
npm install
cd ..

# Install payroll app dependencies (if using payroll module)
cd payroll-app
npm install
cd server
npm install
cd ../..

# Install RAG service dependencies (if using AI features)
cd rag-service
pip install -r requirements.txt
cd ..
```

---

## Database Setup & Migrations

### Step 3: Set Up PostgreSQL Database

#### Option A: Using Docker (Recommended for Development)

```bash
# Start PostgreSQL container
docker run -d \
  --name hr-postgres \
  -e POSTGRES_USER=hr_user \
  -e POSTGRES_PASSWORD=hr_password \
  -e POSTGRES_DB=hr_suite \
  -p 5432:5432 \
  postgres:14-alpine

# Wait for database to be ready (10-15 seconds)
sleep 15
```

#### Option B: Using Local PostgreSQL Installation

```bash
# Create database
createdb hr_suite

# Or using psql
psql -U postgres -c "CREATE DATABASE hr_suite;"
```

### Step 4: Run Database Migrations

```bash
# Navigate to server directory
cd server

# Run all migrations (in order)
# Migration files are in server/db/migrations/

# Option 1: Run migrations manually using psql
psql -U hr_user -d hr_suite -f db/migrations/001_initial_schema.sql
psql -U hr_user -d hr_suite -f db/migrations/002_employees.sql
psql -U hr_suite -d hr_suite -f db/migrations/003_timesheets.sql
# ... continue for all migration files

# Option 2: Use migration script (if available)
node scripts/run-migrations.js

# Option 3: Run SQL files directly
# List all migration files
ls -la db/migrations/*.sql

# Run each in order
for file in db/migrations/*.sql; do
  psql -U hr_user -d hr_suite -f "$file"
done
```

### Step 5: Seed Initial Data (Optional)

```bash
# Seed super admin user
npm run seed:super

# Seed default policies
npm run seed:default-policies

# Seed demo data (for testing)
npm run seed:demo-data
```

---

## Environment Configuration

### Step 6: Create Environment Files

#### Backend Environment (`.env` in `server/` directory)

```bash
cd server
cp .env.example .env  # If .env.example exists, or create new .env
```

Edit `server/.env`:

```env
# Database Configuration
DB_HOST=localhost
DB_PORT=5432
DB_NAME=hr_suite
DB_USER=hr_user
DB_PASSWORD=hr_password

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# Server Configuration
PORT=3001
NODE_ENV=development

# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# AWS S3 / MinIO Configuration
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
S3_BUCKET_NAME=hr-suite-uploads
S3_ENDPOINT=http://localhost:9000  # For MinIO

# Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM=noreply@yourcompany.com

# Frontend URL
FRONTEND_URL=http://localhost:8080

# RAG Service (AI Features)
RAG_API_URL=http://localhost:8001
OPENAI_API_KEY=your-openai-api-key  # Optional
```

#### Frontend Environment (`.env` in root directory)

```bash
cd ..
cp .env.example .env  # If exists, or create new
```

Edit `.env`:

```env
VITE_API_URL=http://localhost:3001
VITE_APP_NAME=HR Suite
```

#### Payroll App Environment (if using payroll module)

```bash
cd payroll-app
cp .env.example .env
```

Edit `payroll-app/.env`:

```env
VITE_API_URL=http://localhost:3001
PAYROLL_API_URL=http://localhost:3002
DATABASE_URL=postgresql://hr_user:hr_password@localhost:5432/hr_suite
```

### Step 7: Generate JWT Keys (If Required)

```bash
# Generate RSA keys for SSO (if using)
node scripts/generate-rsa-keys.js

# Or use PowerShell script
.\scripts\setup-sso-keys.ps1
```

---

## Building Docker Containers

### Step 8: Build Docker Images

```bash
# Build frontend image
docker build -t hr-suite-frontend:latest -f Dockerfile .

# Build backend API image
docker build -t hr-suite-api:latest -f Dockerfile.api server

# Build payroll frontend (if using)
docker build -t hr-suite-payroll-frontend:latest -f Dockerfile payroll-app

# Build payroll API (if using)
docker build -t hr-suite-payroll-api:latest -f Dockerfile payroll-app/server

# Build RAG service (if using AI features)
docker build -t hr-suite-rag-service:latest -f Dockerfile rag-service
```

### Step 9: Set Up Supporting Services with Docker Compose

```bash
# Start PostgreSQL, Redis, and MinIO using docker-compose
docker-compose up -d postgres redis minio

# Or start all services
docker-compose up -d
```

Verify services are running:

```bash
docker-compose ps
```

---

## Running Services Locally

### Step 10: Start Backend API Server

#### Option A: Using Docker

```bash
docker run -d \
  --name hr-api \
  --network host \
  -p 3001:3001 \
  -v $(pwd)/server:/app \
  -v $(pwd)/server/.env:/app/.env \
  hr-suite-api:latest
```

#### Option B: Using Node.js Directly

```bash
# Terminal Window 1: Backend API
cd server
npm run dev
# Server will start on http://localhost:3001
```

### Step 11: Start Frontend Development Server

```bash
# Terminal Window 2: Frontend
cd ..  # Back to root directory
npm run dev
# Frontend will start on http://localhost:8080 (or port shown in terminal)
```

### Step 12: Start Payroll Services (If Using)

```bash
# Terminal Window 3: Payroll Frontend
cd payroll-app
npm run dev
# Payroll frontend on http://localhost:3003

# Terminal Window 4: Payroll API
cd payroll-app/server
npm run dev
# Payroll API on http://localhost:3002
```

### Step 13: Start RAG Service (If Using AI Features)

```bash
# Terminal Window 5: RAG Service
cd rag-service
python -m uvicorn app.main:app --host 0.0.0.0 --port 8001 --reload
# RAG service on http://localhost:8001
```

### Step 14: Start Redis (If Not Using Docker Compose)

```bash
# Using Docker
docker run -d --name redis -p 6379:6379 redis:7-alpine

# Or using local installation
redis-server
```

---

## Kubernetes Deployment (Production)

### Step 15: Prepare Kubernetes Cluster

```bash
# Ensure kubectl is configured
kubectl cluster-info

# Create namespace
kubectl create namespace hr-suite

# Or use provided namespace file
kubectl apply -f k8s/namespace.yaml
```

### Step 16: Set Up Secrets

```bash
# Create secrets from template
cp k8s/secrets-template.yaml k8s/secrets.yaml

# Edit secrets.yaml with your actual values
# Then apply
kubectl apply -f k8s/secrets.yaml -n hr-suite
```

### Step 17: Deploy Database

```bash
# Deploy PostgreSQL
kubectl apply -f k8s/postgres-deployment.yaml -n hr-suite

# Wait for database to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n hr-suite --timeout=300s
```

### Step 18: Run Migrations in Kubernetes

```bash
# Option 1: Run migrations via job
kubectl create job --from=cronjob/migration-job migration-$(date +%s) -n hr-suite

# Option 2: Run migrations manually in a pod
kubectl run migration-pod --image=hr-suite-api:latest --rm -it --restart=Never -n hr-suite -- \
  sh -c "node scripts/run-migrations.js"
```

### Step 19: Deploy Application Services

```bash
# Deploy Redis
kubectl apply -f k8s/redis-deployment.yaml -n hr-suite

# Deploy MinIO
kubectl apply -f k8s/minio-deployment.yaml -n hr-suite

# Deploy API
kubectl apply -f k8s/api-deployment.yaml -n hr-suite

# Deploy Frontend
kubectl apply -f k8s/frontend-deployment.yaml -n hr-suite

# Deploy Payroll Services (if using)
kubectl apply -f k8s/payroll-api-deployment.yaml -n hr-suite

# Deploy RAG Service (if using)
kubectl apply -f k8s/rag-service-deployment.yaml -n hr-suite
```

### Step 20: Set Up Ingress

```bash
# Deploy ingress controller (if not already installed)
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/cloud/deploy.yaml

# Deploy ingress configuration
kubectl apply -f k8s/ingress.yaml -n hr-suite
```

### Step 21: Verify Deployment

```bash
# Check all pods are running
kubectl get pods -n hr-suite

# Check services
kubectl get svc -n hr-suite

# Check ingress
kubectl get ingress -n hr-suite

# View logs
kubectl logs -f deployment/api -n hr-suite
kubectl logs -f deployment/frontend -n hr-suite
```

---

## Verification & Testing

### Step 22: Test API Endpoints

```bash
# Health check
curl http://localhost:3001/api/health

# Test authentication (create test user first)
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"Test123!","first_name":"Test","last_name":"User"}'
```

### Step 23: Access Application

1. **Frontend**: Open browser to `http://localhost:8080`
2. **API Docs**: `http://localhost:3001/api/docs` (if Swagger is enabled)
3. **MinIO Console**: `http://localhost:9001` (default credentials: minioadmin/minioadmin)

### Step 24: Create First Admin User

```bash
# Using seed script
cd server
npm run seed:super

# Or manually via API
curl -X POST http://localhost:3001/api/auth/signup \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@company.com",
    "password": "SecurePassword123!",
    "first_name": "Admin",
    "last_name": "User",
    "role": "admin"
  }'
```

---

## Troubleshooting

### Common Issues

#### Issue 1: Database Connection Failed

```bash
# Check PostgreSQL is running
docker ps | grep postgres
# Or
psql -U hr_user -d hr_suite -c "SELECT 1;"

# Verify connection string in .env
# Check firewall/network settings
```

#### Issue 2: Port Already in Use

```bash
# Find process using port
# Windows
netstat -ano | findstr :3001
# Linux/Mac
lsof -i :3001

# Kill process or change port in .env
```

#### Issue 3: Migration Errors

```bash
# Check database exists
psql -U postgres -l | grep hr_suite

# Verify user has permissions
psql -U postgres -c "GRANT ALL PRIVILEGES ON DATABASE hr_suite TO hr_user;"

# Run migrations in order manually
```

#### Issue 4: Docker Build Fails

```bash
# Clear Docker cache
docker system prune -a

# Rebuild without cache
docker build --no-cache -t hr-suite-api:latest -f Dockerfile.api server
```

#### Issue 5: Frontend Can't Connect to API

```bash
# Verify VITE_API_URL in .env
# Check CORS settings in backend
# Verify API is running on correct port
curl http://localhost:3001/api/health
```

### Getting Help

- Check logs: `docker logs <container-name>`
- Check Kubernetes logs: `kubectl logs <pod-name> -n hr-suite`
- Review error messages in browser console (F12)
- Check server logs in terminal windows

---

## Quick Start Summary

For experienced developers, here's the condensed version:

```bash
# 1. Clone and install
git clone <repo-url> && cd Final_HR_Nov7
npm install && cd server && npm install && cd ..

# 2. Start database
docker-compose up -d postgres redis

# 3. Run migrations
cd server && psql -U hr_user -d hr_suite -f db/migrations/*.sql && cd ..

# 4. Configure .env files
# Edit server/.env and root .env

# 5. Start services
# Terminal 1: cd server && npm run dev
# Terminal 2: npm run dev

# 6. Access: http://localhost:8080
```

---

## Next Steps

After successful setup:

1. **Configure Organization**: Set up your organization details
2. **Create Users**: Add employees, managers, HR staff
3. **Set Up Policies**: Configure leave policies, shift templates
4. **Import Data**: Use bulk import features for employees
5. **Customize**: Adjust settings, branding, workflows

---

## Support & Documentation

- **API Documentation**: Check `docs/` directory
- **System Workflows**: See `docs/SYSTEM_WORKFLOWS.md`
- **Kubernetes Guide**: See `k8s/README.md`
- **Feature Documentation**: See `docs/` for module-specific guides

---

**Last Updated**: December 2025
**Version**: 1.0.0

