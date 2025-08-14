-- Simple fix for duplicate demo columns

-- STEP 1: Show current state (simplified)
DO $$
DECLARE
  org_record RECORD;
  is_demo_col_exists BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== CHECKING DEMO COLUMNS ===';
  
  -- Check if is_demo column exists
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'is_demo'
  ) INTO is_demo_col_exists;
  
  IF is_demo_col_exists THEN
    RAISE NOTICE 'Found is_demo column - will remove it';
    
    -- Show current values before migration
    FOR org_record IN SELECT id, name, is_demo, demo_mode FROM organizations LOOP
      RAISE NOTICE 'Org "%" - is_demo: %, demo_mode: %', 
        org_record.name, org_record.is_demo, org_record.demo_mode;
    END LOOP;
    
  ELSE
    RAISE NOTICE 'is_demo column does not exist';
  END IF;
  
  RAISE NOTICE 'demo_mode column exists: %', EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'demo_mode'
  );
END $$;

-- STEP 2: Migrate any is_demo=true values to demo_mode
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'is_demo'
  ) THEN
    -- Update demo_mode to true where is_demo is true
    UPDATE organizations 
    SET demo_mode = true 
    WHERE is_demo = true;
    
    RAISE NOTICE 'Updated demo_mode where is_demo was true';
    
    -- Show how many were updated
    RAISE NOTICE 'Organizations with demo_mode=true: %', (
      SELECT COUNT(*) FROM organizations WHERE demo_mode = true
    );
  END IF;
END $$;

-- STEP 3: Drop the is_demo column
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'is_demo'
  ) THEN
    ALTER TABLE organizations DROP COLUMN is_demo;
    RAISE NOTICE '✅ Dropped is_demo column';
  ELSE
    RAISE NOTICE 'is_demo column already removed';
  END IF;
END $$;

-- STEP 4: Clean up the organization_details view
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
  o.demo_mode,
  o.created_at,
  (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id) as member_count
FROM organizations o
WHERE o.id IN (
  SELECT org_id FROM memberships 
  WHERE user_id = auth.uid()
);

GRANT SELECT ON organization_details TO authenticated;

-- STEP 5: Final status
DO $$
DECLARE
  org_record RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== FINAL STATUS ===';
  
  RAISE NOTICE 'is_demo column exists: %', EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'is_demo'
  );
  
  RAISE NOTICE 'demo_mode column exists: %', EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'demo_mode'
  );
  
  RAISE NOTICE '';
  RAISE NOTICE 'Current organizations demo mode status:';
  FOR org_record IN SELECT name, demo_mode FROM organizations LOOP
    RAISE NOTICE '  "%": %', org_record.name, 
      CASE WHEN org_record.demo_mode THEN 'DEMO MODE' ELSE 'LIVE DATA' END;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Migration complete - now using demo_mode column only';
END $$;