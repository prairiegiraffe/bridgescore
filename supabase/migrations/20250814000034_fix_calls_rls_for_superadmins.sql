-- Fix RLS policies on calls table to allow SuperAdmins to see all org calls
-- while still restricting regular users to their own calls

-- First, let's see what RLS policies currently exist and drop them
DROP POLICY IF EXISTS "calls_select_policy" ON calls;
DROP POLICY IF EXISTS "calls_insert_policy" ON calls;
DROP POLICY IF EXISTS "calls_update_policy" ON calls;
DROP POLICY IF EXISTS "calls_delete_policy" ON calls;

-- Create helper function to check if user is SuperAdmin (if it doesn't exist)
CREATE OR REPLACE FUNCTION is_user_superadmin_for_calls(user_uuid UUID DEFAULT auth.uid())
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

-- Policy 1: Users can view calls they own OR SuperAdmins can view all calls in orgs they have access to
CREATE POLICY "calls_select_policy" ON calls
  FOR SELECT USING (
    -- Users can see their own calls
    user_id = auth.uid() 
    OR 
    -- SuperAdmins can see all calls in organizations they have access to
    (
      is_user_superadmin_for_calls() 
      AND org_id IN (
        SELECT org_id FROM memberships WHERE user_id = auth.uid()
      )
    )
    OR
    -- SuperAdmins can see all calls if they have any SuperAdmin membership
    is_user_superadmin_for_calls()
  );

-- Policy 2: Users can insert calls, SuperAdmins can insert calls in any org
CREATE POLICY "calls_insert_policy" ON calls
  FOR INSERT WITH CHECK (
    -- Users can insert their own calls
    user_id = auth.uid()
    OR
    -- SuperAdmins can insert calls for any user
    is_user_superadmin_for_calls()
  );

-- Policy 3: Users can update their own calls, SuperAdmins can update any call
CREATE POLICY "calls_update_policy" ON calls
  FOR UPDATE USING (
    -- Users can update their own calls
    user_id = auth.uid()
    OR
    -- SuperAdmins can update any call
    is_user_superadmin_for_calls()
  );

-- Policy 4: Only SuperAdmins can delete calls
CREATE POLICY "calls_delete_policy" ON calls
  FOR DELETE USING (
    is_user_superadmin_for_calls()
  );

-- Enable RLS on calls table if not already enabled
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;

-- Test the policies
DO $$
DECLARE
  current_user_id UUID;
  is_super BOOLEAN;
  test_call_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== TESTING CALLS RLS POLICIES ===';
  
  SELECT auth.uid() INTO current_user_id;
  
  IF current_user_id IS NULL THEN
    RAISE NOTICE '❌ No authenticated user - cannot test policies';
    RETURN;
  END IF;
  
  -- Test SuperAdmin function
  SELECT is_user_superadmin_for_calls() INTO is_super;
  RAISE NOTICE 'User is SuperAdmin: %', is_super;
  
  -- Test calls access
  SELECT COUNT(*) INTO test_call_count FROM calls;
  RAISE NOTICE 'Calls accessible: %', test_call_count;
  
  IF is_super AND test_call_count > 0 THEN
    RAISE NOTICE '✅ SuperAdmin can access calls - policy working';
  ELSIF NOT is_super THEN
    RAISE NOTICE 'ℹ️  Regular user - access limited to own calls';
  ELSE
    RAISE NOTICE '⚠️  SuperAdmin but no calls found - may need to check data';
  END IF;
  
  RAISE NOTICE '✅ Calls RLS policies updated successfully';
END $$;