-- Add video support to resources table
-- This enables video file uploads and YouTube/Vimeo links

-- Add new columns for video support
ALTER TABLE resources 
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS resource_type VARCHAR(10) DEFAULT 'file' CHECK (resource_type IN ('file', 'video', 'url'));

-- Update storage bucket to allow video file types
UPDATE storage.buckets 
SET allowed_mime_types = ARRAY[
  -- Existing document types
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  -- Image types for favicons and branding (already added)
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
  -- Video types for video resources
  'video/mp4',
  'video/mpeg',
  'video/quicktime',
  'video/x-msvideo',
  'video/webm',
  'video/ogg'
],
-- Increase file size limit to 100MB to accommodate video files
file_size_limit = 104857600  -- 100MB in bytes
WHERE id = 'resources';

-- Add index for faster querying by resource type
CREATE INDEX IF NOT EXISTS idx_resources_resource_type ON resources(resource_type);

-- Add comment for documentation
COMMENT ON COLUMN resources.video_url IS 'URL for YouTube/Vimeo videos when resource_type is url';
COMMENT ON COLUMN resources.resource_type IS 'Type of resource: file (document), video (uploaded video), or url (YouTube/Vimeo)';