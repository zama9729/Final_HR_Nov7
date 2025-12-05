-- Migration: Add CCA, Conveyance, and Medical Allowance to compensation_structures
-- Date: 2025-01-30

-- Add new allowance columns to compensation_structures
ALTER TABLE public.compensation_structures
  ADD COLUMN IF NOT EXISTS cca DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS conveyance DECIMAL(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS medical_allowance DECIMAL(12,2) DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.compensation_structures.cca IS 'City Compensatory Allowance - Monthly amount';
COMMENT ON COLUMN public.compensation_structures.conveyance IS 'Conveyance Allowance - Monthly amount';
COMMENT ON COLUMN public.compensation_structures.medical_allowance IS 'Medical Allowance - Monthly amount';

