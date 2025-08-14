-- Remove duplicate is_demo column, keep only demo_mode

-- STEP 1: Check current state of demo columns
DO $$
DECLARE
  org_record RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== CURRENT DEMO COLUMN STATE ===';
  
  FOR org_record IN 
    SELECT 
      id, 
      name,
      CASE WHEN EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' AND column_name = 'is_demo'
      ) THEN 
        CASE 
          WHEN (SELECT is_demo FROM organizations o WHERE o.id = org_record.id) THEN 'TRUE'
          ELSE 'FALSE'
        END
      ELSE 'COLUMN_MISSING'
      END as is_demo_value,
      CASE WHEN demo_mode THEN 'TRUE' ELSE 'FALSE' END as demo_mode_value
    FROM organizations
  LOOP
    RAISE NOTICE 'Org: % | is_demo: % | demo_mode: %', 
      org_record.name, org_record.is_demo_value, org_record.demo_mode_value;
  END LOOP;
END $$;

-- STEP 2: Migrate any is_demo=true values to demo_mode before dropping
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'is_demo'
  ) THEN
    -- Update demo_mode to true where is_demo is true (just in case)
    UPDATE organizations 
    SET demo_mode = true 
    WHERE is_demo = true AND demo_mode = false;
    
    RAISE NOTICE 'Migrated any is_demo=true values to demo_mode';
  END IF;
END $$;

-- STEP 3: Drop the is_demo column (it's the duplicate/old one)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'is_demo'
  ) THEN
    ALTER TABLE organizations DROP COLUMN is_demo;
    RAISE NOTICE 'Dropped is_demo column - using demo_mode only';
  ELSE
    RAISE NOTICE 'is_demo column does not exist - no action needed';
  END IF;
END $$;

-- STEP 4: Ensure demo_mode has proper defaults
ALTER TABLE organizations ALTER COLUMN demo_mode SET DEFAULT false;
UPDATE organizations SET demo_mode = false WHERE demo_mode IS NULL;

-- STEP 5: Update the organization_details view to only use demo_mode
DROP VIEW IF EXISTS organization_details CASCADE;

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
  o.demo_mode,  -- Only this column, not is_demo
  o.created_at,
  (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id) as member_count
FROM organizations o
WHERE o.id IN (
  SELECT org_id FROM memberships 
  WHERE user_id = auth.uid()
);

GRANT SELECT ON organization_details TO authenticated;

-- STEP 6: Final verification
DO $$
DECLARE
  org_record RECORD;
  is_demo_exists BOOLEAN;
  demo_mode_exists BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== FINAL VERIFICATION ===';
  
  -- Check if columns exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'is_demo'
  ) INTO is_demo_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'demo_mode'
  ) INTO demo_mode_exists;
  
  IF is_demo_exists THEN
    RAISE NOTICE '❌ ERROR: is_demo column still exists!';
  ELSE
    RAISE NOTICE '✅ is_demo column removed successfully';
  END IF;
  
  IF demo_mode_exists THEN
    RAISE NOTICE '✅ demo_mode column exists';
  ELSE
    RAISE NOTICE '❌ ERROR: demo_mode column missing!';
  END IF;
  
  -- Show current demo_mode values
  RAISE NOTICE '';
  RAISE NOTICE 'Current demo_mode values:';
  FOR org_record IN SELECT name, demo_mode FROM organizations LOOP
    RAISE NOTICE '  %: %', org_record.name, 
      CASE WHEN org_record.demo_mode THEN 'DEMO MODE ON' ELSE 'LIVE DATA MODE' END;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Cleanup complete - using demo_mode column only';
END $$;