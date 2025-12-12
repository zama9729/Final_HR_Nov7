-- Add profile_picture_url column to profiles table
-- This column stores the URL/path to the user's profile picture

ALTER TABLE profiles ADD COLUMN IF NOT EXISTS profile_picture_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN profiles.profile_picture_url IS 'URL or path to the user profile picture stored in MinIO/S3';

