-- CORRECTED RLS POLICIES WITHOUT INFINITE RECURSION
-- The solution: Use helper functions and avoid self-referencing policies

-- STEP 1: Create helper functions that can be safely used in policies
-- These functions will cache results and avoid recursion

-- Function to get user's organization IDs (for organizations table policies)
CREATE OR REPLACE FUNCTION get_user_org_ids(user_uuid UUID DEFAULT auth.uid())
RETURNS UUID[] AS $$
BEGIN
  -- Simple direct query - no policy recursion since we're in a function
  RETURN ARRAY(
    SELECT org_id 
    FROM memberships 
    WHERE user_id = user_uuid
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to check if user is superadmin in ANY organization
CREATE OR REPLACE FUNCTION is_user_superadmin(user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 
    FROM memberships 
    WHERE user_id = user_uuid 
    AND is_superadmin = true
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Function to check if user is superadmin in specific organization
CREATE OR REPLACE FUNCTION is_user_superadmin_in_org(org_uuid UUID, user_uuid UUID DEFAULT auth.uid())
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS(
    SELECT 1 
    FROM memberships 
    WHERE user_id = user_uuid 
    AND org_id = org_uuid
    AND is_superadmin = true
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- STEP 2: Create NON-RECURSIVE policies using these helper functions

-- ========================================
-- ORGANIZATIONS TABLE POLICIES
-- ========================================

-- Policy 1: Users can view organizations they belong to
CREATE POLICY "organizations_select_policy" ON organizations
  FOR SELECT USING (
    id = ANY(get_user_org_ids())
  );

-- Policy 2: Only superadmins can update organizations
CREATE POLICY "organizations_update_policy" ON organizations
  FOR UPDATE USING (
    is_user_superadmin_in_org(id)
  );

-- Policy 3: Only superadmins can insert organizations
CREATE POLICY "organizations_insert_policy" ON organizations
  FOR INSERT WITH CHECK (
    is_user_superadmin()
  );

-- Policy 4: Only superadmins can delete organizations
CREATE POLICY "organizations_delete_policy" ON organizations
  FOR DELETE USING (
    is_user_superadmin_in_org(id)
  );

-- ========================================
-- MEMBERSHIPS TABLE POLICIES - NO RECURSION!
-- ========================================

-- For memberships, we need to be extra careful to avoid recursion
-- Strategy: Use simple, direct conditions without subqueries to memberships table

-- Policy 1: Users can view their own membership records
CREATE POLICY "memberships_select_own" ON memberships
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- Policy 2: Superadmins can view all memberships (we'll check superadmin status separately)
-- This is tricky - we need to allow superadmins to see memberships without checking memberships table
-- Solution: Create a separate superadmin tracking approach or use a simpler policy

-- For now, let's use a simple policy: users can see memberships in orgs where they are superadmin
-- But we'll check this using the auth.uid() directly to avoid recursion

CREATE POLICY "memberships_select_superadmin" ON memberships
  FOR SELECT USING (
    -- This checks if the current user is a superadmin in the same org as this membership
    -- We use EXISTS with a direct condition to avoid policy recursion
    org_id IN (
      SELECT m.org_id 
      FROM memberships m 
      WHERE m.user_id = auth.uid() 
      AND m.is_superadmin = true
    )
  );

-- Wait - this still has recursion! Let me fix this...

-- Drop the problematic policy
DROP POLICY IF EXISTS "memberships_select_superadmin" ON memberships;

-- Better approach: Only allow users to see their own memberships
-- Superadmins will need to use admin functions or views for management
CREATE POLICY "memberships_select_policy" ON memberships
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- Policy 3: Only superadmins can insert memberships
-- We'll use a function that doesn't reference memberships table in the policy
CREATE POLICY "memberships_insert_policy" ON memberships
  FOR INSERT WITH CHECK (
    -- Check if inserting user is superadmin using our safe function
    is_user_superadmin()
  );

-- Policy 4: Only superadmins can update memberships
CREATE POLICY "memberships_update_policy" ON memberships
  FOR UPDATE USING (
    is_user_superadmin_in_org(org_id)
  );

-- Policy 5: Only superadmins can delete memberships
CREATE POLICY "memberships_delete_policy" ON memberships
  FOR DELETE USING (
    is_user_superadmin_in_org(org_id)
  );

-- STEP 3: Create secure administrative views for superadmins
-- Since regular users can only see their own memberships, we need admin views

CREATE OR REPLACE VIEW admin_all_memberships AS
SELECT 
  m.*,
  u.email,
  u.raw_user_meta_data->>'full_name' as full_name,
  o.name as org_name
FROM memberships m
JOIN auth.users u ON m.user_id = u.id  
JOIN organizations o ON m.org_id = o.id
WHERE is_user_superadmin(); -- Only visible to superadmins

-- Grant access to authenticated users (RLS will filter based on superadmin status)
GRANT SELECT ON admin_all_memberships TO authenticated;

-- STEP 4: Test the functions work before enabling RLS
DO $$
DECLARE
  current_user_id UUID;
  user_orgs UUID[];
  is_super BOOLEAN;
  test_org_id UUID;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== TESTING HELPER FUNCTIONS ===';
  
  SELECT auth.uid() INTO current_user_id;
  
  IF current_user_id IS NULL THEN
    RAISE NOTICE '❌ No authenticated user - cannot test';
    RETURN;
  END IF;
  
  -- Test get_user_org_ids function
  SELECT get_user_org_ids() INTO user_orgs;
  RAISE NOTICE 'User belongs to % organizations: %', array_length(user_orgs, 1), user_orgs;
  
  -- Test is_user_superadmin function  
  SELECT is_user_superadmin() INTO is_super;
  RAISE NOTICE 'User is superadmin: %', is_super;
  
  -- Test is_user_superadmin_in_org function
  IF user_orgs IS NOT NULL AND array_length(user_orgs, 1) > 0 THEN
    test_org_id := user_orgs[1];
    SELECT is_user_superadmin_in_org(test_org_id) INTO is_super;
    RAISE NOTICE 'User is superadmin in org %: %', test_org_id, is_super;
  END IF;
  
  RAISE NOTICE '✅ Helper functions work - ready for RLS';
END $$;

-- STEP 5: Ready message but DON'T enable RLS yet
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '🎯 CORRECTED RLS POLICIES CREATED SUCCESSFULLY';
  RAISE NOTICE '';
  RAISE NOTICE 'Summary of security policies:';
  RAISE NOTICE '- Organizations: Users see only their orgs, superadmins can modify';
  RAISE NOTICE '- Memberships: Users see only their own, superadmins can manage all';
  RAISE NOTICE '- Helper functions created to prevent recursion';
  RAISE NOTICE '- Admin view created for membership management';
  RAISE NOTICE '';
  RAISE NOTICE '⚠️  RLS is still DISABLED for safety';
  RAISE NOTICE '⚠️  Run the next migration to enable RLS when ready';
END $$;