import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';

const router = express.Router();

// Get calendar data for projects/assignments
// Supports filters: employee_id, project_id, start_date, end_date, view_type ('employee' or 'organization')
router.get('/', authenticateToken, async (req, res) => {
  const fetchScheduleEvents = async (tenantId, options) => {
    const {
      rangeStart,
      rangeEnd,
      isEmployeeView,
      employee_id,
      myEmployeeId,
      isPrivilegedRole,
      isManager,
      managerEmployeeId,
    } = options;
    let scheduleEmployeeFilter = '';
    const scheduleParams = [tenantId];
    let scheduleParamIndex = 1;

    if (isEmployeeView && myEmployeeId) {
      // Employee view: only own shifts
      scheduleEmployeeFilter = `AND sa.employee_id = $${++scheduleParamIndex}`;
      scheduleParams.push(myEmployeeId);
    } else if (!isEmployeeView && isManager && managerEmployeeId) {
      // Manager organization view: own shifts + direct reports' shifts
      scheduleEmployeeFilter = `AND (sa.employee_id = $${++scheduleParamIndex} OR e.reporting_manager_id = $${scheduleParamIndex})`;
      scheduleParams.push(managerEmployeeId);
    } else if (isPrivilegedRole && employee_id) {
      // HR/CEO/Admin/Director filtering by a specific employee
      scheduleEmployeeFilter = `AND sa.employee_id = $${++scheduleParamIndex}`;
      scheduleParams.push(employee_id);
    }

    let scheduleDateFilter = '';
    if (rangeStart) {
      scheduleDateFilter += ` AND sa.shift_date >= $${++scheduleParamIndex}::date`;
      scheduleParams.push(rangeStart);
    }
    if (rangeEnd) {
      scheduleDateFilter += ` AND sa.shift_date <= $${++scheduleParamIndex}::date`;
      scheduleParams.push(rangeEnd);
    }

    const schedulesQuery = `
      SELECT 
        sa.id,
        sa.employee_id,
        sa.shift_date,
        sa.start_time,
        sa.end_time,
        sa.assigned_by,
        sa.schedule_id,
        sa.shift_template_id,
        e.employee_id as employee_code,
        pr.first_name,
        pr.last_name,
        pr.email,
        t.name as template_name,
        t.shift_type,
        gs.week_start_date,
        gs.week_end_date,
        gs.status as schedule_status
      FROM schedule_assignments sa
      JOIN employees e ON e.id = sa.employee_id
      JOIN profiles pr ON pr.id = e.user_id
      JOIN shift_templates t ON t.id = sa.shift_template_id
      JOIN generated_schedules gs ON gs.id = sa.schedule_id
      WHERE sa.tenant_id = $1 
        AND gs.tenant_id = $1
        AND gs.status NOT IN ('archived', 'rejected')
        ${scheduleEmployeeFilter}
        ${scheduleDateFilter}
      ORDER BY sa.shift_date ASC, sa.start_time ASC
    `;

    const schedulesRes = await query(schedulesQuery, scheduleParams);

    return schedulesRes.rows.map(schedule => {
      const startDateTime = `${schedule.shift_date}T${schedule.start_time}`;
      let endDateTime = schedule.end_time ? `${schedule.shift_date}T${schedule.end_time}` : null;
      if (schedule.end_time && schedule.start_time > schedule.end_time) {
        const endDateObj = new Date(schedule.shift_date);
        endDateObj.setDate(endDateObj.getDate() + 1);
        const endDate = endDateObj.toISOString().split('T')[0];
        endDateTime = `${endDate}T${schedule.end_time}`;
      }

      return {
        id: `schedule_${schedule.id}`,
        title: `${schedule.template_name} - ${schedule.first_name} ${schedule.last_name}`,
        start: startDateTime,
        end: endDateTime,
        allDay: false,
        resource: {
          type: 'shift',
          assignment_id: schedule.id,
          employee_id: schedule.employee_id,
          employee_name: `${schedule.first_name} ${schedule.last_name}`,
          employee_email: schedule.email,
          shift_date: schedule.shift_date,
          start_time: schedule.start_time,
          end_time: schedule.end_time,
          template_name: schedule.template_name,
          shift_type: schedule.shift_type,
          shift_template_id: schedule.shift_template_id,
          assigned_by: schedule.assigned_by,
          schedule_id: schedule.schedule_id,
          schedule_status: schedule.schedule_status
        }
      };
    });
  };

  try {
    const { employee_id, project_id, start_date, end_date, view_type } = req.query;
    const today = new Date();
    const defaultStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const defaultEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    const rangeStart =
      start_date ||
      defaultStart.toISOString().split('T')[0];
    const rangeEnd =
      end_date ||
      defaultEnd.toISOString().split('T')[0];
    
    // Get user's tenant
    const userRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = userRes.rows[0]?.tenant_id;
    if (!tenantId) {
      return res.status(403).json({ error: 'No organization found' });
    }

    // Check user role
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    // Align privileged roles with other analytics/utilization endpoints so
    // directors/admins/managers can also view the organization calendar
    const isPrivilegedRole = ['hr', 'ceo', 'director', 'admin', 'manager'].includes(userRole);
    const isManager = userRole === 'manager';
    
    // Determine view level: 'employee' shows only current user's events, 'organization' shows all (if HR/CEO)
    const isEmployeeView = view_type === 'employee' || (!isPrivilegedRole && view_type !== 'organization');
    
    // Get current user's employee ID (needed for employee/manager views)
    const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
    const myEmployeeId = empRes.rows.length > 0 ? empRes.rows[0].id : null;
    
    // If employee role or employee view, they can only see their own data
    let employeeFilter = '';
    const params = [tenantId];
    let paramIndex = 1;
    
    if (isEmployeeView && myEmployeeId) {
      // Employee view: only show current user's project assignments
      employeeFilter = `AND a.employee_id = $${++paramIndex}`;
      params.push(myEmployeeId);
    } else if (!isEmployeeView && isManager && myEmployeeId) {
      // Manager organization view: own assignments + direct reports
      employeeFilter = `AND (a.employee_id = $${++paramIndex} OR e.reporting_manager_id = $${paramIndex})`;
      params.push(myEmployeeId);
    } else if (isPrivilegedRole && employee_id) {
      // Organization view with specific employee filter
      employeeFilter = `AND a.employee_id = $${++paramIndex}`;
      params.push(employee_id);
    }

    // Date range filter
    let dateFilter = '';
    if (rangeStart) {
      dateFilter += ` AND (a.end_date IS NULL OR a.end_date >= $${++paramIndex}::date)`;
      params.push(rangeStart);
    }
    if (rangeEnd) {
      dateFilter += ` AND (a.start_date IS NULL OR a.start_date <= $${++paramIndex}::date)`;
      params.push(rangeEnd);
    }

    // Project filter
    let projectFilter = '';
    if (project_id) {
      projectFilter = `AND a.project_id = $${++paramIndex}`;
      params.push(project_id);
    }

    // Get assignments with project and employee details
    const assignmentsQuery = `
      SELECT 
        a.id,
        a.project_id,
        a.employee_id,
        a.role,
        a.allocation_percent,
        a.start_date,
        a.end_date,
        a.override,
        a.override_reason,
        p.name as project_name,
        p.start_date as project_start_date,
        p.end_date as project_end_date,
        p.status as project_status,
        e.employee_id as employee_code,
        pr.first_name,
        pr.last_name,
        pr.email
      FROM assignments a
      JOIN projects p ON p.id = a.project_id
      JOIN employees e ON e.id = a.employee_id
      JOIN profiles pr ON pr.id = e.user_id
      WHERE p.org_id = $1 ${employeeFilter} ${projectFilter} ${dateFilter}
      ORDER BY a.start_date ASC, a.created_at ASC
    `;

    const assignmentsRes = await query(assignmentsQuery, params);
    
    // Format project assignments as calendar events
    const assignmentEvents = assignmentsRes.rows.map(assign => ({
      id: `assignment_${assign.id}`,
      title: `${assign.project_name} - ${assign.first_name} ${assign.last_name} (${assign.allocation_percent}%)`,
      start: assign.start_date || assign.project_start_date,
      end: assign.end_date || assign.project_end_date || null,
      allDay: true,
      resource: {
        type: 'assignment',
        project_id: assign.project_id,
        project_name: assign.project_name,
        employee_id: assign.employee_id,
        employee_name: `${assign.first_name} ${assign.last_name}`,
        employee_email: assign.email,
        allocation_percent: assign.allocation_percent,
        role: assign.role,
        override: assign.override,
        override_reason: assign.override_reason
      }
    }));

    // Get shift schedule assignments for the date range
    let scheduleEvents = [];
    try {
      scheduleEvents = await fetchScheduleEvents(tenantId, {
        rangeStart,
        rangeEnd,
        isEmployeeView,
        employee_id,
        myEmployeeId,
        isPrivilegedRole,
        isManager,
        managerEmployeeId: myEmployeeId,
      });
    } catch (error) {
      console.error('Error fetching schedule assignments:', error);
    }

    // Fetch approved leaves overlapping the range
    let leaveQuery = `
      SELECT 
        lr.id,
        lr.employee_id,
        COALESCE(lp.name, initcap(lp.leave_type::text)) AS leave_label,
        COALESCE(lp.leave_type::text, 'leave') AS leave_type,
        lr.reason,
        lr.start_date,
        lr.end_date
      FROM leave_requests lr
      LEFT JOIN leave_policies lp ON lp.id = lr.leave_type_id
      JOIN employees e ON e.id = lr.employee_id
      WHERE lr.tenant_id = $1
        AND e.tenant_id = $1
        AND lr.status IN ('approved', 'planned')
        AND lr.start_date <= $3::date
        AND lr.end_date >= $2::date
    `;
    const leaveParams = [tenantId, rangeStart, rangeEnd];
    
    // Filter leaves by employee if in employee/manager view
    if (isEmployeeView && myEmployeeId) {
      leaveQuery += ` AND lr.employee_id = $4`;
      leaveParams.push(myEmployeeId);
    } else if (!isEmployeeView && isManager && myEmployeeId) {
      // Manager org view: own leaves + direct reports' leaves
      leaveQuery += ` AND (lr.employee_id = $4 OR e.reporting_manager_id = $4)`;
      leaveParams.push(myEmployeeId);
    } else if (isPrivilegedRole && employee_id) {
      leaveQuery += ` AND lr.employee_id = $4`;
      leaveParams.push(employee_id);
    }
    
    const leaveResult = await query(leaveQuery, leaveParams);
    const leaveEvents = leaveResult.rows;

    // Fetch published holidays for the org
    const holidayListsRes = await query(
      `SELECT id, region
       FROM holiday_lists
       WHERE org_id = $1
         AND published = true`,
      [tenantId]
    );
    const holidayListIds = holidayListsRes.rows.map((list) => list.id);
    let holidays = [];
    if (holidayListIds.length > 0) {
      const holidaysRes = await query(
        `SELECT h.*, hl.region
         FROM holidays h
         JOIN holiday_lists hl ON hl.id = h.list_id
         WHERE hl.org_id = $1
           AND h.date BETWEEN $2::date AND $3::date
         ORDER BY h.date ASC`,
        [tenantId, rangeStart, rangeEnd]
      );
      holidays = holidaysRes.rows;
    }

    // Build conflict indicators
    const conflicts = [];
    const leaveByEmployee = leaveEvents.reduce((acc, leave) => {
      if (!acc[leave.employee_id]) acc[leave.employee_id] = [];
      acc[leave.employee_id].push(leave);
      return acc;
    }, {});
    const holidayDateSet = new Set(holidays.map((h) => (typeof h.date === 'string' ? h.date : h.date.toISOString().split('T')[0])));

    scheduleEvents.forEach((event) => {
      if (event.resource.type !== 'shift') return;
      const dateStr = event.resource.shift_date;
      const empLeaves = leaveByEmployee[event.resource.employee_id] || [];
      const hasLeave = empLeaves.some(
        (leave) => dateStr >= (leave.start_date instanceof Date ? leave.start_date.toISOString().split('T')[0] : leave.start_date)
          && dateStr <= (leave.end_date instanceof Date ? leave.end_date.toISOString().split('T')[0] : leave.end_date)
      );
      if (hasLeave) {
        conflicts.push({
          type: 'leave_conflict',
          date: dateStr,
          employee_id: event.resource.employee_id,
          assignment_id: event.id,
          message: 'Assigned during approved leave',
        });
      }
      if (holidayDateSet.has(dateStr)) {
        conflicts.push({
          type: 'holiday_conflict',
          date: dateStr,
          employee_id: event.resource.employee_id,
          assignment_id: event.id,
          message: 'Assignment overlaps company holiday',
        });
      }
    });

    // Fetch birthdays (if date_of_birth column exists in onboarding_data)
    let birthdayEvents = [];
    try {
      // Check if date_of_birth column exists first
      const columnCheck = await query(`
        SELECT column_name 
        FROM information_schema.columns 
        WHERE table_name = 'onboarding_data' 
          AND column_name = 'date_of_birth'
          AND table_schema = 'public'
      `);
      
      if (columnCheck.rows.length > 0) {
        let birthdayQuery = `
          SELECT 
            e.id as employee_id,
            p.first_name,
            p.last_name,
            od.date_of_birth
          FROM employees e
          JOIN profiles p ON p.id = e.user_id
          LEFT JOIN onboarding_data od ON od.employee_id = e.id
          WHERE e.tenant_id = $1
            AND e.status = 'active'
            AND od.date_of_birth IS NOT NULL
        `;
        const birthdayParams = [tenantId];
        
        // Filter birthdays by employee if in employee view
        if (isEmployeeView && myEmployeeId) {
          birthdayQuery += ` AND e.id = $2`;
          birthdayParams.push(myEmployeeId);
        } else if (isPrivilegedRole && employee_id) {
          birthdayQuery += ` AND e.id = $2`;
          birthdayParams.push(employee_id);
        }
        
        const birthdayRes = await query(birthdayQuery, birthdayParams);
      
      // Generate birthday events for the current year within the date range
      const currentYear = new Date().getFullYear();
      birthdayRes.rows.forEach(emp => {
        if (!emp.date_of_birth) return;
        const birthDate = new Date(emp.date_of_birth);
        const thisYearBirthday = new Date(currentYear, birthDate.getMonth(), birthDate.getDate());
        const nextYearBirthday = new Date(currentYear + 1, birthDate.getMonth(), birthDate.getDate());
        
        // Check if birthday falls within range (this year or next year)
        const rangeStartDate = new Date(rangeStart);
        const rangeEndDate = new Date(rangeEnd);
        
        if (thisYearBirthday >= rangeStartDate && thisYearBirthday <= rangeEndDate) {
          birthdayEvents.push({
            id: `birthday_${emp.employee_id}_${currentYear}`,
            title: `🎂 ${emp.first_name} ${emp.last_name}'s Birthday`,
            start: thisYearBirthday.toISOString().split('T')[0],
            end: thisYearBirthday.toISOString().split('T')[0],
            allDay: true,
            resource: {
              type: 'birthday',
              employee_id: emp.employee_id,
              employee_name: `${emp.first_name} ${emp.last_name}`,
              date_of_birth: emp.date_of_birth
            }
          });
        }
        
        // Also include next year's birthday if range extends to next year
        if (nextYearBirthday >= rangeStartDate && nextYearBirthday <= rangeEndDate) {
          birthdayEvents.push({
            id: `birthday_${emp.employee_id}_${currentYear + 1}`,
            title: `🎂 ${emp.first_name} ${emp.last_name}'s Birthday`,
            start: nextYearBirthday.toISOString().split('T')[0],
            end: nextYearBirthday.toISOString().split('T')[0],
            allDay: true,
            resource: {
              type: 'birthday',
              employee_id: emp.employee_id,
              employee_name: `${emp.first_name} ${emp.last_name}`,
              date_of_birth: emp.date_of_birth
            }
          });
        }
      });
      }
    } catch (error) {
      console.error('Error fetching birthdays:', error);
      // Continue without birthdays if there's an error
    }

    // Format holidays as events
    const holidayEvents = holidays.map(holiday => ({
      id: `holiday_${holiday.id}`,
      title: `🎉 ${holiday.name}`,
      start: typeof holiday.date === 'string' ? holiday.date : holiday.date.toISOString().split('T')[0],
      end: typeof holiday.date === 'string' ? holiday.date : holiday.date.toISOString().split('T')[0],
      allDay: true,
      resource: {
        type: 'holiday',
        holiday_id: holiday.id,
        name: holiday.name,
        region: holiday.region,
        is_national: holiday.is_national
      }
    }));

    // Format leaves as events
    const leaveEventsFormatted = leaveEvents.map(leave => {
      const startDate = leave.start_date instanceof Date 
        ? leave.start_date.toISOString().split('T')[0]
        : leave.start_date;
      const endDate = leave.end_date instanceof Date
        ? leave.end_date.toISOString().split('T')[0]
        : leave.end_date;
      
      return {
        id: `leave_${leave.id}`,
        title: `🏖️ ${leave.leave_label || 'Leave'}`,
        start: startDate,
        end: endDate,
        allDay: true,
        resource: {
          type: 'leave',
          leave_id: leave.id,
          employee_id: leave.employee_id,
          leave_type: leave.leave_type,
          leave_label: leave.leave_label,
          reason: leave.reason
        }
      };
    });

    // Combine all types of events
    const events = [...assignmentEvents, ...scheduleEvents, ...birthdayEvents, ...holidayEvents, ...leaveEventsFormatted];

    // Get project list (for filter dropdown)
    const projectsQuery = isPrivilegedRole
      ? `SELECT id, name, status, start_date, end_date FROM projects WHERE org_id = $1 ORDER BY name`
      : `SELECT DISTINCT p.id, p.name, p.status, p.start_date, p.end_date 
         FROM projects p 
         JOIN assignments a ON a.project_id = p.id 
         JOIN employees e ON e.id = a.employee_id 
         WHERE p.org_id = $1 AND e.user_id = $2 
         ORDER BY p.name`;
    const projectsParams = isPrivilegedRole ? [tenantId] : [tenantId, req.user.id];
    const projectsRes = await query(projectsQuery, projectsParams);
    
    // Get employee list (for HR/CEO filter)
    let employees = [];
    if (isPrivilegedRole) {
      const empListRes = await query(
        `SELECT e.id, e.employee_id, pr.first_name, pr.last_name, pr.email
         FROM employees e
         JOIN profiles pr ON pr.id = e.user_id
         WHERE e.tenant_id = $1
         ORDER BY pr.first_name, pr.last_name`,
        [tenantId]
      );
      employees = empListRes.rows.map(e => ({
        id: e.id,
        name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
        email: e.email,
        employee_code: e.employee_id
      }));
    } else {
      // For employees, just return their own info
      const empRes = await query(
        `SELECT e.id, e.employee_id, pr.first_name, pr.last_name, pr.email
         FROM employees e
         JOIN profiles pr ON pr.id = e.user_id
         WHERE e.user_id = $1`,
        [req.user.id]
      );
      if (empRes.rows.length > 0) {
        const e = empRes.rows[0];
        employees = [{
          id: e.id,
          name: `${e.first_name || ''} ${e.last_name || ''}`.trim(),
          email: e.email,
          employee_code: e.employee_id
        }];
      }
    }

    // Calculate availability periods (gaps between assignments)
    const availabilityPeriods = [];
    if (assignmentsRes.rows.length > 0) {
      const sortedAssignments = [...assignmentsRes.rows].sort((a, b) => {
        const aStart = a.start_date || a.project_start_date;
        const bStart = b.start_date || b.project_start_date;
        return new Date(aStart || 0) - new Date(bStart || 0);
      });

      // Group by employee
      const byEmployee = {};
      sortedAssignments.forEach(assign => {
        if (!byEmployee[assign.employee_id]) {
          byEmployee[assign.employee_id] = [];
        }
        byEmployee[assign.employee_id].push(assign);
      });

      // Calculate gaps for each employee
      Object.entries(byEmployee).forEach(([empId, assigns]) => {
        for (let i = 0; i < assigns.length - 1; i++) {
          const currentEnd = assigns[i].end_date || assigns[i].project_end_date;
          const nextStart = assigns[i + 1].start_date || assigns[i + 1].project_start_date;
          
          if (currentEnd && nextStart) {
            const endDate = new Date(currentEnd);
            const startDate = new Date(nextStart);
            endDate.setDate(endDate.getDate() + 1); // Next day after assignment ends
            
            if (startDate > endDate) {
              // There's a gap
              availabilityPeriods.push({
                employee_id: empId,
                employee_name: assigns[i].first_name + ' ' + assigns[i].last_name,
                start: endDate.toISOString().split('T')[0],
                end: startDate.toISOString().split('T')[0]
              });
            }
          }
        }
      });
    }

    // Removed fallback mechanism that was loading data from other organizations
    // This ensures proper organization isolation and RLS compliance

    console.log('[Calendar] tenant', tenantId, 'view', view_type, 'range', rangeStart, rangeEnd, 'events', events.length);
    res.json({
      events,
      projects: projectsRes.rows,
      employees,
      availability: availabilityPeriods,
      leaves: leaveEvents,
      holidays,
      conflicts
    });
  } catch (error) {
    console.error('Error fetching calendar data:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch calendar data' });
  }
});

// Get employee utilization timeline
router.get('/employee/:id/utilization', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { start_date, end_date } = req.query;
    
    // Verify access (employee can see own, HR/CEO can see any)
    const userRes = await query('SELECT tenant_id FROM profiles WHERE id = $1', [req.user.id]);
    const tenantId = userRes.rows[0]?.tenant_id;
    
    const roleRes = await query('SELECT role FROM user_roles WHERE user_id = $1', [req.user.id]);
    const userRole = roleRes.rows[0]?.role;
    const isPrivilegedRole = ['hr', 'ceo', 'director', 'admin', 'manager'].includes(userRole);
    
    if (!isPrivilegedRole) {
      const empRes = await query('SELECT id FROM employees WHERE user_id = $1', [req.user.id]);
      if (empRes.rows.length === 0 || empRes.rows[0].id !== id) {
        return res.status(403).json({ error: 'Unauthorized' });
      }
    }

    // Get assignments with date range
    const params = [id];
    let dateFilter = '';
    if (start_date) {
      dateFilter += ` AND (end_date IS NULL OR end_date >= $${params.length + 1}::date)`;
      params.push(start_date);
    }
    if (end_date) {
      dateFilter += ` AND (start_date IS NULL OR start_date <= $${params.length + 1}::date)`;
      params.push(end_date);
    }

    const utilRes = await query(
      `SELECT 
        a.id,
        a.project_id,
        a.allocation_percent,
        a.start_date,
        a.end_date,
        p.name as project_name,
        p.start_date as project_start,
        p.end_date as project_end
      FROM assignments a
      JOIN projects p ON p.id = a.project_id
      WHERE a.employee_id = $1 ${dateFilter}
      ORDER BY COALESCE(a.start_date, p.start_date) ASC`,
      params
    );

    // Calculate utilization per day/month
    const timeline = [];
    utilRes.rows.forEach(assign => {
      const start = assign.start_date || assign.project_start;
      const end = assign.end_date || assign.project_end || new Date().toISOString().split('T')[0];
      
      if (start) {
        timeline.push({
          project_id: assign.project_id,
          project_name: assign.project_name,
          allocation_percent: assign.allocation_percent,
          start,
          end
        });
      }
    });

    res.json({ timeline });
  } catch (error) {
    console.error('Error fetching utilization:', error);
    res.status(500).json({ error: error.message || 'Failed to fetch utilization' });
  }
});

export default router;
