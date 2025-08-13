-- Create storage bucket for resources
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'resources',
  'resources',
  true,
  10485760, -- 10MB in bytes
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Drop existing policies if they exist and recreate them
DO $$
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "Anyone can view resources" ON storage.objects;
    DROP POLICY IF EXISTS "SuperAdmins can upload resources" ON storage.objects;
    DROP POLICY IF EXISTS "SuperAdmins can update resources" ON storage.objects;
    DROP POLICY IF EXISTS "SuperAdmins can delete resources" ON storage.objects;
END $$;

-- Set up RLS policies for the resources bucket
CREATE POLICY "Anyone can view resources" ON storage.objects
FOR SELECT USING (bucket_id = 'resources');

CREATE POLICY "SuperAdmins can upload resources" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'resources' 
  AND EXISTS (
    SELECT 1 FROM memberships 
    WHERE user_id = auth.uid() 
    AND is_superadmin = true
  )
);

CREATE POLICY "SuperAdmins can update resources" ON storage.objects
FOR UPDATE USING (
  bucket_id = 'resources' 
  AND EXISTS (
    SELECT 1 FROM memberships 
    WHERE user_id = auth.uid() 
    AND is_superadmin = true
  )
);

CREATE POLICY "SuperAdmins can delete resources" ON storage.objects
FOR DELETE USING (
  bucket_id = 'resources' 
  AND EXISTS (
    SELECT 1 FROM memberships 
    WHERE user_id = auth.uid() 
    AND is_superadmin = true
  )
);