-- Migration: Add PIN support for Payroll users
-- Description: Adds pin_hash and pin_set_at columns to users table for 6-digit PIN authentication

-- Add PIN columns to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS pin_hash VARCHAR(255),
ADD COLUMN IF NOT EXISTS pin_set_at TIMESTAMPTZ;

-- Add index for PIN lookups (optional, for performance)
CREATE INDEX IF NOT EXISTS idx_users_pin_set ON users(pin_set_at) WHERE pin_hash IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN users.pin_hash IS 'BCrypt hash of 6-digit PIN for Payroll authentication';
COMMENT ON COLUMN users.pin_set_at IS 'Timestamp when PIN was set';


