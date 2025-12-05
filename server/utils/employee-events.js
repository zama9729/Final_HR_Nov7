import { query, queryWithOrg } from '../db/pool.js';

/**
 * Create an employee event record
 */
export async function createEmployeeEvent({
  orgId,
  employeeId,
  eventType,
  eventDate,
  title,
  description,
  metadata = {},
  sourceTable = null,
  sourceId = null
}) {
  try {
    const result = await queryWithOrg(
      `INSERT INTO employee_events (
        org_id, employee_id, event_type, event_date,
        title, description, metadata_json, source_table, source_id
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      RETURNING *`,
      [
        orgId, employeeId, eventType, eventDate,
        title, description || null, JSON.stringify(metadata), sourceTable || null, sourceId || null
      ],
      orgId
    );
    
    return result.rows[0];
  } catch (error) {
    console.error('Error creating employee event:', error);
    throw error;
  }
}

/**
 * Create event when employee joins (called during onboarding completion)
 */
export async function createJoiningEvent(orgId, employeeId, joinDate) {
  return createEmployeeEvent({
    orgId,
    employeeId,
    eventType: 'JOINING',
    eventDate: joinDate,
    title: 'Joined Organization',
    description: 'Employee joined the organization',
    metadata: { joinDate }
  });
}

/**
 * Create event when appraisal is finalized
 */
export async function createAppraisalEvent(orgId, employeeId, appraisal) {
  const cycle = appraisal.appraisal_cycle || {};
  const eventDate = cycle.end_date || appraisal.updated_at || new Date();
  
  return createEmployeeEvent({
    orgId,
    employeeId,
    eventType: 'APPRAISAL',
    eventDate: typeof eventDate === 'string' ? eventDate.split('T')[0] : eventDate.toISOString().split('T')[0],
    title: `Appraisal ${cycle.cycle_year || new Date().getFullYear()}/${cycle.cycle_name || 'Annual'}`,
    description: `Performance review with rating: ${appraisal.rating || 'N/A'}`,
    metadata: {
      cycleName: cycle.cycle_name,
      cycleYear: cycle.cycle_year,
      rating: appraisal.rating,
      performanceScore: appraisal.performance_score,
      reviewerId: appraisal.reviewer_id
    },
    sourceTable: 'performance_reviews',
    sourceId: appraisal.id
  });
}

/**
 * Create event when project allocation starts
 */
export async function createProjectAssignmentEvent(orgId, employeeId, allocation, project) {
  return createEmployeeEvent({
    orgId,
    employeeId,
    eventType: 'PROJECT_ASSIGNMENT',
    eventDate: allocation.start_date || new Date().toISOString().split('T')[0],
    title: `Joined Project ${project.name}`,
    description: `Assigned to project as ${allocation.role_on_project || 'Team Member'}`,
    metadata: {
      projectId: project.id,
      projectName: project.name,
      roleOnProject: allocation.role_on_project,
      allocationType: allocation.allocation_type,
      percentAllocation: allocation.percent_allocation
    },
    sourceTable: 'project_allocations',
    sourceId: allocation.id
  });
}

/**
 * Create event when project allocation ends
 */
export async function createProjectEndEvent(orgId, employeeId, allocation, project) {
  if (!allocation.end_date) {
    return null; // No end date, allocation is still active
  }
  
  return createEmployeeEvent({
    orgId,
    employeeId,
    eventType: 'PROJECT_END',
    eventDate: allocation.end_date,
    title: `Completed Project ${project.name}`,
    description: `Project allocation ended`,
    metadata: {
      projectId: project.id,
      projectName: project.name,
      roleOnProject: allocation.role_on_project,
      endDate: allocation.end_date
    },
    sourceTable: 'project_allocations',
    sourceId: allocation.id
  });
}

/**
 * Create event for salary hike (if separate from promotion)
 */
export async function createHikeEvent(orgId, employeeId, hikeData) {
  const hikePercent = hikeData.oldCTC && hikeData.newCTC
    ? ((hikeData.newCTC - hikeData.oldCTC) / hikeData.oldCTC * 100).toFixed(2)
    : null;
  
  return createEmployeeEvent({
    orgId,
    employeeId,
    eventType: 'HIKE',
    eventDate: hikeData.effectiveDate || new Date().toISOString().split('T')[0],
    title: 'Salary Revision',
    description: hikePercent ? `Salary increased by ${hikePercent}%` : 'Salary revised',
    metadata: {
      oldCTC: hikeData.oldCTC,
      newCTC: hikeData.newCTC,
      hikePercent: hikePercent ? parseFloat(hikePercent) : null,
      effectiveMonth: hikeData.effectiveDate
    },
    sourceTable: hikeData.sourceTable || null,
    sourceId: hikeData.sourceId || null
  });
}

