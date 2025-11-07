/**
 * Seed Data Script
 * 
 * Creates seed data for development/testing:
 * - 1 tenant (organization)
 * - 7 users (one per role: employee, manager, hr, director, ceo, admin, accountant)
 * - 6 employees in sample department across 2 states + remote
 * - 2 projects with allocations
 * - 3 weeks of timesheets (mix of pending/approved)
 * - Policies and state+remote calendars (10 holidays each)
 * - 1 dummy payroll run
 * - 1 termination + 1 rehire record
 */

import bcrypt from 'bcryptjs';
import { query } from '../db/pool.js';

const PASSWORD_HASH = await bcrypt.hash('password123', 10);

async function seed() {
  console.log('🌱 Starting seed data creation...');

  try {
    // 1. Create organization/tenant
    console.log('Creating organization...');
    const orgResult = await query(
      `INSERT INTO organizations (name, domain, company_size, industry, timezone)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      ['Acme Corp', 'acme.example.com', '100-500', 'Technology', 'America/New_York']
    );
    const orgId = orgResult.rows[0].id;
    console.log(`✅ Created organization: ${orgId}`);

    // 2. Create 7 users (one per role)
    console.log('Creating users...');
    const roles = ['employee', 'manager', 'hr', 'director', 'ceo', 'admin', 'accountant'];
    const users = [];

    for (const role of roles) {
      const email = `${role}@acme.example.com`;
      const firstName = role.charAt(0).toUpperCase() + role.slice(1);
      
      // Create profile
      const profileResult = await query(
        `INSERT INTO profiles (email, first_name, last_name, tenant_id)
         VALUES ($1, $2, $3, $4)
         RETURNING id`,
        [email, firstName, 'User', orgId]
      );
      const userId = profileResult.rows[0].id;

      // Create auth
      await query(
        `INSERT INTO user_auth (user_id, password_hash)
         VALUES ($1, $2)`,
        [userId, PASSWORD_HASH]
      );

      // Create role
      await query(
        `INSERT INTO user_roles (user_id, role, tenant_id)
         VALUES ($1, $2, $3)`,
        [userId, role, orgId]
      );

      users.push({ id: userId, email, role, firstName });
      console.log(`✅ Created ${role} user: ${email}`);
    }

    // 3. Create 6 employees in sample department across 2 states + remote
    console.log('Creating employees...');
    const employees = [];
    const states = ['California', 'Texas', 'Remote'];
    const departments = ['Engineering', 'Sales', 'Marketing'];
    
    const managerUser = users.find(u => u.role === 'manager');
    let managerEmpId = null;

    for (let i = 0; i < 6; i++) {
      const state = states[i % 3];
      const dept = departments[i % 3];
      const empUserId = users[i].id; // Use first 6 users as employees
      
      // Create employee
      const empResult = await query(
        `INSERT INTO employees (
          user_id, employee_id, department, position, 
          work_location, join_date, status, tenant_id, reporting_manager_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        RETURNING id`,
        [
          empUserId,
          `EMP${String(i + 1).padStart(3, '0')}`,
          dept,
          i === 0 ? 'Senior Engineer' : i === 1 ? 'Manager' : 'Developer',
          state === 'Remote' ? 'Remote' : `${state}, USA`,
          new Date(Date.now() - i * 30 * 24 * 60 * 60 * 1000), // Staggered join dates
          'active',
          orgId,
          i > 0 ? managerEmpId : null, // First employee is manager, others report to manager
        ]
      );
      const empId = empResult.rows[0].id;
      
      if (i === 1) {
        managerEmpId = empId; // Set manager ID
      }
      
      employees.push({ id: empId, userId: empUserId, dept, state });
      console.log(`✅ Created employee ${i + 1}: ${empUserId}`);
    }

    // Update manager's reporting_manager_id to null (they're the manager)
    if (managerEmpId) {
      await query(
        `UPDATE employees SET reporting_manager_id = NULL WHERE id = $1`,
        [managerEmpId]
      );
    }

    // 4. Create 2 projects with allocations
    console.log('Creating projects...');
    const projects = [];
    
    for (let i = 0; i < 2; i++) {
      const projResult = await query(
        `INSERT INTO projects (
          org_id, name, start_date, end_date, priority, 
          expected_allocation_percent, location
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING id`,
        [
          orgId,
          `Project ${i + 1}`,
          new Date(),
          new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
          i === 0 ? 1 : 2,
          50,
          i === 0 ? 'California' : 'Remote',
        ]
      );
      const projId = projResult.rows[0].id;
      projects.push(projId);

      // Create allocations for first 3 employees
      for (let j = 0; j < 3 && j < employees.length; j++) {
        await query(
          `INSERT INTO assignments (
            project_id, employee_id, role, allocation_percent, 
            start_date, end_date, tenant_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            projId,
            employees[j].id,
            j === 0 ? 'Lead' : 'Developer',
            50,
            new Date(),
            new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
            orgId,
          ]
        );
      }
      console.log(`✅ Created project ${i + 1} with allocations`);
    }

    // 5. Create 3 weeks of timesheets (mix of pending/approved)
    console.log('Creating timesheets...');
    const now = new Date();
    const managerEmp = employees.find(e => e.id === managerEmpId);
    
    for (let week = 0; week < 3; week++) {
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - (week * 7) - 7);
      weekStart.setHours(0, 0, 0, 0);
      
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);

      for (const emp of employees.slice(0, 4)) { // Create timesheets for first 4 employees
        const status = week === 0 ? 'pending' : 'approved';
        const reviewedBy = status === 'approved' && managerEmp ? managerEmp.id : null;
        
        const tsResult = await query(
          `INSERT INTO timesheets (
            employee_id, week_start_date, week_end_date, total_hours,
            status, submitted_at, reviewed_by, reviewed_at, tenant_id
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          RETURNING id`,
          [
            emp.id,
            weekStart,
            weekEnd,
            40,
            status,
            weekStart,
            reviewedBy,
            status === 'approved' ? new Date(weekStart.getTime() + 24 * 60 * 60 * 1000) : null,
            orgId,
          ]
        );
        const tsId = tsResult.rows[0].id;

        // Create entries for each day
        for (let day = 0; day < 5; day++) { // Monday to Friday
          const entryDate = new Date(weekStart);
          entryDate.setDate(weekStart.getDate() + day);
          
          await query(
            `INSERT INTO timesheet_entries (
              timesheet_id, work_date, hours, description, tenant_id
            )
            VALUES ($1, $2, $3, $4, $5)`,
            [tsId, entryDate, 8, `Work on Project ${day % 2 + 1}`, orgId]
          );
        }
      }
    }
    console.log('✅ Created 3 weeks of timesheets');

    // 6. Create policies
    console.log('Creating leave policies...');
    const policies = [
      { name: 'Annual Leave', leave_type: 'annual', annual_entitlement: 20 },
      { name: 'Sick Leave', leave_type: 'sick', annual_entitlement: 10 },
      { name: 'Casual Leave', leave_type: 'casual', annual_entitlement: 5 },
    ];

    for (const policy of policies) {
      await query(
        `INSERT INTO leave_policies (
          tenant_id, name, leave_type, annual_entitlement, 
          accrual_frequency, is_active
        )
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [orgId, policy.name, policy.leave_type, policy.annual_entitlement, 'monthly', true]
      );
    }
    console.log('✅ Created leave policies');

    // 7. Create state and remote holiday calendars (10 holidays each)
    console.log('Creating holiday calendars...');
    const statesForHolidays = ['California', 'Texas', 'Remote'];
    const holidays = [
      { name: 'New Year\'s Day', date: '2024-01-01' },
      { name: 'Martin Luther King Jr. Day', date: '2024-01-15' },
      { name: 'Presidents\' Day', date: '2024-02-19' },
      { name: 'Memorial Day', date: '2024-05-27' },
      { name: 'Independence Day', date: '2024-07-04' },
      { name: 'Labor Day', date: '2024-09-02' },
      { name: 'Thanksgiving', date: '2024-11-28' },
      { name: 'Day after Thanksgiving', date: '2024-11-29' },
      { name: 'Christmas Eve', date: '2024-12-24' },
      { name: 'Christmas Day', date: '2024-12-25' },
    ];

    for (const state of statesForHolidays) {
      // Create holiday list
      const listResult = await query(
        `INSERT INTO holiday_lists (
          org_id, name, state_or_remote, year, status
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id`,
        [orgId, `${state} Holidays 2024`, state, 2024, 'published']
      );
      const listId = listResult.rows[0].id;

      // Create holidays
      for (const holiday of holidays) {
        await query(
          `INSERT INTO holidays (
            holiday_list_id, name, date, org_id
          )
          VALUES ($1, $2, $3, $4)`,
          [listId, holiday.name, holiday.date, orgId]
        );
      }
      console.log(`✅ Created ${state} holiday calendar with 10 holidays`);
    }

    // 8. Create dummy payroll run (if payroll tables exist)
    console.log('Creating dummy payroll run...');
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS payroll_runs (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
          pay_period_start DATE NOT NULL,
          pay_period_end DATE NOT NULL,
          status TEXT NOT NULL DEFAULT 'draft',
          created_by UUID REFERENCES profiles(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      const hrUser = users.find(u => u.role === 'hr');
      await query(
        `INSERT INTO payroll_runs (
          tenant_id, pay_period_start, pay_period_end, status, created_by
        )
        VALUES ($1, $2, $3, $4, $5)`,
        [
          orgId,
          new Date(Date.now() - 14 * 24 * 60 * 60 * 1000),
          new Date(Date.now() - 7 * 24 * 60 * 60 * 1000),
          'completed',
          hrUser.id,
        ]
      );
      console.log('✅ Created dummy payroll run');
    } catch (err) {
      console.log('⚠️  Payroll tables not available, skipping payroll run');
    }

    // 9. Create termination and rehire records (if tables exist)
    console.log('Creating termination and rehire records...');
    try {
      await query(`
        CREATE TABLE IF NOT EXISTS employee_terminations (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          employee_id UUID REFERENCES employees(id) ON DELETE CASCADE,
          tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
          termination_date DATE NOT NULL,
          reason TEXT,
          initiated_by UUID REFERENCES profiles(id),
          approved_by UUID REFERENCES profiles(id),
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);

      const empToTerminate = employees[3];
      const hrUser = users.find(u => u.role === 'hr');
      const directorUser = users.find(u => u.role === 'director');

      await query(
        `INSERT INTO employee_terminations (
          employee_id, tenant_id, termination_date, reason, initiated_by, approved_by
        )
        VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          empToTerminate.id,
          orgId,
          new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
          'End of contract',
          hrUser.id,
          directorUser.id,
        ]
      );

      // Create rehire record
      await query(
        `INSERT INTO employees (
          user_id, employee_id, department, position, 
          work_location, join_date, status, tenant_id
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          empToTerminate.userId, // Rehire same user
          `EMP${String(employees.length + 1).padStart(3, '0')}`,
          empToTerminate.dept,
          'Developer',
          empToTerminate.state === 'Remote' ? 'Remote' : `${empToTerminate.state}, USA`,
          new Date(),
          'active',
          orgId,
        ]
      );
      console.log('✅ Created termination and rehire records');
    } catch (err) {
      console.log('⚠️  Termination tables not available, skipping termination/rehire');
    }

    console.log('\n✅ Seed data creation completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   - Organization: ${orgId}`);
    console.log(`   - Users: ${users.length} (one per role)`);
    console.log(`   - Employees: ${employees.length}`);
    console.log(`   - Projects: ${projects.length}`);
    console.log(`   - Timesheets: ~${3 * 4} weeks`);
    console.log(`   - Policies: ${policies.length}`);
    console.log(`   - Holiday calendars: ${statesForHolidays.length} (10 holidays each)`);
    console.log('\n🔐 Default password for all users: password123');

  } catch (error) {
    console.error('❌ Error creating seed data:', error);
    throw error;
  }
}

// Run seed if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  seed()
    .then(() => {
      console.log('✅ Seed completed');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Seed failed:', error);
      process.exit(1);
    });
}

export { seed };

