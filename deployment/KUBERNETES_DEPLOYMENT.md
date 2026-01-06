# Kubernetes Deployment Guide

Complete guide for deploying HR Suite on Kubernetes.

## Prerequisites

- Kubernetes cluster (1.24+)
- kubectl configured and connected
- StorageClass for PersistentVolumes
- Ingress controller (nginx-ingress recommended)
- Container registry access (for pulling images)

## Quick Start

### 1. Prepare Secrets

```bash
cd deployment/k8s
cp secrets.template.yaml secrets.yaml
# Edit secrets.yaml with your actual values
```

### 2. Update Configuration

Edit `configmap.yaml` and `ingress.yaml` with your domain names and settings.

### 3. Deploy

```bash
cd ../scripts
chmod +x deploy-k8s.sh
./deploy-k8s.sh hr-suite
```

## Manual Deployment Steps

### 1. Create Namespace

```bash
kubectl apply -f k8s/namespace.yaml
```

### 2. Create ConfigMap

```bash
kubectl apply -f k8s/configmap.yaml
```

### 3. Create Secrets

```bash
kubectl apply -f k8s/secrets.yaml
```

Or create from environment file:

```bash
kubectl create secret generic hr-suite-secrets \
  --from-env-file=secrets.env \
  -n hr-suite
```

### 4. Deploy Database

```bash
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/redis-deployment.yaml
```

Wait for databases to be ready:

```bash
kubectl wait --for=condition=ready pod -l app=postgres -n hr-suite --timeout=300s
```

### 5. Deploy Applications

```bash
kubectl apply -f k8s/api-deployment.yaml
kubectl apply -f k8s/frontend-deployment.yaml
kubectl apply -f k8s/rag-service-deployment.yaml
```

### 6. Deploy Ingress

```bash
kubectl apply -f k8s/ingress.yaml
```

## Using Kustomize

```bash
kubectl apply -k k8s/
```

## Verification

### Check Pods

```bash
kubectl get pods -n hr-suite
```

All pods should be in `Running` state.

### Check Services

```bash
kubectl get svc -n hr-suite
```

### Check Deployments

```bash
kubectl get deployments -n hr-suite
```

### View Logs

```bash
# API logs
kubectl logs -f deployment/api -n hr-suite

# Frontend logs
kubectl logs -f deployment/frontend -n hr-suite

# RAG API logs
kubectl logs -f deployment/rag-api -n hr-suite
```

## Scaling

### Scale API

```bash
kubectl scale deployment/api --replicas=3 -n hr-suite
```

### Scale Frontend

```bash
kubectl scale deployment/frontend --replicas=2 -n hr-suite
```

### Scale RAG Service

```bash
kubectl scale deployment/rag-api --replicas=2 -n hr-suite
kubectl scale deployment/rag-celery-worker --replicas=3 -n hr-suite
```

## Updates & Rollouts

### Update Image

```bash
kubectl set image deployment/api api=hr-suite-api:v2.0.0 -n hr-suite
kubectl rollout status deployment/api -n hr-suite
```

### Rollback

```bash
kubectl rollout undo deployment/api -n hr-suite
```

### View Rollout History

```bash
kubectl rollout history deployment/api -n hr-suite
```

## Resource Management

### View Resource Usage

```bash
kubectl top pods -n hr-suite
kubectl top nodes
```

### Adjust Resources

Edit deployment files and apply:

```bash
kubectl apply -f k8s/api-deployment.yaml
```

## Persistent Volumes

### Check PVCs

```bash
kubectl get pvc -n hr-suite
```

### Backup Volume

```bash
# Create backup pod
kubectl run backup-pod --image=postgres:15-alpine --rm -it --restart=Never \
  --overrides='{"spec":{"containers":[{"name":"backup-pod","image":"postgres:15-alpine","command":["sh","-c","sleep 3600"],"volumeMounts":[{"name":"postgres-storage","mountPath":"/backup"}]}],"volumes":[{"name":"postgres-storage","persistentVolumeClaim":{"claimName":"postgres-pvc"}}]}}' \
  -n hr-suite
```

## Troubleshooting

### Pod Not Starting

```bash
# Describe pod
kubectl describe pod [pod-name] -n hr-suite

# Check events
kubectl get events -n hr-suite --sort-by='.lastTimestamp'

# Check logs
kubectl logs [pod-name] -n hr-suite
```

### Image Pull Errors

```bash
# Check image pull secrets
kubectl get secrets -n hr-suite

# Create image pull secret
kubectl create secret docker-registry regcred \
  --docker-server=your-registry.com \
  --docker-username=your-username \
  --docker-password=your-password \
  -n hr-suite
```

### Storage Issues

```bash
# Check PVC status
kubectl get pvc -n hr-suite

# Describe PVC
kubectl describe pvc [pvc-name] -n hr-suite

# Check StorageClass
kubectl get storageclass
```

### Network Issues

```bash
# Check services
kubectl get svc -n hr-suite

# Test connectivity
kubectl run test-pod --image=busybox --rm -it --restart=Never \
  -- wget -O- http://api-service:80/health
```

## Production Checklist

- [ ] Secrets properly configured
- [ ] Resource limits set appropriately
- [ ] Health checks configured
- [ ] Ingress with SSL/TLS configured
- [ ] Monitoring and alerting set up
- [ ] Backup strategy in place
- [ ] Network policies configured
- [ ] RBAC configured
- [ ] Image pull secrets configured
- [ ] Log aggregation configured

## Security Best Practices

1. **Use Secrets** - Never hardcode credentials
2. **RBAC** - Limit service account permissions
3. **Network Policies** - Restrict pod-to-pod communication
4. **Pod Security Standards** - Use restricted pod security
5. **Image Scanning** - Scan images for vulnerabilities
6. **Regular Updates** - Keep Kubernetes and images updated

## Monitoring

### Install Prometheus & Grafana

```bash
# Add Helm repo
helm repo add prometheus-community https://prometheus-community.github.io/helm-charts

# Install Prometheus
helm install prometheus prometheus-community/kube-prometheus-stack -n monitoring --create-namespace
```

### View Metrics

```bash
# Port forward Grafana
kubectl port-forward svc/prometheus-grafana 3000:80 -n monitoring
```

## Cleanup

### Delete Everything

```bash
kubectl delete namespace hr-suite
```

### Delete Specific Resources

```bash
kubectl delete -f k8s/api-deployment.yaml
```

## Next Steps

- Set up CI/CD pipeline
- Configure monitoring and alerting
- Set up backup automation
- Configure autoscaling
- Set up log aggregation
- Configure network policies

