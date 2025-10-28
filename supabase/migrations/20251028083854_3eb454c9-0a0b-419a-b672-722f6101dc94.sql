-- Add 'not_started' to onboarding_status enum
ALTER TYPE onboarding_status ADD VALUE IF NOT EXISTS 'not_started';

-- Add security question columns to profiles table
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS security_question_1 TEXT,
ADD COLUMN IF NOT EXISTS security_answer_1 TEXT,
ADD COLUMN IF NOT EXISTS security_question_2 TEXT,
ADD COLUMN IF NOT EXISTS security_answer_2 TEXT;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_employees_onboarding_status ON public.employees(onboarding_status);