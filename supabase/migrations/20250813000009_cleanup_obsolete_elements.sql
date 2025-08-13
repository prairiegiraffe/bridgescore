-- Clean up redundant/obsolete tables, views, and functions

-- Step 1: Clean up backup tables left from migrations (if they exist)
-- These were created during the architecture simplification but are no longer needed
DROP TABLE IF EXISTS backup_organizations CASCADE;
DROP TABLE IF EXISTS backup_clients CASCADE;

-- Step 2: Drop obsolete functions that don't work or are placeholders
DROP FUNCTION IF EXISTS invite_user_placeholder();
DROP FUNCTION IF EXISTS create_user_as_superadmin(text, text, text);

-- Step 3: Clean up any orphaned data from the old client/organization dual model
-- Remove calls that reference non-existent organizations via the old columns
UPDATE calls 
SET client_id = NULL 
WHERE client_id IS NOT NULL 
AND client_id NOT IN (SELECT id FROM clients WHERE clients.id IS NOT NULL);

UPDATE calls 
SET organization_id = NULL 
WHERE organization_id IS NOT NULL 
AND organization_id NOT IN (SELECT id FROM organizations WHERE organizations.id IS NOT NULL);

-- Step 4: Check if clients table is still being used
-- If it has no data or only has data that's been migrated to organizations, we could mark it
DO $$
DECLARE
    client_count integer;
    org_with_client_count integer;
BEGIN
    SELECT COUNT(*) INTO client_count FROM clients;
    SELECT COUNT(*) INTO org_with_client_count FROM organizations WHERE client_id IS NOT NULL;
    
    -- Add a comment indicating the status
    IF client_count = 0 THEN
        COMMENT ON TABLE clients IS 'OBSOLETE: This table is empty and could be dropped';
    ELSIF client_count = org_with_client_count THEN
        COMMENT ON TABLE clients IS 'MIGRATION COMPLETE: All clients have been migrated to organizations';
    ELSE
        COMMENT ON TABLE clients IS 'ACTIVE: Contains data not yet migrated to organizations';
    END IF;
END $$;

-- Step 5: Simplify the organization_details view
-- Remove any references to deprecated client-related columns
DROP VIEW IF EXISTS organization_details CASCADE;
CREATE VIEW organization_details AS
SELECT 
  o.id,
  o.name,
  o.domain,
  o.logo_url,
  o.primary_color,
  o.secondary_color,
  o.bridge_steps,
  o.openai_assistant_id,
  o.openai_vector_store_id,
  o.openai_model,
  o.created_by,
  o.created_at,
  o.is_demo,
  -- Count of active members
  COUNT(m.user_id) as member_count
FROM organizations o
LEFT JOIN memberships m ON m.org_id = o.id
GROUP BY o.id, o.name, o.domain, o.logo_url, o.primary_color, o.secondary_color, 
         o.bridge_steps, o.openai_assistant_id, o.openai_vector_store_id, o.openai_model,
         o.created_by, o.created_at, o.is_demo;

-- Step 6: Clean up any unused indexes that might have been created during migrations
-- Drop indexes on deprecated columns (but be safe about it)
DROP INDEX IF EXISTS idx_calls_client_id;
DROP INDEX IF EXISTS idx_calls_organization_id_old;

-- Step 7: Remove any test/demo data that shouldn't be in production
-- Only remove clearly marked test data
DELETE FROM organizations WHERE name ILIKE '%test%' AND is_demo = true;
DELETE FROM calls WHERE title ILIKE '%test call%' AND created_at < (NOW() - INTERVAL '7 days');

-- Step 8: Optimize table storage by removing bloat
-- This analyzes tables and updates statistics
ANALYZE calls;
ANALYZE organizations;
ANALYZE memberships;
ANALYZE profiles;
ANALYZE resources;
ANALYZE saved_views;

-- Step 9: Add helpful comments for future maintenance
COMMENT ON TABLE calls IS 'Sales call records with scores and transcripts. Use org_id for organization relationships.';
COMMENT ON TABLE organizations IS 'Customer organizations. Primary entity for multitenancy.';
COMMENT ON TABLE memberships IS 'User-organization relationships with roles.';
COMMENT ON TABLE profiles IS 'User profile data synchronized with auth.users.';
COMMENT ON TABLE resources IS 'Organization-specific resources and documents.';
COMMENT ON TABLE saved_views IS 'User-saved filter configurations for the dashboard.';

COMMENT ON COLUMN calls.org_id IS 'PRIMARY: Organization reference - use this column';
COMMENT ON COLUMN calls.client_id IS 'DEPRECATED: Use org_id instead';
COMMENT ON COLUMN calls.organization_id IS 'DEPRECATED: Use org_id instead';

-- Step 10: Create a maintenance function for periodic cleanup
CREATE OR REPLACE FUNCTION cleanup_obsolete_data() 
RETURNS void AS $$
BEGIN
  -- Clean up old calls with no scores after 90 days
  DELETE FROM calls 
  WHERE score_total IS NULL 
  AND transcript IS NULL 
  AND created_at < (NOW() - INTERVAL '90 days');
  
  -- Clean up old user files that are no longer referenced
  DELETE FROM user_files 
  WHERE created_at < (NOW() - INTERVAL '180 days')
  AND user_id NOT IN (SELECT id FROM auth.users);
  
  -- Update statistics
  ANALYZE calls;
  ANALYZE user_files;
  
  RAISE NOTICE 'Cleanup completed at %', NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 11: Set up a comment with cleanup schedule recommendation
COMMENT ON FUNCTION cleanup_obsolete_data() IS 'Run monthly to clean up old data: SELECT cleanup_obsolete_data();';