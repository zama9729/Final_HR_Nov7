#!/bin/bash

# Kubernetes Deployment Script for HR Suite
# Usage: ./deploy-k8s.sh [namespace]

set -e

NAMESPACE=${1:-hr-suite}
K8S_DIR="../k8s"

echo "=========================================="
echo "HR Suite Kubernetes Deployment"
echo "Namespace: ${NAMESPACE}"
echo "=========================================="

# Check if kubectl is available
if ! command -v kubectl &> /dev/null; then
    echo "Error: kubectl is not installed or not in PATH"
    exit 1
fi

# Check if namespace exists, create if not
if ! kubectl get namespace ${NAMESPACE} &> /dev/null; then
    echo "Creating namespace: ${NAMESPACE}"
    kubectl create namespace ${NAMESPACE}
fi

# Apply namespace
echo ""
echo "Applying namespace..."
kubectl apply -f ${K8S_DIR}/namespace.yaml

# Apply ConfigMap
echo ""
echo "Applying ConfigMap..."
kubectl apply -f ${K8S_DIR}/configmap.yaml

# Check if secrets file exists
if [ -f "${K8S_DIR}/secrets.yaml" ]; then
    echo ""
    echo "Applying Secrets..."
    kubectl apply -f ${K8S_DIR}/secrets.yaml
else
    echo ""
    echo "Warning: secrets.yaml not found!"
    echo "Please create secrets.yaml from secrets.template.yaml and fill in values."
    echo "You can use: kubectl create secret generic hr-suite-secrets --from-env-file=secrets.env -n ${NAMESPACE}"
    exit 1
fi

# Apply database deployments
echo ""
echo "Applying PostgreSQL deployment..."
kubectl apply -f ${K8S_DIR}/postgres-deployment.yaml

echo ""
echo "Applying Redis deployment..."
kubectl apply -f ${K8S_DIR}/redis-deployment.yaml

# Wait for database to be ready
echo ""
echo "Waiting for database to be ready..."
kubectl wait --for=condition=ready pod -l app=postgres -n ${NAMESPACE} --timeout=300s

# Apply API deployment
echo ""
echo "Applying API deployment..."
kubectl apply -f ${K8S_DIR}/api-deployment.yaml

# Apply Frontend deployment
echo ""
echo "Applying Frontend deployment..."
kubectl apply -f ${K8S_DIR}/frontend-deployment.yaml

# Apply RAG Service deployments
echo ""
echo "Applying RAG Service deployments..."
kubectl apply -f ${K8S_DIR}/rag-service-deployment.yaml

# Wait for deployments to be ready
echo ""
echo "Waiting for deployments to be ready..."
kubectl wait --for=condition=available deployment/api -n ${NAMESPACE} --timeout=300s
kubectl wait --for=condition=available deployment/frontend -n ${NAMESPACE} --timeout=300s
kubectl wait --for=condition=available deployment/rag-api -n ${NAMESPACE} --timeout=300s

# Apply Ingress
echo ""
echo "Applying Ingress..."
kubectl apply -f ${K8S_DIR}/ingress.yaml

# Show status
echo ""
echo "=========================================="
echo "Deployment Status:"
echo "=========================================="
kubectl get all -n ${NAMESPACE}

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "To view logs: kubectl logs -f deployment/api -n ${NAMESPACE}"
echo "To check pods: kubectl get pods -n ${NAMESPACE}"
echo "To delete: kubectl delete namespace ${NAMESPACE}"
echo ""

