-- 2026-01-02 Final bootstrap migration for Payroll app
-- Ensures newer optional columns exist for audit logs and payroll items.

-- Ensure details JSONB on audit_logs (used for richer audit payloads)
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS details JSONB;

-- Ensure metadata JSONB on payroll_items (used for DA/LTA/bonus/advance info)
ALTER TABLE public.payroll_items
  ADD COLUMN IF NOT EXISTS metadata JSONB;


