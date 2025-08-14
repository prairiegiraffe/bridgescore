-- Drop view first, then remove is_demo column, then recreate view

-- STEP 1: Show current state
DO $$
DECLARE
  org_record RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== CURRENT STATE BEFORE CLEANUP ===';
  
  FOR org_record IN SELECT name, is_demo, demo_mode FROM organizations LOOP
    RAISE NOTICE 'Org "%": is_demo=%, demo_mode=%', 
      org_record.name, org_record.is_demo, org_record.demo_mode;
  END LOOP;
END $$;

-- STEP 2: Drop the view that depends on is_demo column
DROP VIEW IF EXISTS organization_details CASCADE;

-- STEP 3: Migrate and drop column
DO $$
BEGIN
  -- Migrate is_demo to demo_mode if needed
  UPDATE organizations 
  SET demo_mode = true 
  WHERE is_demo = true AND demo_mode = false;
  
  RAISE NOTICE 'Migrated is_demo values to demo_mode';

  -- Now we can safely drop the is_demo column
  ALTER TABLE organizations DROP COLUMN is_demo;
  
  RAISE NOTICE 'Dropped is_demo column successfully';
END $$;

-- STEP 4: Recreate the view with only demo_mode
CREATE VIEW organization_details AS
SELECT 
  o.id,
  o.name,
  o.domain,
  o.primary_color,
  o.secondary_color,
  o.bridge_steps,
  o.openai_assistant_id,
  o.openai_vector_store_id,
  o.openai_model,
  o.demo_mode,  -- Only this column now
  o.created_at,
  (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id) as member_count
FROM organizations o
WHERE o.id IN (
  SELECT org_id FROM memberships 
  WHERE user_id = auth.uid()
);

-- Grant permissions
GRANT SELECT ON organization_details TO authenticated;

-- STEP 5: Final verification
DO $$
DECLARE
  org_record RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== FINAL STATUS ===';
  
  -- Check column existence
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'is_demo'
  ) THEN
    RAISE NOTICE '❌ is_demo column still exists!';
  ELSE
    RAISE NOTICE '✅ is_demo column removed successfully';
  END IF;
  
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'demo_mode'
  ) THEN
    RAISE NOTICE '✅ demo_mode column exists';
  ELSE
    RAISE NOTICE '❌ demo_mode column missing!';
  END IF;
  
  -- Show current demo modes
  RAISE NOTICE '';
  RAISE NOTICE 'Organizations demo mode status:';
  FOR org_record IN SELECT name, demo_mode FROM organizations LOOP
    RAISE NOTICE '  "%": %', org_record.name, 
      CASE WHEN org_record.demo_mode THEN 'DEMO MODE ON' ELSE 'LIVE DATA' END;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Cleanup complete! Team page should now work properly.';
  RAISE NOTICE 'Try toggling demo mode and clicking refresh on Team page.';
END $$;