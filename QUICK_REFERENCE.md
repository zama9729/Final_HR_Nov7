# HR Platform - Quick Reference Guide

## Feature Summary

### 🔐 Two-Step Email-First Login
- **Step 1**: Enter email → System validates
- **Step 2**: Enter password → Login
- **First-Time**: Automatic password setup flow
- **Security**: No email enumeration, company branding

### 📝 Smart Memo
- **Input**: Natural language text
- **Output**: Calendar events + Reminders
- **Formats**: `11-12 meeting`, `10:30-11:15 standup`, `remind me in 30 minutes`
- **Storage**: Team calendar with RLS

### ⏱️ Reminder System
- **Creation**: From Smart Memo or direct
- **Display**: Countdown in top bar
- **Alert**: Sound + Toast when time is up
- **Cancel**: One-click cancellation

### 🔔 Notifications
- **Display**: Unread notifications only
- **Actions**: Mark read, dismiss, clear all
- **Sync**: Instant UI updates

---

## API Endpoints

### Authentication
```
POST /api/auth/check-email
POST /api/auth/login
POST /api/auth/first-time-setup
POST /api/auth/signup
```

### Smart Memo
```
POST /api/calendar/smart-memo
Body: { memoText: string, baseDate: string }
```

### Reminders
```
GET /api/reminders/active
POST /api/reminders/:id/cancel
```

### Notifications
```
GET /api/notifications
POST /api/notifications/:id/read
POST /api/notifications/:id/dismiss
POST /api/notifications/clear-all
```

### Timesheets
```
POST /api/timesheets/:id/submit
```

---

## Database Tables

### `team_schedule_events`
- Calendar events from Smart Memo
- RLS enabled (tenant isolation)
- Fields: `id`, `tenant_id`, `employee_id`, `title`, `start_date`, `end_date`, `start_time`, `end_time`

### `reminders`
- User reminders
- Fields: `id`, `user_id`, `tenant_id`, `remind_at`, `message`, `is_read`, `is_dismissed`

### `notifications`
- System notifications
- Fields: `id`, `user_id`, `tenant_id`, `title`, `message`, `type`, `is_read`, `is_dismissed`

### `timesheets`
- Employee timesheets
- Fields: `id`, `employee_id`, `status`, `submitted_by`, `approvals`, `audit_snapshot`

---

## Smart Memo Parsing Patterns

### Pattern 1: HH:MM-HH:MM
```
10:30-11:15 daily standup
→ 10:30 - 11:15
```

### Pattern 2: HH-HH
```
11-12 in meeting
→ 11:00 - 12:00
```

### Pattern 3: H-HH (single digit)
```
9-10 code review
→ 09:00 - 10:00
```

### Reminder Pattern
```
remind me in 30 minutes
remind me in 2 hours
→ Extracted and scheduled separately
```

### Multiple Entries
```
11-12 meeting, 13-15 coding, 16-17 review
→ Creates 3 separate events
```

---

## Component Structure

### Frontend Components
```
src/components/
├── dashboard/SmartMemo.tsx      # Smart Memo input UI
├── ReminderCountdown.tsx        # Countdown timer
├── Notifications.tsx            # Notification list
└── layout/TopNavBar.tsx         # Navigation bar
```

### Backend Routes
```
server/routes/
├── auth.js                      # Authentication
├── smart-memo.js                # Smart Memo processing
├── reminders.js                 # Reminder management
└── notifications.js             # Notification management
```

### Services
```
server/services/
└── reminder-cron.js             # Background cron job
```

### Utils
```
src/utils/
└── smartMemoParser.ts           # Parsing logic
```

---

## Key Functions

### `parseSmartMemo(text, baseDate)`
- Parses time ranges from text
- Returns `ParsedEntry[]`
- Validates time ranges

### `parseReminderCommands(text, baseDate)`
- Extracts reminder commands
- Returns `ReminderCommand[]`
- Calculates `remind_at` timestamp

### `extractReminders(text, baseDate)`
- Separates reminders from calendar text
- Returns `{ cleanedText, reminders }`

---

## Security Features

### Row Level Security (RLS)
- Automatic tenant isolation
- Database-level enforcement
- Applied to `team_schedule_events`

### Authentication
- JWT tokens with 7-day expiry
- Token includes `org_id` for tenant context
- All protected routes require authentication

### Password Security
- bcrypt hashing (10 rounds)
- Minimum 8 characters
- Secure first-time setup

---

## Error Handling

### Smart Memo Errors
- Invalid format → Show format examples
- No entries found → Helpful error message
- Invalid time range → Silently skipped

### Login Errors
- Email not found → Offer signup
- Invalid password → Generic error message
- First-time setup → Validation errors

### Reminder Errors
- Cancel failed → Show error toast
- Fetch failed → Log error, continue polling

---

## Performance Optimizations

### Frontend
- Polling interval: 2 seconds (reminders)
- Countdown update: 1 second
- Debounced API calls where applicable

### Backend
- Database indexes on frequently queried columns
- Efficient RLS policies
- Cron job runs every minute

### Database
- Indexes on: `user_id`, `tenant_id`, `remind_at`, `is_read`, `is_dismissed`
- Composite indexes for common queries

---

## Testing Scenarios

### Login Flow
1. Enter non-existent email → Should show signup option
2. Enter existing email → Should show password form
3. Enter wrong password → Should show error
4. First-time user → Should show password setup

### Smart Memo
1. Valid entry → Should create event
2. Invalid format → Should show error
3. Multiple entries → Should create multiple events
4. With reminder → Should create event + reminder

### Reminder System
1. Create reminder → Countdown should appear
2. Wait for time → Sound should play
3. Cancel reminder → Should disappear
4. Multiple reminders → Should show nearest

### Notifications
1. Mark as read → Should disappear
2. Clear all → Should clear all
3. Dismiss → Should remove from list

---

## Troubleshooting

### Reminder countdown not appearing
- Check if reminder was created (database)
- Check browser console for errors
- Verify `reminder-created` event is dispatched
- Check API response for active reminders

### Smart Memo not parsing
- Verify text format matches patterns
- Check for typos in time format
- Ensure start time < end time
- Check browser console for parsing errors

### Login issues
- Verify email format
- Check if user exists in database
- Verify password hash is correct
- Check JWT token generation

### RLS issues
- Verify `app.org_id` is set in session
- Check RLS policies are enabled
- Verify tenant_id matches user's org

---

## Deployment Checklist

### Database Migrations
- [ ] Run `20251207_add_submitted_by_to_timesheets.sql`
- [ ] Run `20251207_add_rls_team_schedule_events.sql`
- [ ] Verify tables exist: `reminders`, `team_schedule_events`

### Environment Variables
- [ ] `JWT_SECRET` set
- [ ] `CRON_ENABLED=true` (for reminder cron)
- [ ] Database connection string configured

### Backend Services
- [ ] Reminder cron job scheduled
- [ ] All routes registered in `server/index.js`
- [ ] Middleware configured correctly

### Frontend
- [ ] API base URL configured
- [ ] All components imported correctly
- [ ] Build succeeds without errors

---

## Support & Documentation

- **Flowcharts**: See `FLOWCHARTS.md`
- **Presentation**: See `PRESENTATION.md`
- **Code**: Check component files in `src/` and routes in `server/routes/`
- **Database Schema**: See `server/db/full-schema.sql`

---

**Last Updated**: December 2025


















