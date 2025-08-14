-- Fix organization security and column issues comprehensively

-- STEP 1: Drop the view first (it depends on the is_demo column)
DROP VIEW IF EXISTS organization_details CASCADE;

-- STEP 2: Fix the duplicate columns in organizations table
DO $$
BEGIN
  -- Check if both columns exist
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'organizations' 
    AND column_name = 'is_demo'
  ) AND EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'organizations' 
    AND column_name = 'demo_mode'
  ) THEN
    -- Both exist, migrate data from is_demo to demo_mode
    UPDATE organizations 
    SET demo_mode = is_demo 
    WHERE is_demo = true;
    
    -- Now we can safely drop is_demo since the view is gone
    ALTER TABLE organizations DROP COLUMN is_demo;
    
    RAISE NOTICE 'Migrated is_demo data to demo_mode and removed is_demo column';
  
  ELSIF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'organizations' 
    AND column_name = 'is_demo'
  ) THEN
    -- Only is_demo exists, rename it
    ALTER TABLE organizations RENAME COLUMN is_demo TO demo_mode;
    RAISE NOTICE 'Renamed is_demo to demo_mode';
    
  ELSIF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'organizations' 
    AND column_name = 'demo_mode'
  ) THEN
    -- Neither exists, create demo_mode
    ALTER TABLE organizations ADD COLUMN demo_mode BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added demo_mode column';
  END IF;
END $$;

-- STEP 3: Ensure proper RLS on organizations table
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Drop and recreate policies
DROP POLICY IF EXISTS "Organizations are viewable by members" ON organizations;
DROP POLICY IF EXISTS "Organizations updateable by superadmins" ON organizations;
DROP POLICY IF EXISTS "Organizations insertable by superadmins" ON organizations;

-- Members can view their organization
CREATE POLICY "Organizations are viewable by members" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid()
    )
  );

-- Only superadmins can update
CREATE POLICY "Organizations updateable by superadmins" ON organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND org_id = organizations.id
      AND is_superadmin = true
    )
  );

-- Only superadmins can insert
CREATE POLICY "Organizations insertable by superadmins" ON organizations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_superadmin = true
    )
  );

-- STEP 4: Create a SECURE view (not a table!)
-- This view will inherit security from the organizations table
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
  o.demo_mode,  -- Now using the correct column name
  o.created_at,
  o.updated_at,
  (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id) as member_count
FROM organizations o
WHERE o.id IN (
  SELECT org_id FROM memberships 
  WHERE user_id = auth.uid()
);

-- Grant select permission to authenticated users
GRANT SELECT ON organization_details TO authenticated;

-- STEP 5: Verify we don't have duplicate tables
-- Check if there's a organizations_details TABLE (not view) that should be removed
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'organizations_details' 
    AND table_type = 'BASE TABLE'
  ) THEN
    DROP TABLE organizations_details CASCADE;
    RAISE NOTICE 'Dropped duplicate organizations_details table';
  END IF;
END $$;

-- Final cleanup
UPDATE organizations SET demo_mode = false WHERE demo_mode IS NULL;
ALTER TABLE organizations ALTER COLUMN demo_mode SET DEFAULT false;