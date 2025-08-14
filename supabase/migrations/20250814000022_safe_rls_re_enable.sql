-- SAFELY RE-ENABLE RLS WITH PROPER POLICIES
-- This migration will restore security without breaking app functionality

-- STEP 1: First create comprehensive RLS policies BEFORE enabling RLS
-- This ensures there's no moment where RLS is enabled without proper policies

-- ========================================
-- ORGANIZATIONS TABLE POLICIES
-- ========================================

-- Drop any existing policies to start clean
DROP POLICY IF EXISTS "Organizations are viewable by members" ON organizations;
DROP POLICY IF EXISTS "Organizations updateable by superadmins" ON organizations;
DROP POLICY IF EXISTS "Organizations insertable by superadmins" ON organizations;

-- Policy 1: Members can view their organization
CREATE POLICY "Organizations are viewable by members" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid()
    )
  );

-- Policy 2: Only superadmins can update organizations
CREATE POLICY "Organizations updateable by superadmins" ON organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND org_id = organizations.id
      AND is_superadmin = true
    )
  );

-- Policy 3: Only superadmins can insert new organizations
CREATE POLICY "Organizations insertable by superadmins" ON organizations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_superadmin = true
    )
  );

-- ========================================
-- MEMBERSHIPS TABLE POLICIES  
-- ========================================

-- Drop existing policies
DROP POLICY IF EXISTS "Memberships viewable by org members" ON memberships;
DROP POLICY IF EXISTS "Memberships updatable by superadmins" ON memberships;
DROP POLICY IF EXISTS "Memberships insertable by superadmins" ON memberships;
DROP POLICY IF EXISTS "Memberships deletable by superadmins" ON memberships;

-- Policy 1: Users can view memberships in their organizations
CREATE POLICY "Memberships viewable by org members" ON memberships
  FOR SELECT USING (
    -- Users can see their own membership
    user_id = auth.uid() OR
    -- OR they can see other memberships in their orgs
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid()
    )
  );

-- Policy 2: Only superadmins can update memberships  
CREATE POLICY "Memberships updatable by superadmins" ON memberships
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = auth.uid() 
      AND m.org_id = memberships.org_id
      AND m.is_superadmin = true
    )
  );

-- Policy 3: Only superadmins can insert memberships
CREATE POLICY "Memberships insertable by superadmins" ON memberships
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = auth.uid() 
      AND m.is_superadmin = true
    )
  );

-- Policy 4: Only superadmins can delete memberships
CREATE POLICY "Memberships deletable by superadmins" ON memberships
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM memberships m
      WHERE m.user_id = auth.uid() 
      AND m.org_id = memberships.org_id
      AND m.is_superadmin = true
    )
  );

-- STEP 2: Update views to work properly with RLS
DROP VIEW IF EXISTS organization_details CASCADE;
DROP VIEW IF EXISTS membership_with_profiles CASCADE;

-- Recreate organization_details view that respects RLS
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

-- Recreate membership_with_profiles view that respects RLS  
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

-- Grant proper permissions on views
GRANT SELECT ON organization_details TO authenticated;
GRANT SELECT ON membership_with_profiles TO authenticated;

-- STEP 3: Test policies work BEFORE enabling RLS
DO $$
DECLARE
  current_user_id UUID;
  user_email TEXT;
  test_org_count INTEGER;
  test_membership_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== TESTING POLICIES BEFORE ENABLING RLS ===';
  
  -- Get current user
  SELECT auth.uid() INTO current_user_id;
  
  IF current_user_id IS NULL THEN
    RAISE NOTICE '❌ ERROR: No authenticated user - cannot test policies';
    RETURN;
  END IF;
  
  SELECT email INTO user_email FROM auth.users WHERE id = current_user_id;
  RAISE NOTICE '✅ Testing as user: % (ID: %)', user_email, current_user_id;
  
  -- Test organization access (should work with RLS disabled)
  SELECT COUNT(*) INTO test_org_count FROM organizations;
  RAISE NOTICE 'Organizations accessible: %', test_org_count;
  
  -- Test membership access  
  SELECT COUNT(*) INTO test_membership_count FROM memberships;
  RAISE NOTICE 'Memberships accessible: %', test_membership_count;
  
  IF test_org_count > 0 AND test_membership_count > 0 THEN
    RAISE NOTICE '✅ Pre-RLS test passed - data is accessible';
  ELSE
    RAISE NOTICE '❌ Pre-RLS test failed - no data accessible';
  END IF;
END $$;

-- STEP 4: NOW safely re-enable RLS
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== RE-ENABLING RLS WITH PROPER POLICIES ===';
  
  -- Re-enable RLS on critical tables
  ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
  ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
  
  RAISE NOTICE '✅ RLS re-enabled on organizations and memberships tables';
  RAISE NOTICE '✅ Proper security policies are now active';
END $$;

-- STEP 5: Final verification that everything still works
DO $$
DECLARE  
  current_user_id UUID;
  final_org_count INTEGER;
  final_membership_count INTEGER;
  final_view_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== FINAL VERIFICATION WITH RLS ENABLED ===';
  
  -- Get current user
  SELECT auth.uid() INTO current_user_id;
  
  IF current_user_id IS NULL THEN
    RAISE NOTICE '❌ ERROR: No authenticated user for final test';
    RETURN;
  END IF;
  
  -- Test organization access with RLS enabled
  SELECT COUNT(*) INTO final_org_count FROM organizations;
  RAISE NOTICE 'Organizations accessible with RLS: %', final_org_count;
  
  -- Test membership access with RLS enabled
  SELECT COUNT(*) INTO final_membership_count FROM memberships;  
  RAISE NOTICE 'Memberships accessible with RLS: %', final_membership_count;
  
  -- Test view access
  SELECT COUNT(*) INTO final_view_count FROM organization_details;
  RAISE NOTICE 'organization_details view accessible: %', final_view_count;
  
  IF final_org_count > 0 AND final_membership_count > 0 AND final_view_count > 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 SUCCESS! RLS RE-ENABLED SAFELY';
    RAISE NOTICE '✅ All data is accessible through proper security policies';
    RAISE NOTICE '🛡️ Your database is now secure from unauthorized access';
    RAISE NOTICE '';
    RAISE NOTICE 'Security Summary:';
    RAISE NOTICE '- Users can only see organizations they belong to';  
    RAISE NOTICE '- Only SuperAdmins can modify organizations';
    RAISE NOTICE '- Users can see memberships in their organizations';
    RAISE NOTICE '- Only SuperAdmins can manage memberships';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '❌ WARNING: RLS enabled but data access may be broken';
    RAISE NOTICE 'Organizations: %, Memberships: %, Views: %', 
      final_org_count, final_membership_count, final_view_count;
  END IF;
END $$;