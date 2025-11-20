# Super Admin Analytics Runbook

This dashboard is designed for the owner/super-user persona. All numbers are aggregated and masked when a bucket would expose fewer than five organizations.

## Access
1. Ensure your user has the `super_user` role (see `server/scripts/seed-super-user.js`).
2. Open `/super/dashboard` in the web app.
3. Generate a TOTP code with the shared MFA secret and enter it before loading metrics.

## Widgets
- **KPIs** – Total orgs, active orgs (30d), new signups (7d), churned (90d). Churn counts orgs older than 90 days with no activity in the last 90 days.
- **Org Size Buckets** – Headcount bands computed from `employees` table.
- **Feature Adoption** – Attendance capture mode, branches enabled, payroll enabled. Counts `<5` are displayed as `<5`.
- **Recent Signups** – Latest 10 orgs with plan tier and size category (no names shown).
- **Export Snapshot** – Returns the raw `analytics.org_signup_summary` rows (JSON) for offline review.

## Refresh Cadence
- Materialized views (`analytics.org_signup_summary`, `analytics.org_activity_summary`) refresh hourly via `scheduleAnalyticsRefresh`.
- `/api/super/metrics` triggers an on-demand refresh to ensure fresh data when you open the dashboard.

## Troubleshooting
| Symptom | Action |
| --- | --- |
| MFA errors | Verify the code is generated from the same shared secret as stored in `super_users.mfa_secret`. Codes are valid for 30s. |
| Missing data | Run `SELECT analytics.refresh_org_views();` manually and check cron logs. |
| Export fails | Ensure `analytics` schema exists and the server .env allows exports (no restriction). Check server logs for errors around `/api/super/export`. |

## Adding Additional Super Users
1. Run `node server/scripts/seed-super-user.js --email user@example.com --mfa-secret BASE32SECRET`.
2. Share the MFA secret out-of-band. The script will create a profile, hashed password, role, and `super_users` entry.
3. User logs in normally, then provides the current MFA code on `/super/dashboard`.


