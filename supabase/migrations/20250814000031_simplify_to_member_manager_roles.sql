-- Safely simplify role system to just member + manager
-- This preserves all access while cleaning up unnecessary role complexity

-- STEP 1: Show current role distribution before changes
DO $$
DECLARE
    role_record RECORD;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== CURRENT ROLE DISTRIBUTION ===';
    
    FOR role_record IN 
        SELECT role, COUNT(*) as count, 
               COUNT(CASE WHEN is_superadmin THEN 1 END) as superadmin_count
        FROM memberships 
        GROUP BY role 
        ORDER BY role
    LOOP
        RAISE NOTICE 'Role: % | Count: % | SuperAdmins: %', 
            role_record.role, role_record.count, role_record.superadmin_count;
    END LOOP;
END $$;

-- STEP 2: Drop the existing constraint first
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;

-- STEP 3: Safely convert existing roles to the new simplified system
DO $$
DECLARE
    update_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== CONVERTING ROLES TO SIMPLIFIED SYSTEM ===';
    
    -- Convert 'owner' and 'admin' roles to 'manager'
    -- These are organization leaders who should have management access
    UPDATE memberships 
    SET role = 'manager' 
    WHERE role IN ('owner', 'admin');
    
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RAISE NOTICE 'Converted % owner/admin roles to manager', update_count;
    
    -- Ensure any weird role values become 'member'
    UPDATE memberships 
    SET role = 'member' 
    WHERE role NOT IN ('member', 'manager');
    
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RAISE NOTICE 'Converted % other roles to member', update_count;
END $$;

-- STEP 4: Create new simplified constraint
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check 
CHECK (role IN ('member', 'manager'));

-- STEP 5: Verify the migration results
DO $$
DECLARE
    role_record RECORD;
    superadmin_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== POST-MIGRATION ROLE DISTRIBUTION ===';
    
    FOR role_record IN 
        SELECT role, COUNT(*) as count, 
               COUNT(CASE WHEN is_superadmin THEN 1 END) as superadmin_count
        FROM memberships 
        GROUP BY role 
        ORDER BY role
    LOOP
        RAISE NOTICE 'Role: % | Count: % | SuperAdmins: %', 
            role_record.role, role_record.count, role_record.superadmin_count;
    END LOOP;
    
    -- Check SuperAdmin preservation
    SELECT COUNT(*) INTO superadmin_count FROM memberships WHERE is_superadmin = true;
    RAISE NOTICE 'Total SuperAdmins preserved: %', superadmin_count;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ MIGRATION COMPLETE!';
    RAISE NOTICE 'New role system: member (sales staff) + manager (org admins)';
    RAISE NOTICE 'SuperAdmin access preserved for BridgeSelling staff';
    RAISE NOTICE '';
    RAISE NOTICE '🔧 Next steps:';
    RAISE NOTICE '1. Update UI to only show member/manager options';
    RAISE NOTICE '2. Clean up access control code';
    RAISE NOTICE '3. Test role assignments work correctly';
END $$;