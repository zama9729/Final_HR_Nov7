-- Add run_type to payroll_cycles
ALTER TABLE public.payroll_cycles ADD COLUMN IF NOT EXISTS run_type TEXT CHECK (run_type IN ('regular', 'off_cycle', 'partial_payment')) DEFAULT 'regular';

-- Add partial_amount to payroll_items for tracking specifically if needed (optional but useful for explicit tracking)
-- We will rely on net_salary for now, but adding reference_gross might be useful if we want to freeze it?
-- For now, minimal change.
ALTER TABLE public.payroll_items
  ADD COLUMN IF NOT EXISTS metadata JSONB;
