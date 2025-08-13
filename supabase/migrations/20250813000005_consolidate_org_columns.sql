-- Consolidate organization/client ID confusion in calls table
-- The app uses org_id consistently, so we'll make that the standard

-- Step 1: Ensure all calls have org_id populated from other ID columns
UPDATE calls 
SET org_id = organization_id 
WHERE org_id IS NULL AND organization_id IS NOT NULL;

-- Step 2: For any calls that only have client_id, try to map to org_id
-- First, we need to find the mapping from clients to organizations
UPDATE calls 
SET org_id = (
  SELECT o.id 
  FROM organizations o 
  WHERE o.client_id = calls.client_id
  LIMIT 1
)
WHERE org_id IS NULL AND client_id IS NOT NULL;

-- Step 3: Add index on org_id if it doesn't exist (critical for performance)
CREATE INDEX IF NOT EXISTS idx_calls_org_id ON calls(org_id);

-- Step 4: Add a comment to document the standard column
COMMENT ON COLUMN calls.org_id IS 'Primary organization reference - use this column for all queries';

-- Step 5: Mark the other columns as deprecated (but don't drop them yet for safety)
COMMENT ON COLUMN calls.client_id IS 'DEPRECATED - Use org_id instead';
COMMENT ON COLUMN calls.organization_id IS 'DEPRECATED - Use org_id instead';

-- Step 6: Add a check to prevent future confusion
-- This ensures new records use org_id
ALTER TABLE calls 
ADD CONSTRAINT calls_org_id_required 
CHECK (org_id IS NOT NULL OR (created_at < '2025-08-13'::date));

-- Step 7: Create a function to ensure consistent org_id population
CREATE OR REPLACE FUNCTION ensure_calls_org_id() 
RETURNS TRIGGER AS $$
BEGIN
  -- If org_id is null but organization_id is set, use that
  IF NEW.org_id IS NULL AND NEW.organization_id IS NOT NULL THEN
    NEW.org_id := NEW.organization_id;
  END IF;
  
  -- If org_id is still null but client_id is set, try to map it
  IF NEW.org_id IS NULL AND NEW.client_id IS NOT NULL THEN
    SELECT o.id INTO NEW.org_id 
    FROM organizations o 
    WHERE o.client_id = NEW.client_id 
    LIMIT 1;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Step 8: Add trigger to automatically populate org_id
DROP TRIGGER IF EXISTS trigger_ensure_calls_org_id ON calls;
CREATE TRIGGER trigger_ensure_calls_org_id
  BEFORE INSERT OR UPDATE ON calls
  FOR EACH ROW
  EXECUTE FUNCTION ensure_calls_org_id();