/**
 * Create scheduling module tables if they don't exist
 */

import { query } from '../db/pool.js';

export async function createSchedulingTables() {
  try {
    // Execute migration statements one by one to avoid syntax errors
    // Start with function creation (if needed)
    await query(`
      CREATE OR REPLACE FUNCTION update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = now();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Shift Templates
    await query(`
      CREATE TABLE IF NOT EXISTS shift_templates (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        shift_type TEXT NOT NULL CHECK (shift_type IN ('day', 'evening', 'night', 'custom')),
        duration_hours DECIMAL(4,2),
        crosses_midnight BOOLEAN NOT NULL DEFAULT false,
        is_default BOOLEAN NOT NULL DEFAULT false,
        team_id UUID REFERENCES teams(id) ON DELETE SET NULL,
        branch_id UUID REFERENCES org_branches(id) ON DELETE SET NULL,
        created_by UUID REFERENCES profiles(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Create unique constraint separately to avoid issues
    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'shift_templates_tenant_name_team_branch_key'
        ) THEN
          ALTER TABLE shift_templates 
          ADD CONSTRAINT shift_templates_tenant_name_team_branch_key 
          UNIQUE(tenant_id, name, team_id, branch_id);
        END IF;
      END $$;
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_shift_templates_tenant ON shift_templates(tenant_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_shift_templates_team ON shift_templates(team_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_shift_templates_branch ON shift_templates(branch_id);`);

    // Scheduling Rule Sets
    await query(`
      CREATE TABLE IF NOT EXISTS scheduling_rule_sets (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        description TEXT,
        is_default BOOLEAN NOT NULL DEFAULT false,
        rules JSONB NOT NULL DEFAULT '[]'::jsonb,
        created_by UUID REFERENCES profiles(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'scheduling_rule_sets_tenant_name_key'
        ) THEN
          ALTER TABLE scheduling_rule_sets 
          ADD CONSTRAINT scheduling_rule_sets_tenant_name_key 
          UNIQUE(tenant_id, name);
        END IF;
      END $$;
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_rule_sets_tenant ON scheduling_rule_sets(tenant_id);`);

    // Employee Availability
    await query(`
      CREATE TABLE IF NOT EXISTS employee_availability (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        date DATE NOT NULL,
        start_time TIME,
        end_time TIME,
        availability_type TEXT NOT NULL CHECK (availability_type IN ('available', 'unavailable', 'preferred', 'blackout')),
        shift_template_id UUID REFERENCES shift_templates(id) ON DELETE SET NULL,
        is_pinned BOOLEAN NOT NULL DEFAULT false,
        is_forbidden BOOLEAN NOT NULL DEFAULT false,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'employee_availability_employee_date_start_end_key'
        ) THEN
          ALTER TABLE employee_availability 
          ADD CONSTRAINT employee_availability_employee_date_start_end_key 
          UNIQUE(employee_id, date, start_time, end_time);
        END IF;
      END $$;
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_availability_employee ON employee_availability(employee_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_availability_date ON employee_availability(date);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_availability_tenant ON employee_availability(tenant_id);`);

    // Generated Schedules
    await query(`
      CREATE TABLE IF NOT EXISTS generated_schedules (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        week_start_date DATE NOT NULL,
        week_end_date DATE NOT NULL,
        rule_set_id UUID NOT NULL REFERENCES scheduling_rule_sets(id) ON DELETE RESTRICT,
        algorithm_used TEXT NOT NULL CHECK (algorithm_used IN ('greedy', 'ilp', 'simulated_annealing', 'genetic', 'manual')),
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'active', 'archived')),
        score DECIMAL(10,2),
        violated_hard_constraints JSONB DEFAULT '[]'::jsonb,
        violated_soft_constraints JSONB DEFAULT '[]'::jsonb,
        telemetry JSONB,
        approved_by UUID REFERENCES profiles(id),
        approved_at TIMESTAMPTZ,
        created_by UUID REFERENCES profiles(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_schedules_tenant ON generated_schedules(tenant_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_schedules_week ON generated_schedules(week_start_date, week_end_date);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_schedules_status ON generated_schedules(status);`);

    // Schedule Assignments
    await query(`
      CREATE TABLE IF NOT EXISTS schedule_assignments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        schedule_id UUID NOT NULL REFERENCES generated_schedules(id) ON DELETE CASCADE,
        tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        shift_date DATE NOT NULL,
        shift_template_id UUID NOT NULL REFERENCES shift_templates(id) ON DELETE RESTRICT,
        start_time TIME NOT NULL,
        end_time TIME NOT NULL,
        assigned_by TEXT NOT NULL CHECK (assigned_by IN ('algorithm', 'manual', 'system')),
        assigned_by_user_id UUID REFERENCES profiles(id),
        role TEXT,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint 
          WHERE conname = 'schedule_assignments_schedule_employee_date_start_key'
        ) THEN
          ALTER TABLE schedule_assignments 
          ADD CONSTRAINT schedule_assignments_schedule_employee_date_start_key 
          UNIQUE(schedule_id, employee_id, shift_date, start_time);
        END IF;
      END $$;
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_assignments_schedule ON schedule_assignments(schedule_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_assignments_employee ON schedule_assignments(employee_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_assignments_date ON schedule_assignments(shift_date);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_assignments_tenant ON schedule_assignments(tenant_id);`);

    // Schedule Exceptions
    await query(`
      CREATE TABLE IF NOT EXISTS schedule_exceptions (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        schedule_id UUID REFERENCES generated_schedules(id) ON DELETE CASCADE,
        employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
        rule_id TEXT NOT NULL,
        exception_type TEXT NOT NULL CHECK (exception_type IN ('allow_violation', 'force_assignment', 'prevent_assignment')),
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
        approved_by UUID REFERENCES profiles(id),
        approved_at TIMESTAMPTZ,
        requested_by UUID REFERENCES profiles(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_exceptions_schedule ON schedule_exceptions(schedule_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_exceptions_employee ON schedule_exceptions(employee_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_exceptions_status ON schedule_exceptions(status);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_exceptions_tenant ON schedule_exceptions(tenant_id);`);

    // Schedule Audit Log
    await query(`
      CREATE TABLE IF NOT EXISTS schedule_audit_log (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        schedule_id UUID REFERENCES generated_schedules(id) ON DELETE SET NULL,
        assignment_id UUID REFERENCES schedule_assignments(id) ON DELETE SET NULL,
        action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'approve', 'reject', 'swap', 'manual_edit', 'exception_request', 'exception_approve', 'exception_reject')),
        entity_type TEXT NOT NULL CHECK (entity_type IN ('schedule', 'assignment', 'exception', 'template', 'rule_set')),
        entity_id UUID,
        changes JSONB,
        reason TEXT,
        created_by UUID REFERENCES profiles(id),
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_audit_schedule ON schedule_audit_log(schedule_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_tenant ON schedule_audit_log(tenant_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_audit_created_at ON schedule_audit_log(created_at);`);

    // Demand Requirements
    await query(`
      CREATE TABLE IF NOT EXISTS shift_demand_requirements (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
        shift_template_id UUID NOT NULL REFERENCES shift_templates(id) ON DELETE CASCADE,
        day_of_week INTEGER NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
        required_count INTEGER NOT NULL DEFAULT 1,
        required_roles TEXT[],
        branch_id UUID REFERENCES org_branches(id) ON DELETE CASCADE,
        team_id UUID REFERENCES teams(id) ON DELETE CASCADE,
        effective_from DATE,
        effective_to DATE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      );
    `);

    // Create unique constraint for demand requirements
    // Skip complex unique index with COALESCE - handle uniqueness at application level
    // Create a simple non-unique index for performance instead
    await query(`
      DO $$
      BEGIN
        -- Just create a regular index for performance
        -- Uniqueness will be enforced at application level
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE indexname = 'idx_demand_unique_lookup'
        ) THEN
          CREATE INDEX idx_demand_unique_lookup 
          ON shift_demand_requirements(tenant_id, shift_template_id, day_of_week, branch_id, team_id, effective_from);
        END IF;
      END $$;
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_demand_template ON shift_demand_requirements(shift_template_id);`);
    await query(`CREATE INDEX IF NOT EXISTS idx_demand_tenant ON shift_demand_requirements(tenant_id);`);

    // Create triggers
    await query(`
      DROP TRIGGER IF EXISTS update_shift_templates_updated_at ON shift_templates;
      CREATE TRIGGER update_shift_templates_updated_at
        BEFORE UPDATE ON shift_templates
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await query(`
      DROP TRIGGER IF EXISTS update_rule_sets_updated_at ON scheduling_rule_sets;
      CREATE TRIGGER update_rule_sets_updated_at
        BEFORE UPDATE ON scheduling_rule_sets
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await query(`
      DROP TRIGGER IF EXISTS update_availability_updated_at ON employee_availability;
      CREATE TRIGGER update_availability_updated_at
        BEFORE UPDATE ON employee_availability
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await query(`
      DROP TRIGGER IF EXISTS update_schedules_updated_at ON generated_schedules;
      CREATE TRIGGER update_schedules_updated_at
        BEFORE UPDATE ON generated_schedules
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await query(`
      DROP TRIGGER IF EXISTS update_assignments_updated_at ON schedule_assignments;
      CREATE TRIGGER update_assignments_updated_at
        BEFORE UPDATE ON schedule_assignments
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await query(`
      DROP TRIGGER IF EXISTS update_exceptions_updated_at ON schedule_exceptions;
      CREATE TRIGGER update_exceptions_updated_at
        BEFORE UPDATE ON schedule_exceptions
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    await query(`
      DROP TRIGGER IF EXISTS update_demand_updated_at ON shift_demand_requirements;
      CREATE TRIGGER update_demand_updated_at
        BEFORE UPDATE ON shift_demand_requirements
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);
    
    console.log('✅ Scheduling tables created successfully');
    return true;
  } catch (error) {
    console.error('Error creating scheduling tables:', error);
    throw error;
  }
}

