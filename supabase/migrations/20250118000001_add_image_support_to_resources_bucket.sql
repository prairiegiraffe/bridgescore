-- Add image MIME types to resources bucket for favicon and branding support
-- This allows SuperAdmins to upload favicons and other branding images

UPDATE storage.buckets 
SET allowed_mime_types = ARRAY[
  -- Existing document types
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-powerpoint',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  -- Image types for favicons and branding
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon'
]
WHERE id = 'resources';