-- Advance Salary & EMI Module
-- Creates table for managing salary advances and EMI deductions

-- Create enum type for advance status
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'advance_status_enum') THEN
        CREATE TYPE advance_status_enum AS ENUM ('active', 'completed', 'cancelled');
    END IF;
END$$;

-- Create salary_advances table
CREATE TABLE IF NOT EXISTS salary_advances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID REFERENCES employees(id) ON DELETE CASCADE NOT NULL,
    tenant_id UUID REFERENCES organizations(id) ON DELETE CASCADE NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    tenure_months INTEGER NOT NULL CHECK (tenure_months > 0),
    monthly_emi NUMERIC(12,2) NOT NULL,
    paid_amount NUMERIC(12,2) DEFAULT 0 CHECK (paid_amount >= 0),
    remaining_amount NUMERIC(12,2) GENERATED ALWAYS AS (total_amount - paid_amount) STORED,
    status advance_status_enum NOT NULL DEFAULT 'active',
    start_month DATE NOT NULL,
    disbursement_date DATE NOT NULL,
    notes TEXT,
    created_by UUID REFERENCES profiles(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now(),
    CONSTRAINT check_paid_not_exceed_total CHECK (paid_amount <= total_amount)
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_salary_advances_employee ON salary_advances(employee_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_status ON salary_advances(status);
CREATE INDEX IF NOT EXISTS idx_salary_advances_tenant ON salary_advances(tenant_id);
CREATE INDEX IF NOT EXISTS idx_salary_advances_start_month ON salary_advances(start_month);
CREATE INDEX IF NOT EXISTS idx_salary_advances_active_employee ON salary_advances(employee_id, status) WHERE status = 'active';

-- Add comments for documentation
COMMENT ON TABLE salary_advances IS 'Stores salary advances granted to employees with EMI repayment schedule';
COMMENT ON COLUMN salary_advances.total_amount IS 'Total advance amount granted';
COMMENT ON COLUMN salary_advances.tenure_months IS 'Number of months for repayment';
COMMENT ON COLUMN salary_advances.monthly_emi IS 'Monthly EMI amount (0% interest)';
COMMENT ON COLUMN salary_advances.paid_amount IS 'Total amount repaid so far';
COMMENT ON COLUMN salary_advances.remaining_amount IS 'Calculated remaining amount (total - paid)';
COMMENT ON COLUMN salary_advances.status IS 'Status: active (repayment ongoing), completed (fully repaid), cancelled';
COMMENT ON COLUMN salary_advances.start_month IS 'Month when EMI deductions begin (first day of month)';
COMMENT ON COLUMN salary_advances.disbursement_date IS 'Date when advance was disbursed to employee';

