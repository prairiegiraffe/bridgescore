-- Add banner image support to organizations
-- This enables organizations to upload custom banner images for their pages

-- Add banner_image_url column to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS banner_image_url TEXT;

-- Add comment for documentation
COMMENT ON COLUMN organizations.banner_image_url IS 'URL for organization banner image displayed on Dashboard, Call Detail, and Resources pages';