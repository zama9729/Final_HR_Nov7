# Team & Project Allocation Infrastructure

## Overview

This implementation provides a comprehensive Team & Project Allocation infrastructure for multi-org HR/People applications. It supports:

- Multiple organizational teams (functional departments/squads) with reporting managers
- Employees with primary/home teams and primary reporting managers
- Flexible project allocations where members from different teams can be temporarily assigned to project teams
- Matrix organization structure with functional and project managers

## Database Schema

### Core Tables

1. **teams** (enhanced)
   - `team_type`: 'FUNCTIONAL' | 'PROJECT'
   - `parent_team_id`: For nested teams/hierarchy
   - `owner_manager_id`: Default manager/lead for functional teams
   - `is_active`: Active status flag

2. **team_memberships** (new)
   - Links employees to teams
   - `is_primary`: Boolean indicating primary/home functional team
   - `role`: 'MEMBER' | 'MANAGER' | 'LEAD' | 'COORDINATOR'
   - `start_date` / `end_date`: Date range for membership

3. **reporting_lines** (new)
   - Manager-employee relationships
   - `relationship_type`: 'PRIMARY_MANAGER' | 'SECONDARY_MANAGER' | 'PROJECT_MANAGER'
   - `team_id`: Optional reference to link manager to specific team/project
   - `start_date` / `end_date`: Date range for reporting relationship

4. **projects** (enhanced)
   - `code`: Short identifier
   - `description`: Project description
   - `project_manager_id`: Primary project manager
   - `team_id`: Reference to project team (team_type = 'PROJECT')
   - `status`: 'PLANNED' | 'ACTIVE' | 'ON_HOLD' | 'COMPLETED'

5. **project_allocations** (new)
   - Employee project assignments
   - `allocation_type`: 'FULL_TIME' | 'PART_TIME' | 'AD_HOC'
   - `percent_allocation`: 0-100 allocation percentage
   - `role_on_project`: Role on the project
   - `start_date` / `end_date`: Date range for allocation

## Business Rules

### Team Memberships
- Each employee must have exactly one active primary team membership (is_primary = true, end_date IS NULL)
- Employees can have multiple secondary team memberships
- Enforced via database trigger: `enforce_single_primary_team_membership()`

### Reporting Lines
- Each employee must have exactly one active PRIMARY_MANAGER (end_date IS NULL)
- Employees can have multiple SECONDARY_MANAGER or PROJECT_MANAGER relationships
- Enforced via database trigger: `enforce_single_primary_manager()`

### Project Allocations
- When an employee is allocated to a project, a PROJECT_MANAGER reporting line is automatically created
- The trigger `auto_create_project_manager_reporting()` handles this
- When allocation ends, the PROJECT_MANAGER reporting line is closed via `close_project_manager_on_allocation_end()`

## API Endpoints

### Teams
- `GET /api/teams` - List teams (with filters: type, search, active)
- `POST /api/teams` - Create team (HR/Admin only)
- `GET /api/teams/:id` - Get team details
- `PATCH /api/teams/:id` - Update team (HR/Admin only)
- `POST /api/teams/:id/activate` - Activate team
- `POST /api/teams/:id/deactivate` - Deactivate team
- `GET /api/teams/:id/members` - Get team members
- `POST /api/teams/:id/members` - Add team member (HR/Admin only)
- `PATCH /api/teams/:id/members/:memberId` - Update team membership (HR/Admin only)

### Reporting Lines
- `GET /api/reporting-lines/employee/:employeeId` - Get employee's reporting structure
- `GET /api/reporting-lines/manager/:managerId` - Get manager's direct reports
- `POST /api/reporting-lines/set-primary-manager` - Set primary manager (HR/Admin only)
- `POST /api/reporting-lines/add-secondary-manager` - Add secondary manager (HR/Admin only)
- `POST /api/reporting-lines/remove-manager` - Remove manager relationship (HR/Admin only)

### Projects (Enhanced)
- `GET /api/v1/projects` - List projects (with filters: status, search)
- `POST /api/v1/projects` - Create project (HR/Admin only)
- `GET /api/v1/projects/:id` - Get project details with allocations
- `PATCH /api/v1/projects/:id` - Update project (HR/Admin only)
- `GET /api/v1/projects/:id/members` - Get project members (from allocations)
- `POST /api/v1/projects/:id/allocations` - Create project allocation (HR/Admin only)
- `PATCH /api/v1/projects/:id/allocations/:allocId` - Update project allocation (HR/Admin only)

## Frontend Pages

### Teams Management (`/teams`)
- List view with tabs for Functional and Project teams
- Search functionality
- Create/Edit team dialog
- View team details
- Activate/Deactivate teams (HR/Admin only)

### Team Detail (`/teams/:id`)
- Team information card
- Team members table
- Add/Remove members (HR/Admin only)
- Set primary team flag for functional teams

## Data Migration

The migration script `20250131_migrate_existing_team_data.sql` handles:

1. Migrating existing `employee_assignments` to `team_memberships`
2. Migrating `employees.reporting_manager_id` to `reporting_lines`
3. Migrating existing `assignments` to `project_allocations`
4. Setting `owner_manager_id` on teams based on team members with MANAGER role
5. Ensuring all employees have at least one primary team membership
6. Ensuring all employees have a PRIMARY_MANAGER reporting line

## Row-Level Security (RLS)

All new tables have RLS enabled with policies that enforce org-level isolation:
- `org_isolation_team_memberships`
- `org_isolation_reporting_lines`
- `org_isolation_project_allocations`

These policies use `current_setting('app.org_id', true)::uuid` to filter by organization.

## Usage Examples

### Scenario: 4 Managers with 10 Members Each

1. Create 4 functional teams:
   ```sql
   INSERT INTO teams (org_id, name, code, team_type, owner_manager_id) VALUES
   (org_id, 'Engineering Frontend', 'ENG-FE', 'FUNCTIONAL', manager1_id),
   (org_id, 'Engineering Backend', 'ENG-BE', 'FUNCTIONAL', manager2_id),
   (org_id, 'Product', 'PROD', 'FUNCTIONAL', manager3_id),
   (org_id, 'Sales', 'SALES', 'FUNCTIONAL', manager4_id);
   ```

2. Add members to each team with `is_primary = true`:
   ```sql
   INSERT INTO team_memberships (org_id, team_id, employee_id, role, is_primary)
   VALUES (org_id, team_id, employee_id, 'MEMBER', true);
   ```

3. Set primary managers:
   ```sql
   INSERT INTO reporting_lines (org_id, employee_id, manager_id, relationship_type)
   VALUES (org_id, employee_id, manager_id, 'PRIMARY_MANAGER');
   ```

### Scenario: Temporary Project Assignment

1. Create a project with a project team:
   ```sql
   INSERT INTO teams (org_id, name, team_type) VALUES (org_id, 'Project Alpha Team', 'PROJECT');
   INSERT INTO projects (org_id, name, project_manager_id, team_id) 
   VALUES (org_id, 'Project Alpha', project_manager_id, team_id);
   ```

2. Allocate employees from different functional teams:
   ```sql
   INSERT INTO project_allocations (org_id, project_id, employee_id, allocation_type, percent_allocation)
   VALUES (org_id, project_id, employee_id, 'PART_TIME', 50);
   ```

3. The system automatically creates PROJECT_MANAGER reporting lines via trigger.

## Next Steps (Pending)

1. **Projects Management UI** - Enhanced project list and detail pages with allocation management
2. **Employee Profile Section** - Add "Team & Reporting" section showing:
   - Primary team and manager
   - Other teams (functional or project)
   - Current projects with allocation % and project manager
3. **Org Chart View** - Visual representation of reporting lines and team hierarchy

## Files Created/Modified

### Database
- `server/db/migrations/20250131_team_project_allocation.sql` - Main schema migration
- `server/db/migrations/20250131_migrate_existing_team_data.sql` - Data migration

### Backend
- `server/routes/teams.js` - Team management routes
- `server/routes/reporting-lines.js` - Reporting lines routes
- `server/routes/projects.js` - Enhanced project routes
- `server/index.js` - Route registration

### Frontend
- `src/lib/api.ts` - API client methods
- `src/pages/Teams.tsx` - Teams list page
- `src/pages/TeamDetail.tsx` - Team detail page
- `src/App.tsx` - Route definitions

## Testing Checklist

- [ ] Create functional teams
- [ ] Assign employees to teams (primary and secondary)
- [ ] Set primary managers
- [ ] Create project teams
- [ ] Allocate employees to projects
- [ ] Verify PROJECT_MANAGER reporting lines are auto-created
- [ ] Test RLS isolation (users from org A cannot see org B data)
- [ ] Test business rule enforcement (single primary team, single primary manager)
- [ ] Test data migration from existing structure










