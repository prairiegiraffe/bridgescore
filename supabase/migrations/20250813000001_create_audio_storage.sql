-- Create storage bucket for call audio files
INSERT INTO storage.buckets (id, name, public)
VALUES ('call-audio', 'call-audio', true)
ON CONFLICT (id) DO NOTHING;

-- Set up storage policies for call audio files
DROP POLICY IF EXISTS "Anyone can view call audio" ON storage.objects;
CREATE POLICY "Anyone can view call audio" ON storage.objects
FOR SELECT USING (bucket_id = 'call-audio');

DROP POLICY IF EXISTS "Authenticated users can upload call audio" ON storage.objects;
CREATE POLICY "Authenticated users can upload call audio" ON storage.objects
FOR INSERT WITH CHECK (
  bucket_id = 'call-audio' 
  AND auth.role() = 'authenticated'
  AND (storage.foldername(name))[1] = 'calls'
);

DROP POLICY IF EXISTS "Users can delete their own call audio" ON storage.objects;
CREATE POLICY "Users can delete their own call audio" ON storage.objects
FOR DELETE USING (
  bucket_id = 'call-audio' 
  AND auth.role() = 'authenticated'
);

-- Add audio_file_url column to calls table if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'calls' AND column_name = 'audio_file_url'
  ) THEN
    ALTER TABLE calls ADD COLUMN audio_file_url TEXT;
  END IF;
END $$;