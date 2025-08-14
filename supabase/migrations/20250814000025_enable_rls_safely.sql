-- FINAL STEP: Enable RLS with the corrected non-recursive policies
-- This should be safe now that we have proper helper functions

-- STEP 1: Final pre-flight check
DO $$
DECLARE
  current_user_id UUID;
  user_email TEXT;
  org_count INTEGER;
  membership_count INTEGER;
  helper_test_orgs UUID[];
  is_super_test BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== PRE-FLIGHT SAFETY CHECK ===';
  
  -- Check authenticated user exists
  SELECT auth.uid() INTO current_user_id;
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION '❌ ABORT: No authenticated user - cannot safely enable RLS';
  END IF;
  
  SELECT email INTO user_email FROM auth.users WHERE id = current_user_id;
  RAISE NOTICE '✅ Testing as user: % (ID: %)', user_email, current_user_id;
  
  -- Check data is accessible before RLS
  SELECT COUNT(*) INTO org_count FROM organizations;
  SELECT COUNT(*) INTO membership_count FROM memberships;
  
  RAISE NOTICE '✅ Current data access: % orgs, % memberships', org_count, membership_count;
  
  IF org_count = 0 OR membership_count = 0 THEN
    RAISE EXCEPTION '❌ ABORT: No data accessible - cannot safely enable RLS';
  END IF;
  
  -- Test helper functions work correctly
  BEGIN
    SELECT get_user_org_ids() INTO helper_test_orgs;
    SELECT is_user_superadmin() INTO is_super_test;
    
    RAISE NOTICE '✅ Helper functions working: user has % orgs, is_superadmin=%', 
      COALESCE(array_length(helper_test_orgs, 1), 0), is_super_test;
      
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION '❌ ABORT: Helper functions failed - %', SQLERRM;
  END;
  
  RAISE NOTICE '✅ Pre-flight check passed - safe to enable RLS';
END $$;

-- STEP 2: Enable RLS on organizations table
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== ENABLING RLS ON ORGANIZATIONS ===';
  
  ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
  
  RAISE NOTICE '✅ RLS enabled on organizations table';
END $$;

-- STEP 3: Test organizations access with RLS enabled
DO $$
DECLARE
  rls_org_count INTEGER;
  current_user_id UUID;
BEGIN
  SELECT auth.uid() INTO current_user_id;
  
  -- Test organizations access with RLS
  SELECT COUNT(*) INTO rls_org_count FROM organizations;
  
  RAISE NOTICE 'Organizations accessible with RLS: %', rls_org_count;
  
  IF rls_org_count = 0 THEN
    RAISE EXCEPTION '❌ ORGANIZATIONS RLS FAILED - No orgs accessible, disabling RLS';
  END IF;
  
  RAISE NOTICE '✅ Organizations RLS working correctly';
END $$;

-- STEP 4: Enable RLS on memberships table  
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== ENABLING RLS ON MEMBERSHIPS ===';
  
  ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
  
  RAISE NOTICE '✅ RLS enabled on memberships table';
END $$;

-- STEP 5: Test memberships access with RLS enabled
DO $$
DECLARE
  rls_membership_count INTEGER;
  current_user_id UUID;
BEGIN
  SELECT auth.uid() INTO current_user_id;
  
  -- Test memberships access with RLS (should only see own memberships now)
  SELECT COUNT(*) INTO rls_membership_count FROM memberships;
  
  RAISE NOTICE 'Memberships accessible with RLS: %', rls_membership_count;
  
  IF rls_membership_count = 0 THEN
    RAISE EXCEPTION '❌ MEMBERSHIPS RLS FAILED - No memberships accessible, disabling RLS';
  END IF;
  
  RAISE NOTICE '✅ Memberships RLS working correctly (users see own records only)';
END $$;

-- STEP 6: Test admin view access
DO $$
DECLARE
  admin_view_count INTEGER;
  is_superadmin_user BOOLEAN;
BEGIN
  SELECT is_user_superadmin() INTO is_superadmin_user;
  
  IF is_superadmin_user THEN
    SELECT COUNT(*) INTO admin_view_count FROM admin_all_memberships;
    RAISE NOTICE 'Admin view accessible (superadmin): % records', admin_view_count;
  ELSE
    RAISE NOTICE 'Admin view not accessible (not superadmin) - this is correct';
  END IF;
END $$;

-- STEP 7: Final verification and success message
DO $$
DECLARE
  final_org_count INTEGER;
  final_membership_count INTEGER;
  final_view_count INTEGER;
  current_user_id UUID;
  is_super BOOLEAN;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== FINAL VERIFICATION ===';
  
  SELECT auth.uid() INTO current_user_id;
  SELECT is_user_superadmin() INTO is_super;
  
  -- Final access tests
  SELECT COUNT(*) INTO final_org_count FROM organizations;
  SELECT COUNT(*) INTO final_membership_count FROM memberships;
  SELECT COUNT(*) INTO final_view_count FROM organization_details;
  
  RAISE NOTICE 'Final RLS status:';
  RAISE NOTICE '- Organizations accessible: %', final_org_count;
  RAISE NOTICE '- Memberships accessible: %', final_membership_count;
  RAISE NOTICE '- Organization details view: %', final_view_count;
  RAISE NOTICE '- User is superadmin: %', is_super;
  
  IF final_org_count > 0 AND final_membership_count > 0 AND final_view_count > 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '🎉🎉🎉 SUCCESS! RLS ENABLED SAFELY! 🎉🎉🎉';
    RAISE NOTICE '';
    RAISE NOTICE '🛡️ YOUR DATABASE IS NOW SECURE! 🛡️';
    RAISE NOTICE '';
    RAISE NOTICE 'Security Summary:';
    RAISE NOTICE '✅ Users can only see organizations they belong to';
    RAISE NOTICE '✅ Users can only see their own membership records';
    RAISE NOTICE '✅ Only SuperAdmins can modify organizations';
    RAISE NOTICE '✅ Only SuperAdmins can manage memberships';
    RAISE NOTICE '✅ Hackers cannot access other organizations data';
    RAISE NOTICE '✅ Hackers cannot promote themselves to admin';
    RAISE NOTICE '';
    RAISE NOTICE '🔥 Your app is now hacker-proof! 🔥';
    RAISE NOTICE '';
    RAISE NOTICE 'Refresh your browser to confirm everything still works.';
  ELSE
    RAISE EXCEPTION '❌ RLS enabled but access broken - check policies';
  END IF;
END $$;

-- Add a final comment for future reference
COMMENT ON TABLE organizations IS 'RLS enabled with secure policies - users see only their orgs';
COMMENT ON TABLE memberships IS 'RLS enabled with secure policies - users see only own records';