# Deployment & RLS Rollout Guide

## Environment variables
- `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD`
- `APP_BASE_URL`, `FRONTEND_URL`
- `APP_CURRENT_ORG_VAR` (implicitly `app.current_org` in Postgres session)

## Pre-deploy checklist
1) **Backup DB**  
   ```bash
   pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d%H%M).sql
   ```
2) **Run migrations in staging**  
   ```bash
   for f in server/db/migrations/*.sql; do psql "$STAGING_DB_URL" -v ON_ERROR_STOP=1 -f "$f"; done
   ```
3) **Smoke tests**: login, list employees, ensure cross-org data is denied.

## Production rollout
1) Put app in maintenance (optional for safety).  
2) Run migrations:  
   ```bash
   for f in server/db/migrations/*.sql; do psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f "$f"; done
   ```
3) Deploy app, ensure middleware sets `app.current_org` per request (done in `server/db/pool.js`).  
4) Smoke tests:  
   - Org A user cannot see Org B employees.  
   - Health: `GET /api/health` returns 200.  
5) Monitor logs, DB connections, error rate.

## CI / CD
- GitHub Actions workflow: `.github/workflows/ci.yml`
  - Spins up Postgres
  - Applies migrations
  - Runs `npm test` and `npm run test:rls`

## Rollback strategy
1) Restore from backup if needed:  
   ```bash
   psql "$DATABASE_URL" < backup_<timestamp>.sql
   ```
2) If only latest migration failed, you can comment it out and re-run deploy. Avoid destructive down-migrations in production.

## RLS notes
- Session variable: `SET LOCAL app.current_org = '<org-uuid>'`
- Policies use helper `org_rls_guard(tenant_id)`.
- If `app.current_org` is unset, RLS denies access.

## Seeding
Seed sample org/user for testing:
```bash
node server/scripts/seed-sample-org.js
```

## Health check
- `GET /api/health` returns `{ status: "ok" }` when DB reachable.

## Smoke test commands
```bash
# Set org to A, expect rows
psql "$DATABASE_URL" -c "SET LOCAL app.current_org = '<org-a-uuid>'; SELECT count(*) FROM profiles;"
# Without org set, expect 0 rows (RLS)
psql "$DATABASE_URL" -c "SELECT * FROM profiles LIMIT 1;"
```

