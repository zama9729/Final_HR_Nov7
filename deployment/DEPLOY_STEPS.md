# Step-by-Step Deployment Guide

Complete guide to deploy HR Suite to production.

## 🎯 Choose Your Deployment Method

- **Docker Compose** - Easier, faster setup, good for single server
- **Kubernetes** - Scalable, production-grade, good for clusters

---

## 📦 Method 1: Docker Compose Deployment

### Prerequisites
- Docker Engine 20.10+
- Docker Compose 2.0+
- At least 8GB RAM
- 20GB+ disk space

### Step 1: Navigate to Deployment Directory

```bash
cd deployment
```

### Step 2: Prepare Environment Variables

```bash
cd env-templates
cp env.production.template .env.production
```

### Step 3: Edit Environment File

Edit `.env.production` and fill in these **REQUIRED** values:

```bash
# Database
DB_PASSWORD=YOUR_STRONG_PASSWORD_HERE

# Redis (optional but recommended)
REDIS_PASSWORD=YOUR_REDIS_PASSWORD

# JWT Secrets (generate strong random strings)
JWT_SECRET=YOUR_VERY_LONG_RANDOM_SECRET_KEY_MIN_32_CHARS
PAYROLL_JWT_SECRET=ANOTHER_STRONG_SECRET_KEY

# AWS S3 (or use MinIO)
AWS_ACCESS_KEY_ID=YOUR_AWS_ACCESS_KEY
AWS_SECRET_ACCESS_KEY=YOUR_AWS_SECRET_KEY
DOCS_STORAGE_BUCKET=hr-docs
AWS_REGION=ap-south-1

# OpenAI API Key
OPENAI_API_KEY=YOUR_OPENAI_API_KEY

# RAG Service
RAG_DB_PASSWORD=YOUR_RAG_DB_PASSWORD
RAG_REDIS_PASSWORD=YOUR_RAG_REDIS_PASSWORD

# Admin Emails
ADMIN_EMAILS=admin@yourdomain.com,hr@yourdomain.com
VITE_ADMIN_EMAILS=admin@yourdomain.com,hr@yourdomain.com

# URLs
FRONTEND_URL=https://yourdomain.com
API_URL=https://api.yourdomain.com
VITE_API_URL=https://api.yourdomain.com
```

### Step 4: Copy Environment File to Docker Directory

```bash
cp .env.production ../docker/.env.production
cd ../docker
```

### Step 5: Review Docker Compose File (Optional)

Check `docker-compose.prod.yml` and adjust:
- Ports if needed
- Resource limits
- Volume sizes

### Step 6: Build and Deploy

**On Linux/Mac:**
```bash
cd ../scripts
chmod +x deploy-docker.sh
./deploy-docker.sh production
```

**On Windows (PowerShell):**
```powershell
cd ..\scripts
.\deploy-docker.ps1 -Environment production
```

### Step 7: Verify Deployment

```bash
# Check service status
docker-compose -f docker/docker-compose.prod.yml ps

# View logs
docker-compose -f docker/docker-compose.prod.yml logs -f

# Test API health
curl http://localhost:3001/health

# Test Frontend
curl http://localhost:3000
```

### Step 8: Access Your Application

- **Frontend**: http://localhost:3000 (or your configured domain)
- **API**: http://localhost:3001
- **RAG API**: http://localhost:8001

---

## ☸️ Method 2: Kubernetes Deployment

### Prerequisites
- Kubernetes cluster (1.24+)
- kubectl configured and connected
- StorageClass for PersistentVolumes
- Ingress controller installed
- Container registry access (if using private images)

### Step 1: Navigate to Kubernetes Directory

```bash
cd deployment/k8s
```

### Step 2: Create Secrets File

```bash
cp secrets.template.yaml secrets.yaml
```

### Step 3: Edit Secrets File

Edit `secrets.yaml` and fill in **ALL** values:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: hr-suite-secrets
  namespace: hr-suite
type: Opaque
stringData:
  DB_PASSWORD: "YOUR_STRONG_PASSWORD"
  REDIS_PASSWORD: "YOUR_REDIS_PASSWORD"
  JWT_SECRET: "YOUR_VERY_LONG_RANDOM_SECRET_KEY"
  PAYROLL_JWT_SECRET: "ANOTHER_STRONG_SECRET_KEY"
  AWS_ACCESS_KEY_ID: "YOUR_AWS_ACCESS_KEY"
  AWS_SECRET_ACCESS_KEY: "YOUR_AWS_SECRET_KEY"
  OPENAI_API_KEY: "YOUR_OPENAI_API_KEY"
  RAG_DB_PASSWORD: "YOUR_RAG_DB_PASSWORD"
  RAG_REDIS_PASSWORD: "YOUR_RAG_REDIS_PASSWORD"
  ADMIN_EMAILS: "admin@yourdomain.com,hr@yourdomain.com"
  VITE_ADMIN_EMAILS: "admin@yourdomain.com,hr@yourdomain.com"
```

### Step 4: Update ConfigMap

Edit `configmap.yaml` and update:

```yaml
data:
  FRONTEND_URL: "https://yourdomain.com"
  API_URL: "https://api.yourdomain.com"
  VITE_API_URL: "https://api.yourdomain.com"
  # ... other values
```

### Step 5: Update Ingress

Edit `ingress.yaml` and update domain names:

```yaml
spec:
  tls:
  - hosts:
    - yourdomain.com
    - api.yourdomain.com
    secretName: hr-suite-tls
  rules:
  - host: yourdomain.com
  - host: api.yourdomain.com
```

### Step 6: Update Image References (if using private registry)

Edit deployment files (`api-deployment.yaml`, `frontend-deployment.yaml`, `rag-service-deployment.yaml`) and update:

```yaml
image: your-registry.com/hr-suite-api:latest
```

### Step 7: Deploy

**On Linux/Mac:**
```bash
cd ../scripts
chmod +x deploy-k8s.sh
./deploy-k8s.sh hr-suite
```

**On Windows (PowerShell):**
```powershell
cd ..\scripts
.\deploy-k8s.ps1 -Namespace hr-suite
```

### Step 8: Verify Deployment

```bash
# Check namespace
kubectl get namespace hr-suite

# Check all resources
kubectl get all -n hr-suite

# Check pods status
kubectl get pods -n hr-suite

# Check services
kubectl get svc -n hr-suite

# View logs
kubectl logs -f deployment/api -n hr-suite
```

### Step 9: Wait for Pods to be Ready

```bash
# Wait for all deployments
kubectl wait --for=condition=available deployment/api -n hr-suite --timeout=300s
kubectl wait --for=condition=available deployment/frontend -n hr-suite --timeout=300s
kubectl wait --for=condition=available deployment/rag-api -n hr-suite --timeout=300s
```

### Step 10: Configure SSL/TLS (if using cert-manager)

```bash
# Create ClusterIssuer (if not exists)
kubectl apply -f - <<EOF
apiVersion: cert-manager.io/v1
kind: ClusterIssuer
metadata:
  name: letsencrypt-prod
spec:
  acme:
    server: https://acme-v02.api.letsencrypt.org/directory
    email: your-email@yourdomain.com
    privateKeySecretRef:
      name: letsencrypt-prod
    solvers:
    - http01:
        ingress:
          class: nginx
EOF
```

### Step 11: Access Your Application

- **Frontend**: https://yourdomain.com
- **API**: https://api.yourdomain.com
- **RAG API**: http://rag-api-service.hr-suite.svc.cluster.local:80

---

## 🔧 Post-Deployment Configuration

### 1. Initialize Database (if needed)

```bash
# Docker Compose
docker exec -it hr-suite-postgres-prod psql -U postgres -d hr_suite

# Kubernetes
kubectl exec -it deployment/postgres -n hr-suite -- psql -U postgres -d hr_suite
```

### 2. Run Migrations (if any)

```bash
# Check if migrations are needed
# Run migration scripts if required
```

### 3. Create Super Admin User

```bash
# Docker Compose
docker exec -it hr-suite-api-prod npm run seed:super

# Kubernetes
kubectl exec -it deployment/api -n hr-suite -- npm run seed:super
```

### 4. Configure S3/MinIO Buckets

If using MinIO:
- Access MinIO Console: http://localhost:9001
- Login with credentials from `.env`
- Create buckets: `hr-docs`, `hr-onboarding-docs`

If using AWS S3:
- Ensure buckets exist in AWS
- Verify IAM permissions

### 5. Set Up Monitoring (Recommended)

```bash
# Install Prometheus & Grafana (example)
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts
helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
```

---

## ✅ Verification Checklist

- [ ] All services are running
- [ ] Health checks are passing
- [ ] Database is accessible
- [ ] Redis is accessible
- [ ] Frontend loads correctly
- [ ] API responds to requests
- [ ] RAG service is working
- [ ] SSL/TLS is configured (production)
- [ ] Logs are accessible
- [ ] Backups are configured

---

## 🐛 Troubleshooting

### Services Not Starting

```bash
# Docker Compose
docker-compose -f docker/docker-compose.prod.yml logs [service-name]

# Kubernetes
kubectl describe pod [pod-name] -n hr-suite
kubectl logs [pod-name] -n hr-suite
```

### Database Connection Issues

1. Check database is running
2. Verify credentials in environment variables
3. Check network connectivity
4. Review database logs

### Port Conflicts

```bash
# Check what's using a port
netstat -tulpn | grep [port-number]

# Change port in docker-compose.yml or service.yaml
```

### Out of Memory

```bash
# Check resource usage
docker stats  # Docker Compose
kubectl top pods -n hr-suite  # Kubernetes

# Increase limits in deployment files
```

---

## 🔄 Updates & Rollbacks

### Update Application

**Docker Compose:**
```bash
docker-compose -f docker/docker-compose.prod.yml pull
docker-compose -f docker/docker-compose.prod.yml up -d
```

**Kubernetes:**
```bash
kubectl set image deployment/api api=new-image:tag -n hr-suite
kubectl rollout status deployment/api -n hr-suite
```

### Rollback

**Docker Compose:**
```bash
docker-compose -f docker/docker-compose.prod.yml down
docker-compose -f docker/docker-compose.prod.yml up -d --no-deps [service]
```

**Kubernetes:**
```bash
kubectl rollout undo deployment/api -n hr-suite
```

---

## 📞 Support

If you encounter issues:

1. Check logs first
2. Verify environment variables
3. Check resource limits
4. Review troubleshooting section
5. Check documentation files

---

**Last Updated**: January 2026

