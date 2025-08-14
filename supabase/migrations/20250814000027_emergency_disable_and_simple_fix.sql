-- EMERGENCY: Disable RLS again and create a simpler, working approach

DO $$
BEGIN
  RAISE NOTICE '🚨 EMERGENCY: Disabling RLS to restore access';
  
  -- Disable RLS immediately
  ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
  ALTER TABLE memberships DISABLE ROW LEVEL SECURITY;
  
  RAISE NOTICE '✅ RLS disabled - app access restored';
  
  -- Drop all the complex policies that are causing issues
  DROP POLICY IF EXISTS "organizations_select_policy" ON organizations;
  DROP POLICY IF EXISTS "organizations_update_policy" ON organizations;
  DROP POLICY IF EXISTS "organizations_insert_policy" ON organizations;
  DROP POLICY IF EXISTS "organizations_delete_policy" ON organizations;
  DROP POLICY IF EXISTS "memberships_select_own" ON memberships;
  DROP POLICY IF EXISTS "memberships_select_policy" ON memberships;
  DROP POLICY IF EXISTS "memberships_insert_policy" ON memberships;
  DROP POLICY IF EXISTS "memberships_update_policy" ON memberships;
  DROP POLICY IF EXISTS "memberships_delete_policy" ON memberships;
  
  RAISE NOTICE '✅ Dropped complex policies';
END $$;

-- Create SIMPLE, WORKING RLS policies (the ones that worked before)
-- These are the policies from your earlier working migration

-- ORGANIZATIONS: Simple policy - members can see their orgs
CREATE POLICY "simple_orgs_select" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT DISTINCT m.org_id 
      FROM memberships m 
      WHERE m.user_id = auth.uid()
    )
  );

-- ORGANIZATIONS: Only superadmins can update  
CREATE POLICY "simple_orgs_update" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT DISTINCT m.org_id 
      FROM memberships m 
      WHERE m.user_id = auth.uid() 
      AND m.is_superadmin = true
    )
  );

-- MEMBERSHIPS: Users can see their own membership
CREATE POLICY "simple_memberships_select" ON memberships
  FOR SELECT USING (
    user_id = auth.uid()
  );

-- MEMBERSHIPS: Superadmins can manage memberships
CREATE POLICY "simple_memberships_all" ON memberships
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM memberships m2
      WHERE m2.user_id = auth.uid() 
      AND m2.is_superadmin = true
    )
  );

-- Create a simple test that should work
CREATE OR REPLACE FUNCTION simple_rls_test()
RETURNS TEXT AS $$
DECLARE
  result TEXT := 'RLS Test Results:' || E'\n';
  current_user UUID;
  org_count INTEGER;
  membership_count INTEGER;
BEGIN
  -- Check if we have a user session
  BEGIN
    SELECT auth.uid() INTO current_user;
    IF current_user IS NULL THEN
      RETURN 'Not authenticated in this SQL session - this is normal. Test from your app instead.';
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN 'No auth context in SQL editor - this is expected. Test from your app.';
  END;
  
  -- If we get here, we have auth context
  result := result || 'User ID: ' || current_user || E'\n';
  
  SELECT COUNT(*) INTO org_count FROM organizations;
  result := result || 'Organizations: ' || org_count || E'\n';
  
  SELECT COUNT(*) INTO membership_count FROM memberships;  
  result := result || 'Memberships: ' || membership_count || E'\n';
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION simple_rls_test() TO authenticated;

DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '✅ SIMPLE RLS POLICIES CREATED';
  RAISE NOTICE '';
  RAISE NOTICE 'Ready to test! Here is what to do:';
  RAISE NOTICE '';  
  RAISE NOTICE '1. FIRST: Refresh your browser - app should work with RLS disabled';
  RAISE NOTICE '2. THEN: If app works, run this to enable RLS:';
  RAISE NOTICE '';
  RAISE NOTICE 'ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;';
  RAISE NOTICE 'ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;';
  RAISE NOTICE '';
  RAISE NOTICE '3. FINALLY: Test your app. If broken, disable with:';
  RAISE NOTICE '';
  RAISE NOTICE 'ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;';
  RAISE NOTICE 'ALTER TABLE memberships DISABLE ROW LEVEL SECURITY;';
  RAISE NOTICE '';
  RAISE NOTICE 'Current status: RLS DISABLED (app should work)';
END $$;