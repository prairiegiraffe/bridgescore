-- EMERGENCY: Restore organization access and admin privileges

-- STEP 1: Check current state and what might be broken
DO $$
DECLARE
  user_count INTEGER;
  membership_count INTEGER;
  org_count INTEGER;
  policy_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== EMERGENCY DIAGNOSTIC ===';
  
  SELECT COUNT(*) INTO user_count FROM auth.users;
  SELECT COUNT(*) INTO membership_count FROM memberships;
  SELECT COUNT(*) INTO org_count FROM organizations;
  
  RAISE NOTICE 'Users: %, Memberships: %, Organizations: %', user_count, membership_count, org_count;
  
  -- Check if RLS policies exist
  SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE tablename = 'organizations';
  RAISE NOTICE 'Organization RLS policies: %', policy_count;
  
  SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE tablename = 'memberships';
  RAISE NOTICE 'Membership RLS policies: %', policy_count;
END $$;

-- STEP 2: Ensure RLS is enabled on critical tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- STEP 3: Drop and recreate all critical RLS policies
DROP POLICY IF EXISTS "Organizations are viewable by members" ON organizations;
DROP POLICY IF EXISTS "Organizations updateable by superadmins" ON organizations;
DROP POLICY IF EXISTS "Organizations insertable by superadmins" ON organizations;
DROP POLICY IF EXISTS "Memberships are viewable by members" ON memberships;
DROP POLICY IF EXISTS "Memberships are viewable by org members" ON memberships;

-- Organizations policies
CREATE POLICY "Organizations are viewable by members" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Organizations updateable by superadmins" ON organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND org_id = organizations.id
      AND is_superadmin = true
    )
  );

CREATE POLICY "Organizations insertable by superadmins" ON organizations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_superadmin = true
    )
  );

-- Memberships policies
CREATE POLICY "Memberships are viewable by org members" ON memberships
  FOR SELECT USING (
    user_id = auth.uid() OR
    org_id IN (
      SELECT org_id FROM memberships m2 
      WHERE m2.user_id = auth.uid()
    )
  );

-- STEP 4: Recreate organization_details view if it's missing
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
FROM organizations o;

GRANT SELECT ON organization_details TO authenticated;

-- STEP 5: Recreate membership_with_profiles view if it's missing
DROP VIEW IF EXISTS membership_with_profiles CASCADE;

CREATE VIEW membership_with_profiles AS
SELECT 
  m.id,
  m.user_id,
  m.org_id,
  m.role,
  m.is_superadmin,
  m.created_at,
  u.email,
  u.raw_user_meta_data->>'full_name' as full_name
FROM memberships m
JOIN auth.users u ON m.user_id = u.id;

GRANT SELECT ON membership_with_profiles TO authenticated;

-- STEP 6: Check if there are any memberships and create emergency access if needed
DO $$
DECLARE
  current_user_id UUID;
  membership_exists BOOLEAN;
  org_id UUID;
BEGIN
  -- Get current user ID
  SELECT auth.uid() INTO current_user_id;
  
  IF current_user_id IS NOT NULL THEN
    RAISE NOTICE 'Current user ID: %', current_user_id;
    
    -- Check if current user has any memberships
    SELECT EXISTS (
      SELECT 1 FROM memberships WHERE user_id = current_user_id
    ) INTO membership_exists;
    
    IF NOT membership_exists THEN
      RAISE NOTICE 'WARNING: Current user has no memberships!';
      
      -- Get the first organization
      SELECT id INTO org_id FROM organizations LIMIT 1;
      
      IF org_id IS NOT NULL THEN
        -- Create emergency membership as superadmin
        INSERT INTO memberships (user_id, org_id, role, is_superadmin)
        VALUES (current_user_id, org_id, 'owner', true)
        ON CONFLICT (user_id, org_id) DO UPDATE SET
          is_superadmin = true,
          role = 'owner';
        
        RAISE NOTICE 'Created emergency superadmin membership for org %', org_id;
      END IF;
    ELSE
      RAISE NOTICE 'User has existing memberships';
      
      -- Show current memberships
      FOR membership_record IN 
        SELECT org_id, role, is_superadmin FROM memberships WHERE user_id = current_user_id
      LOOP
        RAISE NOTICE 'Membership: org_id=%, role=%, superadmin=%', 
          membership_record.org_id, membership_record.role, membership_record.is_superadmin;
      END LOOP;
    END IF;
  ELSE
    RAISE NOTICE 'No authenticated user found';
  END IF;
END $$;

-- STEP 7: Final verification
DO $$
DECLARE
  view_exists BOOLEAN;
  policy_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== RESTORATION STATUS ===';
  
  -- Check if views exist
  SELECT EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_name = 'organization_details'
  ) INTO view_exists;
  RAISE NOTICE 'organization_details view exists: %', view_exists;
  
  SELECT EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_name = 'membership_with_profiles'
  ) INTO view_exists;
  RAISE NOTICE 'membership_with_profiles view exists: %', view_exists;
  
  -- Check policies
  SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE tablename = 'organizations';
  RAISE NOTICE 'Organization policies: %', policy_count;
  
  SELECT COUNT(*) INTO policy_count FROM pg_policies WHERE tablename = 'memberships';
  RAISE NOTICE 'Membership policies: %', policy_count;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Emergency restoration complete!';
  RAISE NOTICE 'Try refreshing the page - Organizations nav and SuperAdmin should be restored.';
END $$;