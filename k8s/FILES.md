# Kubernetes Files Overview

This directory contains all Kubernetes manifests for deploying the HR Suite application.

## File Structure

### Core Configuration
- **namespace.yaml** - Creates the `hr-suite` namespace
- **configmaps.yaml** - Non-sensitive configuration for all services
- **secrets.yaml** - Sensitive configuration (passwords, API keys, etc.) - **UPDATE BEFORE DEPLOYING**
- **secrets-template.yaml** - Template for secrets.yaml (safe to commit)

### Infrastructure Services
- **postgres-deployment.yaml** - PostgreSQL database deployment with PVC
- **redis-deployment.yaml** - Redis cache deployment with PVC (main app)
- **minio-deployment.yaml** - MinIO object storage deployment with PVC

### Application Services
- **api-deployment.yaml** - Main HR Suite API backend (Node.js)
- **payroll-api-deployment.yaml** - Payroll API backend (Node.js/TypeScript)
- **rag-service-deployment.yaml** - RAG/AI service (Python/FastAPI) with uploads PVC
- **frontend-deployment.yaml** - Main frontend and payroll frontend (React/Nginx)

### Networking
- **services.yaml** - Kubernetes Services for all deployments
- **ingress.yaml** - Ingress configuration for external access

### Deployment Tools
- **deploy.sh** - Bash script for automated deployment (Linux/Mac/WSL)
- **deploy.ps1** - PowerShell script for automated deployment (Windows)
- **kustomization.yaml** - Kustomize configuration (optional)

### Documentation
- **README.md** - Comprehensive deployment guide
- **FILES.md** - This file

## Deployment Order

1. namespace.yaml
2. configmaps.yaml
3. secrets.yaml (after updating!)
4. Infrastructure: postgres, redis, minio
5. Application: api, payroll-api, rag-service
6. Frontend: frontend deployments
7. services.yaml
8. ingress.yaml (optional)

## Quick Commands

```bash
# Deploy everything (Linux/Mac/WSL)
./deploy.sh

# Deploy everything (Windows PowerShell)
.\deploy.ps1

# Or manually
kubectl apply -f namespace.yaml
kubectl apply -f configmaps.yaml
kubectl apply -f secrets.yaml
# ... etc
```

## Important Notes

1. **Update secrets.yaml** before deploying - it contains placeholder values
2. **Update image names** in deployment files to point to your container registry
3. **Update storage classes** in PVC definitions to match your cluster
4. **Update domain names** in ingress.yaml
5. **Review resource limits** in deployments based on your needs



















