# Promotions & Employee History Timeline - Migration Guide

## Overview
This guide will help you run the database migration for the Promotions and Employee History Timeline feature.

## Prerequisites
1. Docker Desktop must be running
2. PostgreSQL container (`hr-suite-postgres`) must be running
3. Database `hr_suite` must exist

## Step 1: Start Docker Containers

If containers are not running, start them:

```bash
docker-compose up -d
```

Wait for containers to be fully started (check with `docker-compose ps`).

## Step 2: Run the Migration

Execute the migration SQL file:

```bash
docker exec hr-suite-postgres psql -U postgres -d hr_suite -f /app/db/migrations/20250102_promotions_and_history.sql
```

**Alternative method** (if the file path doesn't work):

```bash
# Copy the migration file into the container first
docker cp server/db/migrations/20250102_promotions_and_history.sql hr-suite-postgres:/tmp/migration.sql

# Then execute it
docker exec hr-suite-postgres psql -U postgres -d hr_suite -f /tmp/migration.sql
```

## Step 3: Verify Migration Success

Check that the tables were created:

```bash
docker exec hr-suite-postgres psql -U postgres -d hr_suite -c "\dt promotions"
docker exec hr-suite-postgres psql -U postgres -d hr_suite -c "\dt employee_events"
```

You should see both tables listed.

Verify the enums were created:

```bash
docker exec hr-suite-postgres psql -U postgres -d hr_suite -c "\dT+ promotion_status"
docker exec hr-suite-postgres psql -U postgres -d hr_suite -c "\dT+ employee_event_type"
```

## Step 4: Verify Triggers

Check that the promotion event trigger exists:

```bash
docker exec hr-suite-postgres psql -U postgres -d hr_suite -c "\df create_promotion_event"
```

## Step 5: Test the Feature

1. **Start the application** (if not already running):
   ```bash
   npm run dev  # or your start command
   ```

2. **Access Promotions Page**:
   - Navigate to `/promotions` (requires HR, CEO, Admin, Director, or Manager role)
   - Click "New Promotion" to create a test promotion

3. **Test Promotion Workflow**:
   - Create a promotion (status: DRAFT)
   - Submit for approval (status: PENDING_APPROVAL)
   - Approve the promotion (status: APPROVED)
   - Check that employee profile is updated (if effective_date <= today)
   - Check that an employee_event was created

4. **Test Employee History**:
   - Navigate to "My Profile" → "History" tab
   - Verify that promotion events appear in the timeline
   - Test filters (year, event type)

## Troubleshooting

### Error: "relation 'promotions' does not exist"
- The migration didn't run successfully
- Check Docker logs: `docker logs hr-suite-postgres`
- Re-run the migration

### Error: "type 'promotion_status' does not exist"
- The enum creation failed
- Check if there's a conflict with existing types
- The migration uses `DO $$ BEGIN ... EXCEPTION WHEN duplicate_object THEN NULL; END $$;` to handle duplicates safely

### Error: "permission denied"
- Ensure you're using the correct database user (`postgres`)
- Check database permissions

### Migration file not found
- Verify the file exists: `ls server/db/migrations/20250102_promotions_and_history.sql`
- Use the alternative copy method shown in Step 2

## Rollback (if needed)

If you need to rollback the migration:

```sql
-- Drop tables (this will cascade delete related data)
DROP TABLE IF EXISTS employee_events CASCADE;
DROP TABLE IF EXISTS promotions CASCADE;

-- Drop enums (only if no other tables use them)
DROP TYPE IF EXISTS employee_event_type CASCADE;
DROP TYPE IF EXISTS promotion_status CASCADE;
```

**Warning**: This will delete all promotion and employee event data!

## Next Steps

After successful migration:

1. ✅ Test promotion creation workflow
2. ✅ Test approval/rejection flow
3. ✅ Verify notifications are sent
4. ✅ Check employee history timeline
5. ✅ Test project allocation events (PROJECT_ASSIGNMENT, PROJECT_END)
6. ✅ Verify JOINING events are created for new employees
7. ✅ Test appraisal events integration

## Support

If you encounter issues:
1. Check Docker container logs
2. Verify database connection
3. Ensure all required tables (employees, organizations, etc.) exist
4. Check that the migration SQL file is complete and valid

