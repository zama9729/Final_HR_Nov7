# HR Suite Deployment Guide

This directory contains all deployment configurations and scripts for the HR Suite application.

## 📁 Directory Structure

```
deployment/
├── docker/              # Docker Compose configurations
│   ├── docker-compose.dev.yml
│   ├── docker-compose.staging.yml
│   ├── docker-compose.prod.yml
│   ├── Dockerfile.frontend.prod
│   ├── Dockerfile.api.prod
│   └── Dockerfile.rag.prod
├── k8s/                 # Kubernetes manifests
│   ├── namespace.yaml
│   ├── configmap.yaml
│   ├── secrets.template.yaml
│   ├── postgres-deployment.yaml
│   ├── redis-deployment.yaml
│   ├── api-deployment.yaml
│   ├── frontend-deployment.yaml
│   ├── rag-service-deployment.yaml
│   ├── ingress.yaml
│   └── kustomization.yaml
├── scripts/             # Deployment scripts
│   ├── deploy-docker.sh
│   ├── deploy-docker.ps1
│   ├── deploy-k8s.sh
│   └── deploy-k8s.ps1
├── env-templates/       # Environment variable templates
│   ├── env.production.template
│   ├── env.staging.template
│   └── env.development.template
└── cicd/                # CI/CD configurations
    └── .github/workflows/
        ├── docker-build.yml
        └── k8s-deploy.yml
```

## 🚀 Quick Start

### Docker Compose Deployment

#### Prerequisites
- Docker Engine 20.10+
- Docker Compose 2.0+

#### Steps

1. **Prepare Environment Variables**
   ```bash
   cd deployment/env-templates
   cp env.production.template .env.production
   # Edit .env.production with your actual values
   ```

2. **Deploy**
   ```bash
   cd deployment/scripts
   chmod +x deploy-docker.sh
   ./deploy-docker.sh production
   ```

   Or on Windows:
   ```powershell
   cd deployment/scripts
   .\deploy-docker.ps1 -Environment production
   ```

3. **Verify**
   ```bash
   docker-compose -f ../docker/docker-compose.prod.yml ps
   docker-compose -f ../docker/docker-compose.prod.yml logs -f
   ```

### Kubernetes Deployment

#### Prerequisites
- Kubernetes cluster (1.24+)
- kubectl configured
- StorageClass for PersistentVolumes
- Ingress controller (nginx-ingress recommended)

#### Steps

1. **Prepare Secrets**
   ```bash
   cd deployment/k8s
   cp secrets.template.yaml secrets.yaml
   # Edit secrets.yaml with your actual values
   ```

2. **Deploy**
   ```bash
   cd deployment/scripts
   chmod +x deploy-k8s.sh
   ./deploy-k8s.sh hr-suite
   ```

   Or on Windows:
   ```powershell
   cd deployment/scripts
   .\deploy-k8s.ps1 -Namespace hr-suite
   ```

3. **Verify**
   ```bash
   kubectl get all -n hr-suite
   kubectl logs -f deployment/api -n hr-suite
   ```

## 📋 Environment Configurations

### Development
- Hot reload enabled
- Debug logging
- Local MinIO for storage
- No SSL/TLS

### Staging
- Production-like setup
- Separate database
- Staging domain
- SSL/TLS enabled

### Production
- Optimized builds
- Resource limits
- Health checks
- Logging configured
- SSL/TLS required

## 🔧 Configuration

### Environment Variables

Key variables to configure:

- **Database**: `DB_HOST`, `DB_PASSWORD`, `DB_NAME`
- **Redis**: `REDIS_HOST`, `REDIS_PASSWORD`
- **JWT**: `JWT_SECRET`, `PAYROLL_JWT_SECRET`
- **S3 Storage**: `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `DOCS_STORAGE_BUCKET`
- **OpenAI**: `OPENAI_API_KEY`
- **RAG Service**: `RAG_DB_PASSWORD`, `RAG_REDIS_PASSWORD`

See `env-templates/` for complete lists.

### Docker Compose

Edit the appropriate `docker-compose.*.yml` file for your environment.

### Kubernetes

1. Update `configmap.yaml` with your configuration
2. Update `secrets.yaml` with your secrets
3. Update `ingress.yaml` with your domain names
4. Update image references in deployment files

## 🔐 Security Best Practices

1. **Never commit secrets** - Use environment variables or Kubernetes secrets
2. **Use strong passwords** - Generate random passwords for all services
3. **Enable SSL/TLS** - Always use HTTPS in production
4. **Limit resource access** - Use RBAC in Kubernetes
5. **Regular updates** - Keep images and dependencies updated
6. **Monitor logs** - Set up log aggregation and monitoring

## 📊 Monitoring & Health Checks

### Health Endpoints
- API: `http://api-service/health`
- RAG API: `http://rag-api-service/health`
- Frontend: `http://frontend-service/`

### Logs

**Docker Compose:**
```bash
docker-compose -f docker-compose.prod.yml logs -f [service-name]
```

**Kubernetes:**
```bash
kubectl logs -f deployment/api -n hr-suite
kubectl logs -f deployment/rag-api -n hr-suite
```

## 🔄 Updates & Rollbacks

### Docker Compose
```bash
# Update
docker-compose -f docker-compose.prod.yml pull
docker-compose -f docker-compose.prod.yml up -d

# Rollback
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --no-deps [service-name]
```

### Kubernetes
```bash
# Update
kubectl set image deployment/api api=hr-suite-api:v2.0.0 -n hr-suite
kubectl rollout status deployment/api -n hr-suite

# Rollback
kubectl rollout undo deployment/api -n hr-suite
```

## 🐛 Troubleshooting

### Common Issues

1. **Database connection errors**
   - Check database credentials
   - Verify network connectivity
   - Check database health

2. **Image pull errors**
   - Verify image registry credentials
   - Check image tags
   - Ensure registry is accessible

3. **Pod crashes**
   - Check logs: `kubectl logs [pod-name] -n hr-suite`
   - Check events: `kubectl describe pod [pod-name] -n hr-suite`
   - Verify resource limits

4. **Storage issues**
   - Check PersistentVolumeClaims: `kubectl get pvc -n hr-suite`
   - Verify StorageClass exists
   - Check disk space

## 📚 Additional Resources

- [Docker Documentation](https://docs.docker.com/)
- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)

## 🆘 Support

For deployment issues:
1. Check logs first
2. Review configuration files
3. Verify prerequisites
4. Consult troubleshooting section

---

**Last Updated**: January 2026

