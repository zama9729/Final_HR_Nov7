# RAG Service Runbook

Operational procedures for the HR RAG Service.

## Tenant Onboarding

### 1. Create Tenant

```sql
INSERT INTO tenants (id, name, domain, is_active, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    'New Company Inc',
    'newcompany.com',
    true,
    now(),
    now()
);
```

### 2. Create Admin User

```sql
INSERT INTO employees (id, tenant_id, employee_id, email, first_name, last_name, role, is_active, created_at, updated_at)
VALUES (
    gen_random_uuid(),
    '<tenant_id>',
    'ADMIN001',
    'admin@newcompany.com',
    'Admin',
    'User',
    'ceo',
    true,
    now(),
    now()
);
```

### 3. Generate JWT Token

```python
from app.auth import create_access_token
token = create_access_token({
    "sub": "<employee_id>",
    "tenant_id": "<tenant_id>",
    "email": "admin@newcompany.com",
    "role": "ceo"
})
```

### 4. Ingest Initial Documents

```bash
curl -X POST http://localhost:8001/api/v1/ingest \
  -H "Authorization: Bearer <token>" \
  -F "file=@employee-handbook.pdf" \
  -F "is_confidential=false"
```

## Incident Response

### Data Leak Suspected

1. **Immediate Actions:**
   ```bash
   # Disable tenant access
   UPDATE tenants SET is_active = false WHERE id = '<tenant_id>';
   
   # Review audit logs
   SELECT * FROM audit_logs 
   WHERE tenant_id = '<tenant_id>' 
   ORDER BY created_at DESC 
   LIMIT 100;
   ```

2. **Investigation:**
   - Check audit logs for suspicious queries
   - Review document access patterns
   - Check for unauthorized tool calls

3. **Containment:**
   - Revoke affected JWT tokens
   - Disable vector store access for tenant
   - Export audit logs for forensic analysis

4. **Recovery:**
   - Re-enable tenant after investigation
   - Rotate JWT secrets if compromised
   - Update access controls if needed

### Hallucination Detected

1. **Identify Issue:**
   - Check confidence scores in audit logs
   - Review user reports

2. **Mitigation:**
   - Increase `MIN_CONFIDENCE_THRESHOLD` in config
   - Review and improve prompt templates
   - Add more relevant documents to knowledge base

3. **Prevention:**
   - Monitor confidence scores
   - Set up alerts for low confidence responses
   - Regular review of retrieved documents

### Service Outage

1. **Check Service Status:**
   ```bash
   # API health
   curl http://localhost:8001/health
   
   # Database
   docker-compose exec postgres pg_isready
   
   # Redis
   docker-compose exec redis redis-cli ping
   
   # Chroma
   curl http://localhost:8000/api/v1/heartbeat
   ```

2. **Restart Services:**
   ```bash
   docker-compose restart rag-api
   docker-compose restart celery-worker
   ```

3. **Check Logs:**
   ```bash
   docker-compose logs rag-api --tail=100
   docker-compose logs celery-worker --tail=100
   ```

## Data Deletion/Erasure

### Delete Tenant Data

1. **Delete Vector Store Data:**
   ```python
   from app.vector_store import get_vector_store
   vs = get_vector_store()
   # Delete all chunks for tenant
   chunks = db.query(DocumentChunk).filter(
       DocumentChunk.tenant_id == tenant_id
   vs.delete(tenant_id, [str(c.id) for c in chunks])
   ```

2. **Delete Database Records:**
   ```sql
   -- Delete in order (respecting foreign keys)
   DELETE FROM audit_logs WHERE tenant_id = '<tenant_id>';
   DELETE FROM paystubs WHERE tenant_id = '<tenant_id>';
   DELETE FROM leave_requests WHERE tenant_id = '<tenant_id>';
   DELETE FROM document_chunks WHERE tenant_id = '<tenant_id>';
   DELETE FROM documents WHERE tenant_id = '<tenant_id>';
   DELETE FROM employees WHERE tenant_id = '<tenant_id>';
   DELETE FROM tenants WHERE id = '<tenant_id>';
   ```

3. **Verify Deletion:**
   ```sql
   SELECT COUNT(*) FROM audit_logs WHERE tenant_id = '<tenant_id>';
   -- Should return 0
   ```

### GDPR Right to Erasure

1. Identify all data for user:
   ```sql
   SELECT * FROM employees WHERE email = '<user_email>';
   SELECT * FROM audit_logs WHERE user_id = '<user_id>';
   ```

2. Anonymize or delete:
   - Update employee record (anonymize email, name)
   - Delete or anonymize audit logs
   - Remove from vector store

3. Document erasure:
   ```sql
   INSERT INTO data_deletion_log (user_id, deleted_at, reason)
   VALUES ('<user_id>', now(), 'GDPR erasure request');
   ```

## Model Prompt Updates

### Canary Deployment

1. **Create New Prompt Version:**
   ```python
   # In app/rag_service.py
   PROMPT_V2 = """New prompt template..."""
   ```

2. **Deploy to Canary:**
   - Set `PROMPT_VERSION=v2` for canary instance
   - Route 10% of traffic to canary

3. **Monitor:**
   - Compare confidence scores
   - Review user feedback
   - Check error rates

4. **Rollout:**
   - If successful, increase canary traffic to 50%, then 100%
   - If issues, rollback immediately

### A/B Testing

1. **Track Prompt Version:**
   ```sql
   SELECT prompt_version, AVG(confidence_score), COUNT(*)
   FROM audit_logs
   WHERE created_at > now() - interval '1 day'
   GROUP BY prompt_version;
   ```

2. **Compare Metrics:**
   - Average confidence score
   - User satisfaction (if tracked)
   - Error rates

## Monitoring & Alerts

### Key Metrics

- **Query Latency**: P50, P95, P99
- **Confidence Scores**: Average, distribution
- **Error Rate**: 4xx, 5xx responses
- **Tool Call Success Rate**
- **Ingestion Queue Depth**

### Alert Thresholds

- Query latency > 5s (P95)
- Confidence score < 0.5 (average)
- Error rate > 5%
- Ingestion queue depth > 100

### Prometheus Queries

```promql
# Query latency
histogram_quantile(0.95, rag_query_latency_seconds_bucket)

# Error rate
rate(rag_http_errors_total[5m]) / rate(rag_http_requests_total[5m])

# Confidence scores
avg(rag_confidence_score)
```

## Backup & Recovery

### Database Backup

```bash
# Daily backup
docker-compose exec postgres pg_dump -U rag_user rag_db > backup_$(date +%Y%m%d).sql

# Restore
docker-compose exec -T postgres psql -U rag_user rag_db < backup_20240101.sql
```

### Vector Store Backup

Chroma persists to disk (`chroma_data` volume). Backup volume:
```bash
docker run --rm -v rag-service_chroma_data:/data -v $(pwd):/backup \
  alpine tar czf /backup/chroma_backup.tar.gz /data
```

### Recovery Procedure

1. Restore database from backup
2. Restore Chroma volume
3. Verify data integrity
4. Test queries

## Performance Tuning

### Optimize Chunking

- Increase `CHUNK_SIZE` for longer context (but may reduce precision)
- Adjust `CHUNK_OVERLAP` for better context continuity

### Vector Store Optimization

- Use FAISS for faster queries (if acceptable accuracy trade-off)
- Implement vector store sharding for large tenants

### Caching Strategy

- Increase `CACHE_TTL_SECONDS` for stable queries
- Cache embeddings for repeated documents

## Security Hardening

### JWT Secret Rotation

1. Generate new secret
2. Update `.env` with new `JWT_SECRET`
3. Restart services
4. Issue new tokens to users (old tokens will be invalid)

### Encryption at Rest

1. Configure database encryption
2. Encrypt sensitive document fields
3. Use encrypted volumes for file storage

### Network Security

1. Enable TLS:
   ```yaml
   # In docker-compose.yml
   environment:
     TLS_ENABLED: "true"
   ```

2. Configure firewall rules
3. Use VPN for internal access

## Support Contacts

- **On-Call Engineer**: [Contact Info]
- **Database Admin**: [Contact Info]
- **Security Team**: [Contact Info]

