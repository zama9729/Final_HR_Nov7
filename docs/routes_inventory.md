# Routes Inventory

## API Routes (Backend)

### Authentication
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| POST | `/api/auth/signup` | None | Public | User registration |
| POST | `/api/auth/login` | None | Public | User login |

### Employees
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/employees` | `authenticateToken` | Role-based filtering | List employees (manager sees team, HR sees all) |
| GET | `/api/employees/org-chart` | `authenticateToken` | All authenticated | Get organization chart |
| GET | `/api/employees/check-password-change` | `authenticateToken` | All authenticated | Check if password change required |
| GET | `/api/employees/:id` | `authenticateToken` | Owner or HR/Director/CEO | Get employee details |
| POST | `/api/employees` | `authenticateToken` | HR/Director/CEO/Admin | Create new employee |
| PATCH | `/api/employees/:id` | `authenticateToken` | Owner or HR/Director/CEO | Update employee |
| POST | `/api/employees/import` | `authenticateToken`, `requireRole('hr','director','ceo','admin')` | HR/Director/CEO/Admin | Import employees from CSV |

### Profiles
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/profiles/me` | `authenticateToken` | Own profile | Get own profile |
| POST | `/api/profiles/me/presence` | `authenticateToken` | Own profile | Update presence status |
| GET | `/api/profiles/me/presence` | `authenticateToken` | Own profile | Get presence status |

### Timesheets
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/timesheets/employee/:employeeId/projects` | `authenticateToken` | Owner or HR/CEO | Get employee project assignments for timesheet |
| GET | `/api/timesheets/employee-id` | `authenticateToken` | All authenticated | Get current user's employee ID |
| GET | `/api/timesheets/pending` | `authenticateToken` | Manager/HR/Director/CEO | Get pending timesheets for approval |
| GET | `/api/timesheets` | `authenticateToken` | All authenticated | Get timesheets (filtered by role) |
| POST | `/api/timesheets` | `authenticateToken` | Employee (own) | Submit timesheet |
| POST | `/api/timesheets/:id/approve` | `authenticateToken` | Manager/HR/Director/CEO | Approve timesheet |

### Leave Requests
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/leave-requests` | `authenticateToken` | All authenticated | Get leave requests (filtered by role) |
| POST | `/api/leave-requests` | `authenticateToken` | Employee (own) | Create leave request |
| PATCH | `/api/leave-requests/:id/approve` | `authenticateToken` | Manager/HR/Director/CEO | Approve leave request |
| PATCH | `/api/leave-requests/:id/reject` | `authenticateToken` | Manager/HR/Director/CEO | Reject leave request |

### Leave Policies
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/leave-policies` | `authenticateToken` | All authenticated | Get leave policies |
| POST | `/api/leave-policies` | `authenticateToken` | HR/Director/CEO/Admin | Create leave policy |
| PATCH | `/api/leave-policies/:id` | `authenticateToken` | HR/Director/CEO/Admin | Update leave policy |
| DELETE | `/api/leave-policies/:id` | `authenticateToken` | HR/Director/CEO/Admin | Delete leave policy |

### Holidays
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/v1/orgs/:org/holiday-lists` | `authenticateToken` | All authenticated | Get holiday lists |
| POST | `/api/v1/orgs/:org/holiday-lists` | `authenticateToken` | HR/Director/CEO/Admin | Create holiday list |
| POST | `/api/v1/orgs/:org/holiday-lists/:id/import` | `authenticateToken` | HR/Director/CEO/Admin | Import holidays from CSV |
| POST | `/api/v1/orgs/:org/holiday-lists/:id/import/confirm` | `authenticateToken` | HR/Director/CEO/Admin | Confirm holiday import |
| POST | `/api/v1/orgs/:org/holiday-lists/:id/publish` | `authenticateToken` | HR/Director/CEO/Admin | Publish holiday list |
| POST | `/api/v1/orgs/:org/holiday-lists/:id/lock` | `authenticateToken` | HR/Director/CEO/Admin | Lock holiday list |
| POST | `/api/v1/orgs/:org/employees/:emp/holiday-override` | `authenticateToken` | HR/Director/CEO/Admin | Override employee holidays |
| GET | `/api/holidays/lists/:listId` | `authenticateToken` | All authenticated | Get holiday list details |
| GET | `/api/holidays/employee/:employeeId` | `authenticateToken` | Owner or HR/CEO | Get employee holidays |
| GET | `/api/holidays` | `authenticateToken` | All authenticated | Get holidays |
| GET | `/api/holidays/calendar` | `authenticateToken` | All authenticated | Get holiday calendar |

### Projects
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/v1/projects` | `authenticateToken` | All authenticated | List projects |
| POST | `/api/v1/projects` | `authenticateToken` | HR/Director/CEO/Admin | Create project |
| POST | `/api/v1/projects/:id/suggest-candidates` | `authenticateToken` | HR/Director/CEO/Admin | Get candidate suggestions |
| GET | `/api/v1/projects/:id` | `authenticateToken` | All authenticated | Get project details |
| PATCH | `/api/v1/projects/:id` | `authenticateToken` | HR/Director/CEO/Admin | Update project |
| DELETE | `/api/v1/projects/:id` | `authenticateToken` | HR/Director/CEO/Admin | Delete project |
| GET | `/api/v1/projects/:id/assignments` | `authenticateToken` | All authenticated | Get project assignments |
| POST | `/api/v1/projects/:id/assign` | `authenticateToken` | HR/Director/CEO/Admin | Assign employee to project |
| POST | `/api/v1/projects/:id/deallocate` | `authenticateToken` | HR/Director/CEO/Admin | Deallocate employee from project |
| POST | `/api/v1/projects/:id/replace` | `authenticateToken` | HR/Director/CEO/Admin | Replace employee assignment |

### Employee Projects
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/v1/employees/:id/projects` | `authenticateToken` | Owner or HR/CEO | Get employee project assignments |
| POST | `/api/v1/employees/:id/projects` | `authenticateToken` | HR/Director/CEO/Admin | Assign employee to projects |

### Onboarding
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| POST | `/api/onboarding/verify-employee-email` | None | Public | Verify employee email for password setup |
| POST | `/api/onboarding/setup-password` | None | Public | Setup password for verified employee |
| POST | `/api/onboarding/submit` | `authenticateToken` | Employee (own) | Submit onboarding data |
| GET | `/api/onboarding-tracker/employees` | `authenticateToken` | HR/Director/CEO/Admin | Get onboarding tracker data |

### Attendance
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| POST | `/api/v1/attendance/punch` | `authenticateToken`, `punchRateLimit` | Employee (own) | Punch in/out |
| POST | `/api/v1/attendance/upload` | `authenticateToken`, `requireRole('hr','director','ceo','admin')` | HR/Director/CEO/Admin | Upload attendance CSV |
| GET | `/api/v1/attendance/upload/:upload_id/status` | `authenticateToken` | All authenticated | Get upload status |
| GET | `/api/v1/attendance/employee/:employee_id/timesheet` | `authenticateToken` | Owner or HR/CEO | Get employee attendance timesheet |
| GET | `/api/v1/attendance/uploads` | `authenticateToken`, `requireRole('hr','director','ceo','admin')` | HR/Director/CEO/Admin | List attendance uploads |
| POST | `/api/v1/attendance/upload/:upload_id/retry` | `authenticateToken`, `requireRole('hr','director','ceo','admin')` | HR/Director/CEO/Admin | Retry failed upload |
| POST | `/api/v1/attendance/upload/:upload_id/cancel` | `authenticateToken`, `requireRole('hr','director','ceo','admin')` | HR/Director/CEO/Admin | Cancel upload |

### Check-in/out
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| POST | `/api/check-in-out/check-in` | `authenticateToken` | Employee (own) | Check in |
| POST | `/api/check-in-out/check-out` | `authenticateToken` | Employee (own) | Check out |
| GET | `/api/check-in-out/today` | `authenticateToken` | Employee (own) | Get today's check-in status |
| GET | `/api/check-in-out/history` | `authenticateToken` | Employee (own) | Get check-in history |
| GET | `/api/check-in-out/status` | `authenticateToken` | Employee (own) | Get current status |

### Notifications
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/notifications` | `authenticateToken` | All authenticated | Get user notifications |
| PATCH | `/api/notifications/:id/read` | `authenticateToken` | Owner | Mark notification as read |

### Stats
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/stats/pending-counts` | `authenticateToken` | Manager/HR/Director/CEO | Get pending approval counts |
| GET | `/api/stats/leave-balance` | `authenticateToken` | All authenticated | Get leave balance |

### Analytics
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/analytics` | `authenticateToken` | HR/Director/CEO/Admin | Get analytics data |

### Employee Stats
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/employee-stats` | `authenticateToken` | HR/Director/CEO/Admin | Get employee statistics |

### Calendar
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/calendar` | `authenticateToken` | All authenticated | Get calendar data |
| GET | `/api/calendar/employee/:id/utilization` | `authenticateToken` | Owner or HR/CEO | Get employee utilization |

### Skills
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/v1/employees/:id/skills` | `authenticateToken` | Owner or HR/CEO | Get employee skills |
| POST | `/api/v1/employees/:id/skills` | `authenticateToken` | Owner or HR/CEO | Update employee skills |
| GET | `/api/v1/employees/:id/certifications` | `authenticateToken` | Owner or HR/CEO | Get employee certifications |
| POST | `/api/v1/employees/:id/certifications` | `authenticateToken` | Owner or HR/CEO | Update employee certifications |

### Workflows
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/workflows/templates` | `authenticateToken` | All authenticated | Get workflow templates |
| POST | `/api/workflows/create-from-natural-language` | `authenticateToken` | HR/Director/CEO/Admin | Create workflow from natural language |
| POST | `/api/workflows` | `authenticateToken` | HR/Director/CEO/Admin | Create workflow |
| GET | `/api/workflows` | `authenticateToken` | All authenticated | List workflows |
| GET | `/api/workflows/:id` | `authenticateToken` | All authenticated | Get workflow details |
| DELETE | `/api/workflows/:id` | `authenticateToken` | HR/Director/CEO/Admin | Delete workflow |
| POST | `/api/workflows/:id/start` | `authenticateToken` | HR/Director/CEO/Admin | Start workflow instance |
| GET | `/api/workflows/actions/pending` | `authenticateToken` | All authenticated | Get pending workflow actions |
| POST | `/api/workflows/actions/:id/decide` | `authenticateToken` | All authenticated | Decide on workflow action |

### Approvals
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| POST | `/api/approvals/create` | `authenticateToken` | All authenticated | Create approval |
| GET | `/api/approvals/next` | `authenticateToken` | All authenticated | Get next approver |
| POST | `/api/approvals/apply` | `authenticateToken` | All authenticated | Apply approval decision |

### Organizations
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/organizations/me` | `authenticateToken` | All authenticated | Get own organization |
| PATCH | `/api/organizations/me` | `authenticateToken`, `requireRole('admin','ceo','director','hr')` | HR/Director/CEO/Admin | Update organization |

### Admin
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/admin/metrics` | `authenticateToken`, `requireSuperadmin` | Superadmin only | Get platform metrics |
| GET | `/api/admin/access` | `authenticateToken` | All authenticated | Check admin access |

### AI
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/ai/discovery` | `requireApiKey` | API key required | AI discovery endpoint |
| GET | `/api/ai/openapi.json` | `requireApiKey` | API key required | OpenAPI spec |
| POST | `/api/ai/roster/generate` | `requireApiKey` | API key required | Generate roster |
| POST | `/api/ai/csv/diagnose` | `requireApiKey` | API key required | Diagnose CSV issues |
| GET | `/api/ai/policy/explain` | `requireApiKey` | API key required | Explain policy |
| POST | `/api/ai/chat` | `authenticateToken` | All authenticated | AI chat |
| POST | `/api/ai/chat/simple` | `authenticateToken` | All authenticated | Simple AI chat |
| POST | `/api/ai/roster/generate-enhanced` | `authenticateToken` | HR/Director/CEO/Admin | Enhanced roster generation |
| POST | `/api/ai/projects/:projectId/suggestions-enhanced` | `authenticateToken` | HR/Director/CEO/Admin | Enhanced candidate suggestions |
| GET | `/api/ai/conversations` | `authenticateToken` | All authenticated | List conversations |
| GET | `/api/ai/conversations/:id` | `authenticateToken` | Owner | Get conversation |
| DELETE | `/api/ai/conversations/:id` | `authenticateToken` | Owner | Delete conversation |
| PATCH | `/api/ai/conversations/:id` | `authenticateToken` | Owner | Update conversation |

### Imports
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| POST | `/api/v1/orgs/:orgId/employees/import` | `authenticateToken`, `requireRole('hr','director','ceo','admin')` | HR/Director/CEO/Admin | Import employees |

### Appraisal Cycles
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/appraisal-cycles` | `authenticateToken` | All authenticated | List appraisal cycles |
| POST | `/api/appraisal-cycles` | `authenticateToken` | HR/Director/CEO/Admin | Create appraisal cycle |

### Performance Reviews
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/performance-reviews` | `authenticateToken` | All authenticated | List performance reviews |
| POST | `/api/performance-reviews` | `authenticateToken` | HR/Director/CEO/Admin | Create performance review |

### Shifts
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/shifts` | None | Public | Get shifts |
| POST | `/api/shifts` | None | Public | Create shift |

### Opal Mini Apps
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| GET | `/api/opal-mini-apps` | `authenticateToken` | All authenticated | List mini apps |
| GET | `/api/opal-mini-apps/:id` | `authenticateToken` | All authenticated | Get mini app |
| POST | `/api/opal-mini-apps` | `authenticateToken` | HR/Director/CEO/Admin | Create mini app |
| DELETE | `/api/opal-mini-apps/:id` | `authenticateToken` | HR/Director/CEO/Admin | Delete mini app |
| PATCH | `/api/opal-mini-apps/:id/toggle` | `authenticateToken` | HR/Director/CEO/Admin | Toggle mini app |
| GET | `/api/opal-mini-apps/category/:category` | `authenticateToken` | All authenticated | Get mini apps by category |

### Migrations
| Method | Path | Middleware | Guards | Description |
|--------|------|------------|--------|-------------|
| POST | `/api/migrations/timesheet-projects` | None | Public | Migration endpoint |
| POST | `/api/migrations/fix-assignments-updated-at` | None | Public | Migration endpoint |

## Frontend Routes (React Router)

### Public Routes
| Path | Component | Guard |
|------|-----------|-------|
| `/auth/login` | `Login` | `PublicRoute` |
| `/auth/signup` | `Signup` | `PublicRoute` |
| `/auth/first-time-login` | `FirstTimeLogin` | None |
| `/setup-password` | `SetupPassword` | None |

### Protected Routes - Employee
| Path | Component | Guard |
|------|-----------|-------|
| `/dashboard` | `Dashboard` | `ProtectedRoute` |
| `/my/profile` | `MyProfile` | `ProtectedRoute` |
| `/timesheets` | `Timesheets` | `ProtectedRoute` |
| `/leaves` | `LeaveRequests` | `ProtectedRoute` |
| `/calendar` | `ProjectCalendar` | `ProtectedRoute` |
| `/org-chart` | `OrgChart` | `ProtectedRoute` |
| `/my-appraisal` | `MyAppraisal` | `ProtectedRoute` |
| `/ai-assistant` | `AIAssistantPage` | `ProtectedRoute` |
| `/profile/skills` | `ProfileSkills` | `ProtectedRoute` |
| `/onboarding` | `Onboarding` | `ProtectedRoute` |
| `/change-password` | `ChangePassword` | `ProtectedRoute` |
| `/settings` | `Settings` | `ProtectedRoute` |

### Protected Routes - Manager
| Path | Component | Guard |
|------|-----------|-------|
| All Employee routes | - | - |
| `/employees` | `Employees` | `ProtectedRoute` (sees team) |
| `/timesheet-approvals` | `TimesheetApprovals` | `ProtectedRoute`, `allowedRoles: ['manager','hr','director','ceo','admin']` |
| `/appraisals` | `Appraisals` | `ProtectedRoute`, `allowedRoles: ['manager','hr','director','ceo','admin']` |

### Protected Routes - HR/Director/CEO/Admin
| Path | Component | Guard |
|------|-----------|-------|
| All Manager routes | - | - |
| `/employees/new` | `AddEmployee` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/employees/import` | `EmployeeImport` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/employees/:id` | `EmployeeDetail` | `ProtectedRoute` |
| `/onboarding-tracker` | `OnboardingTracker` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/workflows` | `Workflows` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/workflows/new` | `WorkflowEditor` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/workflows/:id/edit` | `WorkflowEditor` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/policies` | `LeavePolicies` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/holidays` | `HolidayManagement` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/analytics` | `Analytics` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/employee-stats` | `EmployeeStats` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/ceo/dashboard` | `CEODashboard` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/projects/new` | `ProjectNew` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/projects/:id/suggestions` | `ProjectSuggestions` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/shifts` | `ShiftManagement` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/attendance/upload` | `AttendanceUpload` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |
| `/attendance/history` | `AttendanceUploadHistory` | `ProtectedRoute`, `allowedRoles: ['hr','director','ceo','admin']` |

### Protected Routes - Admin (Superadmin)
| Path | Component | Guard |
|------|-----------|-------|
| `/admin` | `AdminDashboard` | `ProtectedRoute` (backend enforces superadmin) |

## Notes

- **Role-based access**: Most routes use `authenticateToken` middleware and check roles in the route handler
- **requireRole**: Explicit role middleware used in some routes (e.g., `requireRole('hr','director','ceo','admin')`)
- **requireSuperadmin**: Special admin check via environment variable `ADMIN_EMAILS`
- **Frontend guards**: `ProtectedRoute` component checks `allowedRoles` prop, falls back to redirecting to `/dashboard`
- **Missing capability-based checks**: Currently using role-based checks only. No centralized capability system exists yet.

