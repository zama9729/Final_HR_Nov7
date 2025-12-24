# Kubernetes Deployment Guide for HR Suite

This directory contains Kubernetes manifests for deploying the HR Suite application to a Kubernetes cluster.

## Architecture Overview

The HR Suite consists of the following components:

- **Frontend**: React/Vite application served via Nginx
- **API**: Node.js Express backend server
- **Payroll Frontend**: Separate React/Vite application for payroll
- **Payroll API**: Node.js TypeScript backend for payroll
- **RAG Service**: Python FastAPI service for AI/document processing
- **PostgreSQL**: Primary database
- **Redis**: Caching layer for main application
- **Payroll Redis**: Separate Redis instance for payroll
- **MinIO**: S3-compatible object storage

## Prerequisites

1. A Kubernetes cluster (v1.24+)
2. `kubectl` configured to access your cluster
3. Docker images built and pushed to a container registry
4. Storage class configured in your cluster (for PersistentVolumes)
5. Ingress controller installed (e.g., NGINX Ingress Controller)

## Quick Start

### 1. Build and Push Docker Images

First, build and push your Docker images to a container registry:

```bash
# Build images
docker build -t your-registry/hr-suite-frontend:latest -f Dockerfile .
docker build -t your-registry/hr-suite-api:latest -f Dockerfile.api ./server
docker build -t your-registry/hr-suite-payroll-frontend:latest -f Dockerfile ./payroll-app
docker build -t your-registry/hr-suite-payroll-api:latest -f Dockerfile ./payroll-app/server
docker build -t your-registry/hr-suite-rag-service:latest -f Dockerfile ./rag-service

# Push images
docker push your-registry/hr-suite-frontend:latest
docker push your-registry/hr-suite-api:latest
docker push your-registry/hr-suite-payroll-frontend:latest
docker push your-registry/hr-suite-payroll-api:latest
docker push your-registry/hr-suite-rag-service:latest
```

### 2. Update Image References

Update the image names in the deployment files:
- `k8s/api-deployment.yaml`
- `k8s/payroll-api-deployment.yaml`
- `k8s/frontend-deployment.yaml`
- `k8s/payroll-frontend-deployment.yaml`
- `k8s/rag-service-deployment.yaml`

Replace `hr-suite-*:latest` with your actual image registry paths.

### 3. Configure Secrets

**IMPORTANT**: Update all secrets in `k8s/secrets.yaml` before deploying:

```bash
# Generate secure passwords
openssl rand -base64 32  # For database passwords
openssl rand -base64 32  # For JWT secrets

# Generate RSA key pair for SSO
openssl genrsa -out private.pem 2048
openssl rsa -in private.pem -pubout -out public.pem
```

Update `k8s/secrets.yaml` with:
- Strong database passwords
- JWT secrets
- RSA keys for SSO
- OpenAI API keys (if using)
- MinIO credentials

### 4. Update Configuration

1. **Storage Classes**: Update `storageClassName` in all PVC files to match your cluster's storage class
2. **Ingress**: Update domain names in `k8s/ingress.yaml`
3. **ConfigMaps**: Review and adjust configuration values in `k8s/configmaps.yaml`

### 5. Deploy to Kubernetes

Deploy in the following order:

```bash
# 1. Create namespace
kubectl apply -f k8s/namespace.yaml

# 2. Create ConfigMaps
kubectl apply -f k8s/configmaps.yaml

# 3. Create Secrets (update first!)
kubectl apply -f k8s/secrets.yaml

# 4. Deploy infrastructure (database, cache, storage)
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/redis-deployment.yaml
kubectl apply -f k8s/minio-deployment.yaml

# 5. Wait for infrastructure to be ready
kubectl wait --for=condition=ready pod -l app=postgres -n hr-suite --timeout=300s
kubectl wait --for=condition=ready pod -l app=redis -n hr-suite --timeout=300s
kubectl wait --for=condition=ready pod -l app=minio -n hr-suite --timeout=300s

# 6. Deploy application services
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/payroll-api-deployment.yaml
kubectl apply -f k8s/rag-service-deployment.yaml

# 7. Deploy frontend services
kubectl apply -f k8s/frontend-deployment.yaml

# 8. Create services
kubectl apply -f k8s/services.yaml

# 9. Deploy ingress (after DNS is configured)
kubectl apply -f k8s/ingress.yaml
```

### 6. Initialize Database

If you have database initialization scripts, create a ConfigMap:

```bash
kubectl create configmap postgres-init-scripts \
  --from-file=./server/db/full-schema.sql \
  -n hr-suite
```

Then update `k8s/postgres-deployment.yaml` to reference this ConfigMap (already configured as optional).

### 7. Initialize MinIO Bucket

After MinIO is running, initialize the bucket:

```bash
# Port-forward to MinIO console
kubectl port-forward -n hr-suite svc/minio-service 9001:9001

# Access http://localhost:9001 and create the 'hr-docs' bucket
# Or use the MinIO client (mc)
```

## Verification

Check the status of all pods:

```bash
kubectl get pods -n hr-suite
```

Check services:

```bash
kubectl get svc -n hr-suite
```

View logs:

```bash
kubectl logs -f deployment/api -n hr-suite
kubectl logs -f deployment/payroll-api -n hr-suite
```

## Scaling

Scale deployments as needed:

```bash
kubectl scale deployment api --replicas=3 -n hr-suite
kubectl scale deployment payroll-api --replicas=3 -n hr-suite
kubectl scale deployment frontend --replicas=3 -n hr-suite
```

## Updating

To update the application:

1. Build and push new images with version tags
2. Update image references in deployment files
3. Apply the updated deployments:

```bash
kubectl apply -f k8s/api-deployment.yaml
kubectl rollout status deployment/api -n hr-suite
```

## Troubleshooting

### Pods not starting

```bash
# Check pod status
kubectl describe pod <pod-name> -n hr-suite

# Check logs
kubectl logs <pod-name> -n hr-suite
```

### Database connection issues

```bash
# Test database connectivity
kubectl run -it --rm debug --image=postgres:15-alpine --restart=Never -n hr-suite -- \
  psql -h postgres-service -U postgres -d hr_suite
```

### Service discovery issues

```bash
# Check service endpoints
kubectl get endpoints -n hr-suite

# Test service connectivity
kubectl run -it --rm debug --image=curlimages/curl --restart=Never -n hr-suite -- \
  curl http://api-service:3001/health
```

## Security Considerations

1. **Secrets Management**: Consider using a secrets management system (e.g., HashiCorp Vault, Sealed Secrets) instead of plain YAML files
2. **Network Policies**: Implement network policies to restrict pod-to-pod communication
3. **RBAC**: Create appropriate Role and RoleBinding resources for service accounts
4. **TLS**: Ensure TLS is properly configured for ingress
5. **Image Security**: Scan images for vulnerabilities before deployment
6. **Resource Limits**: Adjust resource requests/limits based on your workload

## Backup and Recovery

### Database Backup

```bash
# Create a backup
kubectl exec -it deployment/postgres -n hr-suite -- \
  pg_dump -U postgres hr_suite > backup.sql

# Restore from backup
kubectl exec -i deployment/postgres -n hr-suite -- \
  psql -U postgres hr_suite < backup.sql
```

### Persistent Volume Backups

Ensure your storage provider supports snapshots, or use a backup tool like Velero.

## Monitoring

Consider adding:
- Prometheus for metrics collection
- Grafana for visualization
- ELK stack or Loki for log aggregation
- AlertManager for alerting

## Cleanup

To remove all resources:

```bash
kubectl delete namespace hr-suite
```

**Warning**: This will delete all data in persistent volumes. Ensure you have backups!

## Additional Resources

- [Kubernetes Documentation](https://kubernetes.io/docs/)
- [NGINX Ingress Controller](https://kubernetes.github.io/ingress-nginx/)
- [cert-manager](https://cert-manager.io/) (for automatic TLS certificates)











