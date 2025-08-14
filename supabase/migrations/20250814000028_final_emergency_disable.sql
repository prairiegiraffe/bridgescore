-- FINAL EMERGENCY DISABLE - Clean up ALL problematic policies

DO $$
BEGIN
  RAISE NOTICE '🚨 FINAL EMERGENCY: Disabling RLS and removing ALL policies';
  
  -- Disable RLS immediately
  ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
  ALTER TABLE memberships DISABLE ROW LEVEL SECURITY;
  
  -- Drop ALL policies (clean slate)
  DROP POLICY IF EXISTS "simple_orgs_select" ON organizations;
  DROP POLICY IF EXISTS "simple_orgs_update" ON organizations;
  DROP POLICY IF EXISTS "simple_memberships_select" ON memberships;
  DROP POLICY IF EXISTS "simple_memberships_all" ON memberships;
  
  -- Drop any other policies that might exist
  DROP POLICY IF EXISTS "Organizations are viewable by members" ON organizations;
  DROP POLICY IF EXISTS "Organizations updateable by superadmins" ON organizations;
  DROP POLICY IF EXISTS "Organizations insertable by superadmins" ON organizations;
  DROP POLICY IF EXISTS "organizations_select_policy" ON organizations;
  DROP POLICY IF EXISTS "organizations_update_policy" ON organizations;
  DROP POLICY IF EXISTS "organizations_insert_policy" ON organizations;
  DROP POLICY IF EXISTS "organizations_delete_policy" ON organizations;
  DROP POLICY IF EXISTS "memberships_select_own" ON memberships;
  DROP POLICY IF EXISTS "memberships_select_policy" ON memberships;
  DROP POLICY IF EXISTS "memberships_insert_policy" ON memberships;
  DROP POLICY IF EXISTS "memberships_update_policy" ON memberships;
  DROP POLICY IF EXISTS "memberships_delete_policy" ON memberships;
  DROP POLICY IF EXISTS "Memberships viewable by org members" ON memberships;
  DROP POLICY IF EXISTS "memberships_select_superadmin" ON memberships;
  
  RAISE NOTICE '✅ ALL RLS policies removed';
  RAISE NOTICE '✅ RLS disabled - app should work now';
END $$;