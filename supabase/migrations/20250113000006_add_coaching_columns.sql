-- Add coaching and OpenAI raw response columns to calls table
-- This enables storing the coaching feedback and raw OpenAI responses

-- Add coaching column to store AI coaching feedback
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS coaching jsonb;

-- Add openai_raw_response column to store full OpenAI response for debugging
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS openai_raw_response jsonb;

-- Update organization_id for any calls that don't have it set
UPDATE calls 
SET organization_id = (
  SELECT m.org_id 
  FROM memberships m 
  WHERE m.user_id = calls.user_id 
  LIMIT 1
)
WHERE organization_id IS NULL;

-- Success message
SELECT 'Coaching columns added successfully.' as status;