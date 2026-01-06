#!/bin/bash

# Docker Deployment Script for HR Suite
# Usage: ./deploy-docker.sh [dev|staging|production]

set -e

ENVIRONMENT=${1:-production}
COMPOSE_FILE="docker-compose.${ENVIRONMENT}.yml"

echo "=========================================="
echo "HR Suite Docker Deployment"
echo "Environment: ${ENVIRONMENT}"
echo "=========================================="

# Check if docker-compose file exists
if [ ! -f "${COMPOSE_FILE}" ]; then
    echo "Error: ${COMPOSE_FILE} not found!"
    exit 1
fi

# Check if .env file exists
ENV_FILE="../env-templates/env.${ENVIRONMENT}.template"
if [ ! -f "${ENV_FILE}" ]; then
    echo "Warning: ${ENV_FILE} not found. Using defaults."
else
    echo "Using environment file: ${ENV_FILE}"
fi

# Build images
echo ""
echo "Building Docker images..."
docker-compose -f ${COMPOSE_FILE} build --no-cache

# Stop existing containers
echo ""
echo "Stopping existing containers..."
docker-compose -f ${COMPOSE_FILE} down

# Start services
echo ""
echo "Starting services..."
docker-compose -f ${COMPOSE_FILE} up -d

# Wait for services to be healthy
echo ""
echo "Waiting for services to be healthy..."
sleep 10

# Check service status
echo ""
echo "Service Status:"
docker-compose -f ${COMPOSE_FILE} ps

# Show logs
echo ""
echo "Recent logs (last 20 lines):"
docker-compose -f ${COMPOSE_FILE} logs --tail=20

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "To view logs: docker-compose -f ${COMPOSE_FILE} logs -f"
echo "To stop: docker-compose -f ${COMPOSE_FILE} down"
echo ""

