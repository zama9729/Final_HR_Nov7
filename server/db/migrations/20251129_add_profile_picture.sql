-- Migration: Add Profile Picture Support with RLS
-- Date: 2025-11-29

-- Add profile_picture_url column to profiles table
ALTER TABLE profiles
    ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

-- Add index for faster lookups
CREATE INDEX IF NOT EXISTS idx_profiles_profile_picture_url 
    ON profiles(profile_picture_url) 
    WHERE profile_picture_url IS NOT NULL;

-- Add comment
COMMENT ON COLUMN profiles.profile_picture_url IS 'URL to profile picture stored in MinIO/S3. Access controlled by tenant_id (RLS).';

