# Quick Start Guide

Get the RAG service running in 5 minutes.

## Prerequisites

- Docker & Docker Compose installed
- OpenAI API key (or compatible service)

## Steps

### 1. Configure Environment

```bash
cd rag-service
cp .env.example .env
```

Edit `.env` and set:
```bash
OPENAI_API_KEY=your-actual-api-key-here
```

### 2. Start All Services

```bash
docker-compose up -d
```

Wait for all services to be healthy (about 30 seconds).

### 3. Initialize Database

```bash
# Run migrations
docker-compose exec rag-api alembic upgrade head

# Seed sample data
docker-compose exec rag-api python scripts/seed_data.py
```

The seed script will output sample JWT tokens. **Copy the employee token** for testing.

### 4. Test the API

```bash
# Replace YOUR_JWT_TOKEN with token from seed script
export JWT_TOKEN="your-jwt-token-here"

# Health check
curl http://localhost:8001/health

# Query example
curl -X POST http://localhost:8001/api/v1/query \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is my leave balance?",
    "use_tools": true
  }'
```

### 5. Ingest a Document

```bash
# Ingest sample policy
curl -X POST http://localhost:8001/api/v1/ingest \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -F "file=@sample_data/sample_policy.txt" \
  -F "is_confidential=false"
```

Wait a few seconds for Celery to process, then query about the policy:

```bash
curl -X POST http://localhost:8001/api/v1/query \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "What is the leave policy?",
    "use_tools": true
  }'
```

## Example Requests

### Query with Tool Call

```bash
curl -X POST http://localhost:8001/api/v1/query \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "Create a leave request from 2024-02-01 to 2024-02-05 for vacation",
    "use_tools": true
  }'
```

### Get Audit Logs

```bash
curl -X GET "http://localhost:8001/api/v1/audit?limit=10" \
  -H "Authorization: Bearer $JWT_TOKEN"
```

### Direct Tool Call

```bash
curl -X POST http://localhost:8001/api/v1/tool_call \
  -H "Authorization: Bearer $JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "tool_name": "get_leave_balance",
    "arguments": {
      "employee_id": "your-employee-id"
    }
  }'
```

## Troubleshooting

### Services Not Starting

```bash
# Check logs
docker-compose logs rag-api
docker-compose logs celery-worker

# Restart services
docker-compose restart
```

### Database Connection Error

```bash
# Check Postgres is running
docker-compose ps postgres

# Test connection
docker-compose exec postgres psql -U rag_user -d rag_db -c "SELECT 1;"
```

### Chroma Not Responding

```bash
# Check Chroma health
curl http://localhost:8000/api/v1/heartbeat

# Restart Chroma
docker-compose restart chroma
```

### Embedding Generation Fails

- Verify `OPENAI_API_KEY` is set correctly
- Check API quota/rate limits
- Review Celery worker logs: `docker-compose logs celery-worker`

## Next Steps

- Read [README.md](README.md) for full documentation
- Review [runbook.md](runbook.md) for operational procedures
- Check [tests/](tests/) for example usage

## Production Deployment

Before deploying to production:

1. Change `JWT_SECRET` to strong random value
2. Configure TLS/HTTPS
3. Set up proper database backups
4. Enable monitoring and alerts
5. Review security settings in `.env`

See [README.md](README.md) for production checklist.

