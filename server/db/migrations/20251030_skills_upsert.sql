-- Ensure unique skill name per employee (case-insensitive)
CREATE UNIQUE INDEX IF NOT EXISTS uq_skill_emp_name ON skills (employee_id, lower(name));


