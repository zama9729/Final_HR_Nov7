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

  const reqSkills = Array.isArray(project.required_skills) ? project.required_skills : [];
  const reqCerts = Array.isArray(project.required_certifications) ? project.required_certifications : [];

  const candidates = [];
  for (const row of poolRes.rows) {
    const employeeId = row.employee_id;
    // Skills
    const skRes = await query('SELECT name, level, endorsements FROM skills WHERE employee_id = $1', [employeeId]);
    const certRes = await query('SELECT name FROM certifications WHERE employee_id = $1', [employeeId]);
    const empProjects = await query('SELECT project_name, description, technologies FROM employee_projects WHERE employee_id = $1', [employeeId]);

    let skillScore = 0;
    for (const rs of reqSkills) {
      const found = skRes.rows.find(s => s.name.toLowerCase() === String(rs.name || '').toLowerCase());
      if (found) {
        const levelWeight = Math.max(0, (found.level || 0) - (rs.min_level || 1)) + 1;
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
      const overlap = reqSkills.filter(r => techs.includes(String(r.name || '').toLowerCase())).length;
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


