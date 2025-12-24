#!/bin/bash

# HR Suite Kubernetes Deployment Script
# This script deploys all components of the HR Suite to Kubernetes

set -e

NAMESPACE="hr-suite"

echo "🚀 Starting HR Suite Kubernetes Deployment"
echo "=========================================="

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "❌ kubectl is not installed or not in PATH"
    exit 1
fi

# Check if cluster is accessible
if ! kubectl cluster-info &> /dev/null; then
    echo "❌ Cannot connect to Kubernetes cluster"
    exit 1
fi

echo "✅ Kubernetes cluster is accessible"

# Step 1: Create namespace
echo ""
echo "📦 Step 1: Creating namespace..."
kubectl apply -f namespace.yaml

# Step 2: Create ConfigMaps
echo ""
echo "⚙️  Step 2: Creating ConfigMaps..."
kubectl apply -f configmaps.yaml

# Step 3: Check if secrets.yaml exists
echo ""
if [ ! -f "secrets.yaml" ]; then
    echo "⚠️  WARNING: secrets.yaml not found!"
    echo "   Please copy secrets-template.yaml to secrets.yaml and update with your values"
    echo "   Then run this script again."
    exit 1
fi

echo "🔐 Step 3: Creating Secrets..."
kubectl apply -f secrets.yaml

# Step 4: Deploy infrastructure
echo ""
echo "🏗️  Step 4: Deploying infrastructure services..."
kubectl apply -f postgres-deployment.yaml
kubectl apply -f redis-deployment.yaml
kubectl apply -f minio-deployment.yaml

echo ""
echo "⏳ Waiting for infrastructure services to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres -n $NAMESPACE --timeout=300s || true
kubectl wait --for=condition=ready pod -l app=redis -n $NAMESPACE --timeout=300s || true
kubectl wait --for=condition=ready pod -l app=minio -n $NAMESPACE --timeout=300s || true

# Step 5: Deploy application services
echo ""
echo "🚀 Step 5: Deploying application services..."
kubectl apply -f api-deployment.yaml
kubectl apply -f payroll-api-deployment.yaml
kubectl apply -f rag-service-deployment.yaml

# Step 6: Deploy frontend services
echo ""
echo "🎨 Step 6: Deploying frontend services..."
kubectl apply -f frontend-deployment.yaml

# Step 7: Create services
echo ""
echo "🔌 Step 7: Creating services..."
kubectl apply -f services.yaml

# Step 8: Deploy ingress (optional)
echo ""
read -p "Deploy Ingress? (y/n) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "🌐 Step 8: Deploying Ingress..."
    kubectl apply -f ingress.yaml
else
    echo "⏭️  Skipping Ingress deployment"
fi

# Summary
echo ""
echo "✅ Deployment complete!"
echo ""
echo "📊 Current status:"
kubectl get pods -n $NAMESPACE
echo ""
echo "🔍 To check logs:"
echo "   kubectl logs -f deployment/api -n $NAMESPACE"
echo "   kubectl logs -f deployment/payroll-api -n $NAMESPACE"
echo ""
echo "📖 For more information, see README.md"











