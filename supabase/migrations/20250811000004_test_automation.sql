-- Test migration to verify automated deployment

-- Add a simple comment field to test the automation workflow
-- This can be removed later once automation is confirmed working

ALTER TABLE calls ADD COLUMN IF NOT EXISTS automation_test_comment TEXT DEFAULT 'Migration automation working!';

-- Test automation trigger comment added