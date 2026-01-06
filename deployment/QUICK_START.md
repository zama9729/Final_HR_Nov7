# Quick Start - Production Deployment

Fastest way to get HR Suite running in production.

## ⚡ 5-Minute Docker Compose Setup

### 1. Copy Environment Template
```bash
cd deployment/env-templates
cp env.production.template .env.production
```

### 2. Edit Minimum Required Values

Open `.env.production` and set at minimum:

```bash
DB_PASSWORD=ChangeMe123!StrongPassword
JWT_SECRET=ChangeMeVeryLongRandomSecretKeyAtLeast32Characters
OPENAI_API_KEY=sk-your-openai-key
ADMIN_EMAILS=admin@yourdomain.com
FRONTEND_URL=https://yourdomain.com
VITE_API_URL=https://api.yourdomain.com
```

### 3. Deploy

**Linux/Mac:**
```bash
cd ../scripts
chmod +x deploy-docker.sh
./deploy-docker.sh production
```

**Windows:**
```powershell
cd ..\scripts
.\deploy-docker.ps1 -Environment production
```

### 4. Access

- Frontend: http://localhost:3000
- API: http://localhost:3001
- Health Check: http://localhost:3001/health

---

## ⚡ 10-Minute Kubernetes Setup

### 1. Create Secrets
```bash
cd deployment/k8s
cp secrets.template.yaml secrets.yaml
# Edit secrets.yaml with your values
```

### 2. Update ConfigMap
```bash
# Edit configmap.yaml with your domain names
```

### 3. Deploy
```bash
cd ../scripts
chmod +x deploy-k8s.sh
./deploy-k8s.sh hr-suite
```

### 4. Verify
```bash
kubectl get all -n hr-suite
```

---

## 🎯 What's Next?

1. **Configure SSL** - Set up HTTPS
2. **Set Up Backups** - Configure database backups
3. **Monitor** - Set up monitoring and alerting
4. **Scale** - Adjust replicas as needed

See `DEPLOY_STEPS.md` for detailed instructions.

