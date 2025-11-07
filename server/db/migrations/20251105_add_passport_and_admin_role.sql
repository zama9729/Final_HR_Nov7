-- Migration: Add passport field to onboarding_data and admin role to app_role enum

-- Add admin role to app_role enum
ALTER TYPE app_role ADD VALUE IF NOT EXISTS 'admin';

-- Add passport_number column to onboarding_data table
ALTER TABLE onboarding_data 
  ADD COLUMN IF NOT EXISTS passport_number TEXT;

