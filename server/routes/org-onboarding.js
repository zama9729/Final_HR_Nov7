import express from 'express';
import { query } from '../db/pool.js';
import { authenticateToken } from '../middleware/auth.js';
import { SETUP_STEPS } from '../services/setup-state.js';

const router = express.Router();

// Complete organization onboarding - save all wizard data
router.post('/complete', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get user's organization
    const profileResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (profileResult.rows.length === 0 || !profileResult.rows[0].tenant_id) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const orgId = profileResult.rows[0].tenant_id;
    const {
      companyInfo,
      departments,
      designations,
      grades,
      employmentTypes,
      workLocations,
      keyEmployees,
      rolePermissions,
    } = req.body;

    await query('BEGIN');

    try {
      // Step 0: Ensure all required tables and columns exist
      try {
        // Ensure org_branches table exists first (needed for foreign keys)
        await query(`
          CREATE TABLE IF NOT EXISTS org_branches (
            id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
            organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
            branch_name TEXT NOT NULL,
            city TEXT,
            state TEXT,
            country TEXT DEFAULT 'India',
            address TEXT,
            timezone TEXT DEFAULT 'Asia/Kolkata',
            gst_number TEXT,
            registration_code TEXT,
            is_active BOOLEAN NOT NULL DEFAULT true,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
          );
        `).catch(() => {});
        
        // Ensure organizations table has the new columns
        await query(`
          ALTER TABLE organizations 
            ADD COLUMN IF NOT EXISTS legal_name TEXT,
            ADD COLUMN IF NOT EXISTS registered_business_name TEXT,
            ADD COLUMN IF NOT EXISTS registration_number TEXT,
            ADD COLUMN IF NOT EXISTS gst_number TEXT,
            ADD COLUMN IF NOT EXISTS cin_number TEXT,
            ADD COLUMN IF NOT EXISTS registered_address TEXT,
            ADD COLUMN IF NOT EXISTS contact_phone TEXT,
            ADD COLUMN IF NOT EXISTS contact_email TEXT,
            ADD COLUMN IF NOT EXISTS website TEXT;
        `).catch(() => {});
        
        // Ensure departments table has branch_id column
        await query(`
          ALTER TABLE departments 
            ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL;
        `).catch(() => {});
        
        // Ensure employees table has branch_id column
        await query(`
          ALTER TABLE employees 
            ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL;
        `).catch(() => {});
      } catch (schemaErr) {
        console.log('Schema check:', schemaErr.message);
      }

      // Step 1: Update organization with company information
      if (companyInfo) {

        // Update organization with company information
        await query(
          `UPDATE organizations SET
            legal_name = COALESCE($1, legal_name),
            registered_business_name = COALESCE($2, registered_business_name),
            registration_number = COALESCE($3, registration_number),
            gst_number = COALESCE($4, gst_number),
            cin_number = COALESCE($5, cin_number),
            registered_address = COALESCE($6, registered_address),
            contact_phone = COALESCE($7, contact_phone),
            contact_email = COALESCE($8, contact_email),
            website = COALESCE($9, website),
            updated_at = now()
          WHERE id = $10`,
          [
            companyInfo.legalName || null,
            companyInfo.registeredBusinessName || null,
            companyInfo.registrationNumber || null,
            companyInfo.gstNumber || null,
            companyInfo.cinNumber || null,
            companyInfo.registeredAddress || null,
            companyInfo.phone || null,
            companyInfo.email || null,
            companyInfo.website || null,
            orgId,
          ]
        );
      }

      // Step 2: Create departments (if not exists, use existing departments table)
      if (departments && Array.isArray(departments)) {
        for (const dept of departments) {
          if (dept.name) {
            const existingDept = await query(
              `SELECT id FROM departments 
               WHERE org_id = $1 AND LOWER(name) = LOWER($2) 
               LIMIT 1`,
              [orgId, dept.name]
            );
            
            if (existingDept.rows.length > 0) {
              await query(
                `UPDATE departments 
                 SET branch_id = COALESCE($1, branch_id), updated_at = now()
                 WHERE id = $2`,
                [dept.branchId || null, existingDept.rows[0].id]
              );
            } else {
              await query(
                `INSERT INTO departments (org_id, name, branch_id)
                 VALUES ($1, $2, $3)`,
                [orgId, dept.name, dept.branchId || null]
              );
            }
          }
        }
      }

      // Step 2b: Upsert designations from onboarding wizard into designations table
      if (designations && Array.isArray(designations)) {
        // Build existing map (name -> row)
        const existingDesignationsRes = await query(
          `SELECT id, name FROM designations WHERE org_id = $1`,
          [orgId]
        );
        const nameToId = new Map(
          existingDesignationsRes.rows.map((d) => [d.name.toLowerCase(), d.id])
        );

        // First pass: create or update designations (without parents)
        for (const desig of designations) {
          if (!desig?.name) continue;
          const normalizedName = desig.name.trim().toLowerCase();
          const levelVal = desig.level ?? desig.priority ?? desig.rank ?? null;

          if (nameToId.has(normalizedName)) {
            // Update level if provided
            if (levelVal !== null && levelVal !== undefined) {
              await query(
                `UPDATE designations
                 SET level = COALESCE($1, level), updated_at = now()
                 WHERE id = $2 AND org_id = $3`,
                [levelVal, nameToId.get(normalizedName), orgId]
              );
            }
          } else {
            const insertRes = await query(
              `INSERT INTO designations (org_id, name, level)
               VALUES ($1, $2, $3)
               RETURNING id`,
              [orgId, desig.name.trim(), levelVal]
            );
            nameToId.set(normalizedName, insertRes.rows[0].id);
          }
        }

        // Second pass: set parent relationships
        for (const desig of designations) {
          if (!desig?.name) continue;
          const normalizedName = desig.name.trim().toLowerCase();
          const selfId = nameToId.get(normalizedName);
          if (!selfId) continue;

          let parentId = desig.parentId || desig.parent_id || desig.parent_designation_id || null;
          if (!parentId && desig.parentName) {
            const parentNorm = desig.parentName.trim().toLowerCase();
            parentId = nameToId.get(parentNorm) || null;
          }

          await query(
            `UPDATE designations
             SET parent_designation_id = $1, updated_at = now()
             WHERE id = $2 AND org_id = $3`,
            [parentId, selfId, orgId]
          );
        }
      }

      // Step 3: Ensure normalized tables exist (run migration if needed)
      try {
        // Run the migration to ensure all tables exist
        const fs = await import('fs');
        const path = await import('path');
        const migrationPath = path.join(process.cwd(), 'server', 'db', 'migrations', '20250108_organization_onboarding_normalized.sql');
        if (fs.existsSync(migrationPath)) {
          const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
          // Split by semicolons and execute each statement
          const statements = migrationSQL.split(';').filter(s => s.trim().length > 0);
          for (const statement of statements) {
            if (statement.trim()) {
              try {
                await query(statement + ';');
              } catch (err) {
                // Ignore errors for existing objects
                if (!err.message.includes('already exists') && !err.message.includes('duplicate')) {
                  console.log('Migration statement warning:', err.message);
                }
              }
            }
          }
        }
      } catch (migrationErr) {
        // If migration file doesn't exist, create tables directly
        console.log('Migration file not found, creating tables directly');
        try {
          // Fallback: create minimal required tables
          await query(`
            CREATE TABLE IF NOT EXISTS org_designations (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
              branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
              name TEXT NOT NULL,
              code TEXT,
              description TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
          `);
          await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_designations_org_name ON org_designations(organisation_id, LOWER(name));`);
          
          await query(`
            CREATE TABLE IF NOT EXISTS org_grades (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
              branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
              name TEXT NOT NULL,
              level INTEGER NOT NULL,
              description TEXT,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
          `);
          await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_grades_org_name ON org_grades(organisation_id, LOWER(name));`);
          await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_grades_org_level ON org_grades(organisation_id, level);`);
          
          await query(`
            CREATE TABLE IF NOT EXISTS org_reporting_lines (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
              designation_id UUID NOT NULL REFERENCES org_designations(id) ON DELETE CASCADE,
              parent_designation_id UUID REFERENCES org_designations(id) ON DELETE SET NULL,
              branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
          `);
          await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_reporting_lines_unique ON org_reporting_lines(organisation_id, designation_id, parent_designation_id);`);
          
          await query(`
            CREATE TABLE IF NOT EXISTS org_roles (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
              branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
              role_name TEXT NOT NULL,
              description TEXT,
              is_system_role BOOLEAN NOT NULL DEFAULT false,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
          `);
          await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_roles_org_name ON org_roles(organisation_id, LOWER(role_name));`);
          
          await query(`
            CREATE TABLE IF NOT EXISTS org_role_permissions (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
              role_id UUID NOT NULL REFERENCES org_roles(id) ON DELETE CASCADE,
              module TEXT NOT NULL,
              permission_type TEXT NOT NULL,
              has_permission BOOLEAN NOT NULL DEFAULT false,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
          `);
          await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_role_permissions_unique ON org_role_permissions(role_id, module, permission_type);`);
          
          await query(`
            CREATE TABLE IF NOT EXISTS org_employment_types (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
              branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
              employment_type TEXT NOT NULL,
              is_active BOOLEAN NOT NULL DEFAULT true,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
          `);
          await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_employment_types_unique ON org_employment_types(organisation_id, LOWER(employment_type));`);
          
          await query(`
            CREATE TABLE IF NOT EXISTS org_work_locations (
              id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
              organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
              branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
              location_name TEXT NOT NULL,
              address TEXT,
              is_active BOOLEAN NOT NULL DEFAULT true,
              created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
              updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
            );
          `);
          await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_work_locations_unique ON org_work_locations(organisation_id, LOWER(location_name));`);
        } catch (createErr) {
          console.error('Error creating tables:', createErr.message);
          // Continue anyway - tables might already exist
        }
      }

      // Safety net: ensure core tables exist before inserts (idempotent)
      await query(`
        CREATE TABLE IF NOT EXISTS org_designations (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
          name TEXT NOT NULL,
          code TEXT,
          description TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_designations_org_name ON org_designations(organisation_id, LOWER(name));`);

      await query(`
        CREATE TABLE IF NOT EXISTS org_grades (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
          name TEXT NOT NULL,
          level INTEGER NOT NULL,
          description TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_grades_org_name ON org_grades(organisation_id, LOWER(name));`);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_grades_org_level ON org_grades(organisation_id, level);`);

      await query(`
        CREATE TABLE IF NOT EXISTS org_reporting_lines (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          designation_id UUID NOT NULL REFERENCES org_designations(id) ON DELETE CASCADE,
          parent_designation_id UUID REFERENCES org_designations(id) ON DELETE SET NULL,
          branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_reporting_lines_unique ON org_reporting_lines(organisation_id, designation_id, parent_designation_id);`);

      await query(`
        CREATE TABLE IF NOT EXISTS org_roles (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
          role_name TEXT NOT NULL,
          description TEXT,
          is_system_role BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_roles_org_name ON org_roles(organisation_id, LOWER(role_name));`);

      await query(`
        CREATE TABLE IF NOT EXISTS org_role_permissions (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          role_id UUID NOT NULL REFERENCES org_roles(id) ON DELETE CASCADE,
          module TEXT NOT NULL,
          permission_type TEXT NOT NULL,
          has_permission BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_role_permissions_unique ON org_role_permissions(role_id, module, permission_type);`);

      await query(`
        CREATE TABLE IF NOT EXISTS org_employment_types (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
          employment_type TEXT NOT NULL,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_employment_types_unique ON org_employment_types(organisation_id, LOWER(employment_type));`);

      await query(`
        CREATE TABLE IF NOT EXISTS org_work_locations (
          id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
          organisation_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
          branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
          location_name TEXT NOT NULL,
          address TEXT,
          is_active BOOLEAN NOT NULL DEFAULT true,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
      `);
      await query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_org_work_locations_unique ON org_work_locations(organisation_id, LOWER(location_name));`);

      // Create designations
      if (designations && Array.isArray(designations)) {
        for (const des of designations) {
          if (des.name) {
            // Check if designation already exists
            let desResult = await query(
              `SELECT id FROM org_designations 
               WHERE organisation_id = $1 AND LOWER(name) = LOWER($2) 
               LIMIT 1`,
              [orgId, des.name]
            );

            let designationId;
            if (desResult.rows.length > 0) {
              designationId = desResult.rows[0].id;
              // Update if exists
              await query(
                `UPDATE org_designations 
                 SET branch_id = COALESCE($1, branch_id), updated_at = now()
                 WHERE id = $2`,
                [des.branchId || null, designationId]
              );
            } else {
              // Insert if doesn't exist
              desResult = await query(
                `INSERT INTO org_designations (organisation_id, name, branch_id)
                 VALUES ($1, $2, $3)
                 RETURNING id`,
                [orgId, des.name, des.branchId || null]
              );
              designationId = desResult.rows[0].id;
            }

            // Create reporting line if specified
            if (des.reportsTo) {
              const parentResult = await query(
                'SELECT id FROM org_designations WHERE organisation_id = $1 AND LOWER(name) = LOWER($2) LIMIT 1',
                [orgId, des.reportsTo]
              );
              const parentId = parentResult.rows[0]?.id || null;

              if (parentId) {
                // Check if reporting line already exists
                const existingLine = await query(
                  `SELECT id FROM org_reporting_lines 
                   WHERE organisation_id = $1 AND designation_id = $2 AND parent_designation_id = $3
                   LIMIT 1`,
                  [orgId, designationId, parentId]
                );
                
                if (existingLine.rows.length === 0) {
                  await query(
                    `INSERT INTO org_reporting_lines (organisation_id, designation_id, parent_designation_id, branch_id)
                     VALUES ($1, $2, $3, $4)`,
                    [orgId, designationId, parentId, des.branchId || null]
                  );
                }
              }
            }
          }
        }
      }

      // Step 4: Create grades
      if (grades && Array.isArray(grades)) {
        for (const grade of grades) {
          if (grade.name) {
            // Check if grade already exists
            const existingGrade = await query(
              `SELECT id FROM org_grades 
               WHERE organisation_id = $1 AND LOWER(name) = LOWER($2) 
               LIMIT 1`,
              [orgId, grade.name]
            );
            
            if (existingGrade.rows.length > 0) {
              await query(
                `UPDATE org_grades 
                 SET level = $1, updated_at = now()
                 WHERE id = $2`,
                [grade.level || 1, existingGrade.rows[0].id]
              );
            } else {
              await query(
                `INSERT INTO org_grades (organisation_id, name, level, branch_id)
                 VALUES ($1, $2, $3, $4)`,
                [orgId, grade.name, grade.level || 1, grade.branchId || null]
              );
            }
          }
        }
      }

      // Step 5: Create employment types
      if (employmentTypes && Array.isArray(employmentTypes)) {
        for (const empType of employmentTypes) {
          const existing = await query(
            `SELECT id FROM org_employment_types 
             WHERE organisation_id = $1 AND LOWER(employment_type) = LOWER($2) 
             LIMIT 1`,
            [orgId, empType]
          );
          
          if (existing.rows.length === 0) {
            await query(
              `INSERT INTO org_employment_types (organisation_id, employment_type)
               VALUES ($1, $2)`,
              [orgId, empType]
            );
          }
        }
      }

      // Step 6: Create work locations
      if (workLocations && Array.isArray(workLocations)) {
        for (const location of workLocations) {
          const existing = await query(
            `SELECT id FROM org_work_locations 
             WHERE organisation_id = $1 AND LOWER(location_name) = LOWER($2) 
             LIMIT 1`,
            [orgId, location]
          );
          
          if (existing.rows.length === 0) {
            await query(
              `INSERT INTO org_work_locations (organisation_id, location_name)
               VALUES ($1, $2)`,
              [orgId, location]
            );
          }
        }
      }

      // Step 7: Create roles and permissions
      if (rolePermissions && Array.isArray(rolePermissions)) {
        for (const rolePerm of rolePermissions) {
          // Check if role exists
          let roleResult = await query(
            `SELECT id FROM org_roles 
             WHERE organisation_id = $1 AND LOWER(role_name) = LOWER($2) 
             LIMIT 1`,
            [orgId, rolePerm.roleName]
          );
          
          let roleId;
          if (roleResult.rows.length > 0) {
            roleId = roleResult.rows[0].id;
            await query(
              `UPDATE org_roles SET updated_at = now() WHERE id = $1`,
              [roleId]
            );
          } else {
            roleResult = await query(
              `INSERT INTO org_roles (organisation_id, role_name, is_system_role)
               VALUES ($1, $2, false)
               RETURNING id`,
              [orgId, rolePerm.roleName]
            );
            roleId = roleResult.rows[0].id;
          }

          // Create permissions
          const modules = ['hr', 'payroll', 'leave', 'attendance'];
          for (const module of modules) {
            const hasPermission = rolePerm.permissions?.[module] || false;
            const existingPerm = await query(
              `SELECT id FROM org_role_permissions 
               WHERE role_id = $1 AND module = $2 AND permission_type = 'approve'
               LIMIT 1`,
              [roleId, module]
            );
            
            if (existingPerm.rows.length > 0) {
              await query(
                `UPDATE org_role_permissions 
                 SET has_permission = $1, updated_at = now()
                 WHERE id = $2`,
                [hasPermission, existingPerm.rows[0].id]
              );
            } else {
              await query(
                `INSERT INTO org_role_permissions (organisation_id, role_id, module, permission_type, has_permission)
                 VALUES ($1, $2, $3, 'approve', $4)`,
                [orgId, roleId, module, hasPermission]
              );
            }
          }
        }
      }

      // Step 8: Create key employees if provided
      if (keyEmployees && Array.isArray(keyEmployees)) {
        for (const emp of keyEmployees) {
          if (emp.email && emp.firstName) {
            // Check if user exists
            const userResult = await query(
              'SELECT id FROM profiles WHERE email = $1',
              [emp.email.toLowerCase()]
            );

            if (userResult.rows.length === 0) {
              // Create user profile (password will be set separately)
              const newUserId = await query('SELECT gen_random_uuid() as id');
              const userId = newUserId.rows[0].id;

              await query(
                `INSERT INTO profiles (id, email, first_name, last_name, tenant_id)
                 VALUES ($1, $2, $3, $4, $5)`,
                [userId, emp.email.toLowerCase(), emp.firstName, emp.lastName || '', orgId]
              );

              // Assign role
              const existingRole = await query(
                `SELECT id FROM user_roles 
                 WHERE user_id = $1 AND role = $2 
                 LIMIT 1`,
                [userId, emp.role || 'hr']
              );
              
              if (existingRole.rows.length === 0) {
                await query(
                  `INSERT INTO user_roles (user_id, role, tenant_id)
                   VALUES ($1, $2, $3)`,
                  [userId, emp.role || 'hr', orgId]
                );
              }
            }
          }
        }
      }

      // Mark onboarding as complete in setup state (insert if missing, then mark complete with all steps done)
      const completedSteps = SETUP_STEPS.reduce((acc, step) => {
        acc[step.key] = {
          completed: true,
          skipped: false,
          optional: !!step.optional,
          data: {},
          updatedAt: new Date().toISOString(),
        };
        return acc;
      }, {});

      await query(
        `INSERT INTO org_setup_status (org_id, steps, current_step, is_completed, completed_at)
         VALUES ($1, $2::jsonb, 'review', true, now())
         ON CONFLICT (org_id) DO UPDATE
           SET is_completed = true,
               steps = $2::jsonb,
               completed_at = now(),
               current_step = 'review',
               updated_at = now()`,
        [orgId, JSON.stringify(completedSteps)]
      );

      await query('COMMIT');

      res.json({ success: true, message: 'Onboarding completed successfully' });
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }
  } catch (error) {
    console.error('Onboarding completion error:', error);
    res.status(500).json({ error: error.message || 'Failed to complete onboarding' });
  }
});

// Get onboarding data (for editing)
router.get('/data', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const profileResult = await query(
      'SELECT tenant_id FROM profiles WHERE id = $1',
      [userId]
    );

    if (profileResult.rows.length === 0 || !profileResult.rows[0].tenant_id) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const orgId = profileResult.rows[0].tenant_id;

    // Get organization info
    const orgResult = await query(
      `SELECT name, legal_name, registered_business_name, registration_number,
              gst_number, cin_number, registered_address, contact_phone, contact_email, website
       FROM organizations WHERE id = $1`,
      [orgId]
    );

    const org = orgResult.rows[0] || {};

    // Get departments
    const deptResult = await query(
      'SELECT id, name, branch_id FROM departments WHERE org_id = $1',
      [orgId]
    );

    // Get designations
    const desResult = await query(
      `SELECT d.id, d.name, d.branch_id, pd.name as reports_to_name
       FROM org_designations d
       LEFT JOIN org_reporting_lines r ON r.designation_id = d.id
       LEFT JOIN org_designations pd ON pd.id = r.parent_designation_id
       WHERE d.organisation_id = $1`,
      [orgId]
    );

    // Get grades
    const gradeResult = await query(
      'SELECT id, name, level, branch_id FROM org_grades WHERE organisation_id = $1',
      [orgId]
    );

    // Get employment types
    const empTypeResult = await query(
      'SELECT employment_type FROM org_employment_types WHERE organisation_id = $1 AND is_active = true',
      [orgId]
    );

    // Get work locations
    const locationResult = await query(
      'SELECT location_name FROM org_work_locations WHERE organisation_id = $1 AND is_active = true',
      [orgId]
    );

    // Get roles and permissions
    const roleResult = await query(
      `SELECT r.id, r.role_name, 
              jsonb_object_agg(p.module, p.has_permission) FILTER (WHERE p.module IS NOT NULL) as permissions
       FROM org_roles r
       LEFT JOIN org_role_permissions p ON p.role_id = r.id AND p.permission_type = 'approve'
       WHERE r.organisation_id = $1
       GROUP BY r.id, r.role_name`,
      [orgId]
    );

    res.json({
      companyInfo: {
        companyName: org.name || '',
        legalName: org.legal_name || '',
        registeredBusinessName: org.registered_business_name || '',
        registrationNumber: org.registration_number || '',
        gstNumber: org.gst_number || '',
        cinNumber: org.cin_number || '',
        registeredAddress: org.registered_address || '',
        phone: org.contact_phone || '',
        email: org.contact_email || '',
        website: org.website || '',
      },
      departments: deptResult.rows.map(r => ({ id: r.id, name: r.name, branchId: r.branch_id })),
      designations: desResult.rows.map(r => ({ id: r.id, name: r.name, branchId: r.branch_id, reportsTo: r.reports_to_name })),
      grades: gradeResult.rows.map(r => ({ id: r.id, name: r.name, level: r.level, branchId: r.branch_id })),
      employmentTypes: empTypeResult.rows.map(r => r.employment_type),
      workLocations: locationResult.rows.map(r => r.location_name),
      rolePermissions: roleResult.rows.map(r => ({
        roleName: r.role_name,
        permissions: r.permissions || {},
      })),
    });
  } catch (error) {
    console.error('Get onboarding data error:', error);
    res.status(500).json({ error: error.message || 'Failed to get onboarding data' });
  }
});

export default router;

