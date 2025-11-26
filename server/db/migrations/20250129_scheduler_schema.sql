-- Daily roster & scheduler core schema

DO $$ BEGIN
    CREATE TYPE scheduler_run_status AS ENUM ('queued','running','completed','failed');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE schedule_status AS ENUM ('draft','published','archived');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
    CREATE TYPE assignment_source AS ENUM ('auto','manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS schedule_templates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    description TEXT,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    coverage_plan JSONB NOT NULL DEFAULT '[]'::jsonb,
    rest_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    constraint_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    preference_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_by UUID REFERENCES profiles(id),
    updated_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_templates_tenant ON schedule_templates(tenant_id);

CREATE TABLE IF NOT EXISTS schedule_template_rules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    template_id UUID NOT NULL REFERENCES schedule_templates(id) ON DELETE CASCADE,
    rule_type TEXT NOT NULL,
    rule_key TEXT,
    rule_payload JSONB NOT NULL DEFAULT '{}'::jsonb,
    weight INTEGER DEFAULT 0,
    is_hard BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_template_rules_template ON schedule_template_rules(template_id);
CREATE INDEX IF NOT EXISTS idx_schedule_template_rules_type ON schedule_template_rules(rule_type);

CREATE TABLE IF NOT EXISTS employee_schedule_preferences (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    availability JSONB NOT NULL DEFAULT '[]'::jsonb,
    week_off_pattern JSONB NOT NULL DEFAULT '[]'::jsonb,
    max_hours_per_week INTEGER,
    max_consecutive_shifts INTEGER,
    max_consecutive_nights INTEGER,
    min_rest_hours INTEGER,
    preferred_shift_types JSONB NOT NULL DEFAULT '[]'::jsonb,
    preferred_locations JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    source TEXT DEFAULT 'self',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (tenant_id, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_employee_schedule_preferences_tenant ON employee_schedule_preferences(tenant_id);
CREATE INDEX IF NOT EXISTS idx_employee_schedule_preferences_employee ON employee_schedule_preferences(employee_id);

CREATE TABLE IF NOT EXISTS scheduler_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    template_id UUID REFERENCES schedule_templates(id) ON DELETE SET NULL,
    schedule_id UUID,
    requested_by UUID REFERENCES profiles(id),
    status scheduler_run_status NOT NULL DEFAULT 'queued',
    preserve_manual_edits BOOLEAN NOT NULL DEFAULT false,
    seed BIGINT,
    parameters JSONB NOT NULL DEFAULT '{}'::jsonb,
    summary JSONB NOT NULL DEFAULT '{}'::jsonb,
    conflict_count INTEGER NOT NULL DEFAULT 0,
    warning_count INTEGER NOT NULL DEFAULT 0,
    error_message TEXT,
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduler_runs_tenant ON scheduler_runs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scheduler_runs_template ON scheduler_runs(template_id);
CREATE INDEX IF NOT EXISTS idx_scheduler_runs_status ON scheduler_runs(status);

CREATE TABLE IF NOT EXISTS schedules (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    template_id UUID REFERENCES schedule_templates(id) ON DELETE SET NULL,
    run_id UUID REFERENCES scheduler_runs(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    status schedule_status NOT NULL DEFAULT 'draft',
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    timezone TEXT NOT NULL DEFAULT 'UTC',
    version INTEGER NOT NULL DEFAULT 1,
    source assignment_source NOT NULL DEFAULT 'auto',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    published_by UUID REFERENCES profiles(id),
    published_at TIMESTAMPTZ,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedules_tenant ON schedules(tenant_id);
CREATE INDEX IF NOT EXISTS idx_schedules_status ON schedules(status);
CREATE INDEX IF NOT EXISTS idx_schedules_date_range ON schedules(tenant_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS schedule_slots (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    shift_date DATE NOT NULL,
    shift_id UUID REFERENCES shifts(id) ON DELETE SET NULL,
    template_rule_id UUID REFERENCES schedule_template_rules(id) ON DELETE SET NULL,
    shift_name TEXT,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    is_night BOOLEAN NOT NULL DEFAULT false,
    required_skill TEXT,
    coverage_required INTEGER NOT NULL DEFAULT 1,
    position_index INTEGER NOT NULL DEFAULT 0,
    assigned_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    assignment_source assignment_source NOT NULL DEFAULT 'auto',
    assignment_status TEXT NOT NULL DEFAULT 'assigned',
    manual_lock BOOLEAN NOT NULL DEFAULT false,
    conflict_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    warning_flags JSONB NOT NULL DEFAULT '[]'::jsonb,
    notes TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE schedule_slots
    ADD CONSTRAINT schedule_slots_assignment_status_check
    CHECK (assignment_status IN ('assigned','unassigned','conflict','warning'));

CREATE INDEX IF NOT EXISTS idx_schedule_slots_schedule ON schedule_slots(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_date ON schedule_slots(shift_date);
CREATE INDEX IF NOT EXISTS idx_schedule_slots_employee ON schedule_slots(assigned_employee_id);

CREATE TABLE IF NOT EXISTS schedule_conflicts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    schedule_id UUID NOT NULL REFERENCES schedules(id) ON DELETE CASCADE,
    slot_id UUID REFERENCES schedule_slots(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
    conflict_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'warning',
    details JSONB NOT NULL DEFAULT '{}'::jsonb,
    resolved BOOLEAN NOT NULL DEFAULT false,
    resolved_by UUID REFERENCES profiles(id),
    resolved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_schedule ON schedule_conflicts(schedule_id);
CREATE INDEX IF NOT EXISTS idx_schedule_conflicts_slot ON schedule_conflicts(slot_id);

ALTER TABLE scheduler_runs
    ADD CONSTRAINT scheduler_runs_schedule_fk
    FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE SET NULL;

