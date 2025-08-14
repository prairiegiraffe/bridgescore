-- EMERGENCY: Disable RLS due to infinite recursion in policies
-- The membership policies were checking memberships table while querying memberships table

DO $$
BEGIN
  RAISE NOTICE '🚨 EMERGENCY: Disabling RLS due to infinite recursion';
  
  -- Immediately disable RLS to restore access
  ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
  ALTER TABLE memberships DISABLE ROW LEVEL SECURITY;
  
  RAISE NOTICE '✅ RLS disabled - app access should be restored';
  
  -- Drop the problematic policies that caused recursion
  DROP POLICY IF EXISTS "Organizations are viewable by members" ON organizations;
  DROP POLICY IF EXISTS "Organizations updateable by superadmins" ON organizations;  
  DROP POLICY IF EXISTS "Organizations insertable by superadmins" ON organizations;
  DROP POLICY IF EXISTS "Memberships viewable by org members" ON memberships;
  DROP POLICY IF EXISTS "Memberships updatable by superadmins" ON memberships;
  DROP POLICY IF EXISTS "Memberships insertable by superadmins" ON memberships;
  DROP POLICY IF EXISTS "Memberships deletable by superadmins" ON memberships;
  
  RAISE NOTICE '✅ Dropped problematic recursive policies';
END $$;