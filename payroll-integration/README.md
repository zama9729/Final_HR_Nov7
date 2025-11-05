# Payroll Integration

This directory contains all files needed to integrate the Payroll application with the HR system.

## Directory Structure

```
payroll-integration/
├── migrations/          # Database migrations for Payroll
│   ├── 001_add_hr_integration.sql
│   └── 002_add_org_scoping.sql
├── scripts/             # Utility scripts
│   ├── backup.sh       # Pre-migration backup
│   ├── etl_backfill.ts # ETL script to backfill from HR
│   └── verify_integrity.ts # Verification script
├── PAYROLL_IMPLEMENTATION.md  # Payroll-side implementation guide
└── README.md           # This file
```

## Quick Start

### For HR System (Already Implemented)

1. ✅ SSO endpoint: `/api/payroll/sso`
2. ✅ Sidebar link with SSO integration
3. ✅ Feature flag: `PAYROLL_INTEGRATION_ENABLED`

### For Payroll System

1. Run migrations (see `PAYROLL_IMPLEMENTATION.md`)
2. Implement JWT verification middleware
3. Implement auto-provisioning
4. Implement RBAC guards
5. Run ETL backfill

## Documentation

- **[Schema Mapping](../docs/schema-mapping.md)**: HR ↔ Payroll table mappings
- **[Integration Guide](../docs/payroll-integration.md)**: Complete integration documentation
- **[Payroll Implementation](./PAYROLL_IMPLEMENTATION.md)**: Payroll-side implementation steps

## Scripts

### Backup Database

```bash
export PAYROLL_DB_URL="postgresql://user:pass@host:5432/payroll_db"
./scripts/backup.sh
```

### ETL Backfill

```bash
export HR_DB_URL="postgresql://user:pass@host:5432/hr_db"
export PAYROLL_DB_URL="postgresql://user:pass@host:5432/payroll_db"
ts-node scripts/etl_backfill.ts
```

### Verify Integrity

```bash
export HR_DB_URL="postgresql://user:pass@host:5432/hr_db"
export PAYROLL_DB_URL="postgresql://user:pass@host:5432/payroll_db"
ts-node scripts/verify_integrity.ts
```

## Environment Variables

### HR System

```env
PAYROLL_INTEGRATION_ENABLED=true
PAYROLL_BASE_URL=https://payroll.example.com
PAYROLL_JWT_SECRET=your-shared-secret-key
```

### Payroll System

```env
HR_JWT_SECRET=your-shared-secret-key
PAYROLL_DB_URL=postgresql://user:pass@host:5432/payroll_db
HR_DB_URL=postgresql://user:pass@host:5432/hr_db
```

## Migration Order

1. **Backup**: Run `./scripts/backup.sh`
2. **Migration 001**: Add HR integration columns
3. **Migration 002**: Add org scoping
4. **ETL**: Run `etl_backfill.ts` to backfill data
5. **Verify**: Run `verify_integrity.ts` to check integrity

## Support

For issues or questions:
1. Check [Integration Guide](../docs/payroll-integration.md)
2. Review [Payroll Implementation](./PAYROLL_IMPLEMENTATION.md)
3. Check error logs in both systems

