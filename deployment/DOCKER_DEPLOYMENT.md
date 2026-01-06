# Docker Compose Deployment Guide

Complete guide for deploying HR Suite using Docker Compose.

## Prerequisites

- Docker Engine 20.10 or later
- Docker Compose 2.0 or later
- At least 8GB RAM
- At least 20GB disk space

## Quick Start

### 1. Clone and Navigate

```bash
cd deployment/docker
```

### 2. Prepare Environment

```bash
cd ../env-templates
cp env.production.template .env.production
# Edit .env.production with your values
```

### 3. Deploy

```bash
cd ../scripts
chmod +x deploy-docker.sh
./deploy-docker.sh production
```

## Environment-Specific Deployment

### Development

```bash
./deploy-docker.sh dev
```

Features:
- Hot reload enabled
- Volume mounts for live code changes
- Debug logging
- Local MinIO storage

### Staging

```bash
./deploy-docker.sh staging
```

Features:
- Production-like configuration
- Separate database
- Staging domain configuration

### Production

```bash
./deploy-docker.sh production
```

Features:
- Optimized builds
- Resource limits
- Health checks
- Production logging

## Manual Deployment

### Build Images

```bash
docker-compose -f docker-compose.prod.yml build
```

### Start Services

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### View Logs

```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f api
```

### Stop Services

```bash
docker-compose -f docker-compose.prod.yml down
```

### Remove Volumes (⚠️ Deletes Data)

```bash
docker-compose -f docker-compose.prod.yml down -v
```

## Service Management

### Restart a Service

```bash
docker-compose -f docker-compose.prod.yml restart api
```

### Scale Services

```bash
# Scale API to 3 instances
docker-compose -f docker-compose.prod.yml up -d --scale api=3
```

### View Service Status

```bash
docker-compose -f docker-compose.prod.yml ps
```

## Health Checks

All services include health checks. Check status:

```bash
docker-compose -f docker-compose.prod.yml ps
```

Look for `(healthy)` status.

## Ports

Default ports (configurable via environment variables):

- **Frontend**: 3000
- **API**: 3001
- **PostgreSQL**: 5432
- **Redis**: 6379
- **RAG API**: 8001
- **ChromaDB**: 8000
- **MinIO**: 9000 (API), 9001 (Console)

## Volumes

Persistent volumes are created for:

- `postgres_data` - Database files
- `redis_data` - Redis persistence
- `rag_postgres_data` - RAG database
- `rag_redis_data` - RAG Redis
- `chroma_data` - ChromaDB vector store
- `rag_uploads` - RAG service uploads
- `minio_data` - MinIO storage (if enabled)

## Backup & Restore

### Backup Database

```bash
docker exec hr-suite-postgres-prod pg_dump -U postgres hr_suite > backup.sql
```

### Restore Database

```bash
docker exec -i hr-suite-postgres-prod psql -U postgres hr_suite < backup.sql
```

## Troubleshooting

### Services Won't Start

1. Check logs: `docker-compose logs [service-name]`
2. Verify environment variables
3. Check port conflicts: `netstat -tulpn | grep [port]`
4. Verify disk space: `df -h`

### Database Connection Issues

1. Wait for database to be healthy
2. Check credentials in `.env` file
3. Verify network: `docker network ls`

### Out of Memory

1. Increase Docker memory limit
2. Reduce service replicas
3. Adjust resource limits in compose file

## Production Checklist

- [ ] Strong passwords set in `.env`
- [ ] SSL/TLS configured (via reverse proxy)
- [ ] Backups configured
- [ ] Monitoring set up
- [ ] Log aggregation configured
- [ ] Resource limits set
- [ ] Health checks verified
- [ ] Security scanning completed

## Next Steps

- Set up reverse proxy (nginx/traefik)
- Configure SSL certificates
- Set up monitoring (Prometheus/Grafana)
- Configure log aggregation
- Set up automated backups

