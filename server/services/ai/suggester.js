import { query } from '../../db/pool.js';

// Very lightweight placeholder scoring that approximates acceptance criteria
export async function suggestCandidates(project, options) {
  const includeOverloaded = !!options.include_overloaded;
  const expectedAlloc = Number(project.expected_allocation_percent || options.expected_allocation_percent || 50);

  // Pull basic candidate pool for the org
  const poolRes = await query(
    `SELECT e.id as employee_id, p.first_name, p.last_name, p.email,
            COALESCE( (
              SELECT SUM(allocation_percent) FROM assignments a
              WHERE a.employee_id = e.id AND (a.end_date IS NULL OR a.end_date >= now()::date)
            ), 0) AS current_alloc
     FROM employees e
     JOIN profiles p ON p.id = e.user_id
     WHERE e.tenant_id = $1`,
    [project.org_id]
  );

  // Parse required_skills from JSONB (could be string or already parsed)
  let reqSkills = [];
  if (project.required_skills) {
    if (typeof project.required_skills === 'string') {
      try {
        reqSkills = JSON.parse(project.required_skills);
      } catch (e) {
        console.error('Error parsing required_skills:', e);
        reqSkills = [];
      }
    } else if (Array.isArray(project.required_skills)) {
      reqSkills = project.required_skills;
    }
  }

  // Parse required_certifications (could be array or JSON string)
  let reqCerts = [];
  if (project.required_certifications) {
    if (typeof project.required_certifications === 'string') {
      try {
        reqCerts = JSON.parse(project.required_certifications);
      } catch (e) {
        // Might be PostgreSQL array string format
        reqCerts = Array.isArray(project.required_certifications) ? project.required_certifications : [];
      }
    } else if (Array.isArray(project.required_certifications)) {
      reqCerts = project.required_certifications;
    }
  }

  console.log('Project requirements:', { reqSkills, reqCerts, expectedAlloc });

  const candidates = [];
  for (const row of poolRes.rows) {
    const employeeId = row.employee_id;
    // Skills (with tenant check for RLS)
    const empTenantRes = await query('SELECT tenant_id FROM employees WHERE id = $1', [employeeId]);
    const empTenant = empTenantRes.rows[0]?.tenant_id;
    if (!empTenant) continue; // Skip if no tenant
    
    // Query skills/certs with tenant context (use withClient for RLS)
    let skRes, certRes, empProjects;
    try {
      // Use withClient for skills/certs (RLS), regular query for projects (no RLS needed for read)
      const { withClient } = await import('../../db/pool.js');
      await withClient(async (client) => {
        skRes = await client.query('SELECT name, level, endorsements FROM skills WHERE employee_id = $1 AND tenant_id = $2', [employeeId, empTenant]);
        certRes = await client.query('SELECT name FROM certifications WHERE employee_id = $1 AND tenant_id = $2', [employeeId, empTenant]);
      }, empTenant);
      empProjects = await query('SELECT project_name, description, technologies FROM employee_projects WHERE employee_id = $1 AND tenant_id = $2', [employeeId, empTenant]);
    } catch (e) {
      console.error(`Error fetching data for employee ${employeeId}:`, e);
      continue;
    }

    let skillScore = 0;
    for (const rs of reqSkills) {
      // Handle both object format {name, min_level} and string format
      const skillName = typeof rs === 'string' ? rs : (rs.name || rs);
      const minLevel = typeof rs === 'object' ? (rs.min_level || 1) : 1;
      
      const found = skRes.rows.find(s => s.name.toLowerCase() === String(skillName || '').toLowerCase());
      if (found) {
        const levelWeight = Math.max(0, (found.level || 0) - minLevel) + 1;
        skillScore += 10 * levelWeight + Math.min(5, Number(found.endorsements || 0));
      }
    }
    skillScore = Math.min(60, skillScore);

    let certBonus = 0;
    for (const c of reqCerts) {
      if (certRes.rows.find(r => r.name && r.name.toLowerCase() === String(c).toLowerCase())) certBonus += 3;
    }
    certBonus = Math.min(10, certBonus);

    // Availability
    const availablePct = Math.max(0, 100 - Number(row.current_alloc));
    let availability = Math.max(0, availablePct - expectedAlloc);
    availability = Math.min(20, Math.round((availability / 100) * 20));

    // Past project fit (very naive)
    let pastFit = 0;
    if (empProjects.rows.length > 0 && reqSkills.length > 0) {
      const techs = (empProjects.rows[0].technologies || []).map(t => String(t).toLowerCase());
      const overlap = reqSkills.filter(r => {
        const skillName = typeof r === 'string' ? r : (r.name || r);
        return techs.includes(String(skillName || '').toLowerCase());
      }).length;
      pastFit = Math.min(5, overlap);
    }

    const finalScore = Math.min(100, skillScore + certBonus + availability + pastFit + 5);
    const overloaded = (row.current_alloc + expectedAlloc) > 100 || (row.current_alloc >= (options.util_threshold || 80));
    if (overloaded && !includeOverloaded) continue;

    candidates.push({
      employee_id: employeeId,
      name: `${row.first_name || ''} ${row.last_name || ''}`.trim(),
      final_score: finalScore,
      availability: availablePct,
      current_allocations: Number(row.current_alloc),
      breakdown: { skillMatch: skillScore, certBonus, availability, pastProject: pastFit },
      past_projects: empProjects.rows.slice(0, 3)
    });
  }

  candidates.sort((a, b) => b.final_score - a.final_score);
  return candidates.slice(0, 20);
}

export default { suggestCandidates };


