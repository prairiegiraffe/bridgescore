-- Simple approach: directly drop known constraints and convert roles

-- STEP 1: Drop all possible role constraint variations
DO $$
BEGIN
    RAISE NOTICE '=== DROPPING ALL POSSIBLE ROLE CONSTRAINTS ===';
    
    -- Drop all known variations of role constraints
    ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;
    ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_valid;  
    ALTER TABLE memberships DROP CONSTRAINT IF EXISTS role_check;
    ALTER TABLE memberships DROP CONSTRAINT IF EXISTS valid_role;
    ALTER TABLE memberships DROP CONSTRAINT IF EXISTS check_role;
    
    RAISE NOTICE 'Dropped all possible role constraints';
END $$;

-- STEP 2: Show current roles before conversion
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== CURRENT ROLES BEFORE CONVERSION ===';
    
    -- Use a simple approach to show roles
    PERFORM 1 FROM memberships WHERE role = 'owner';
    IF FOUND THEN
        RAISE NOTICE 'Found owner roles - will convert to manager';
    END IF;
    
    PERFORM 1 FROM memberships WHERE role = 'admin';
    IF FOUND THEN  
        RAISE NOTICE 'Found admin roles - will convert to manager';
    END IF;
    
    PERFORM 1 FROM memberships WHERE role = 'manager';
    IF FOUND THEN
        RAISE NOTICE 'Found existing manager roles - will keep';
    END IF;
    
    PERFORM 1 FROM memberships WHERE role = 'member';
    IF FOUND THEN
        RAISE NOTICE 'Found existing member roles - will keep';
    END IF;
END $$;

-- STEP 3: Convert roles safely (no constraints blocking now)
DO $$
DECLARE
    owner_count INTEGER;
    admin_count INTEGER;
    other_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== CONVERTING ROLES ===';
    
    -- Count and convert owner roles
    SELECT COUNT(*) INTO owner_count FROM memberships WHERE role = 'owner';
    UPDATE memberships SET role = 'manager' WHERE role = 'owner';
    RAISE NOTICE 'Converted % owner roles to manager', owner_count;
    
    -- Count and convert admin roles  
    SELECT COUNT(*) INTO admin_count FROM memberships WHERE role = 'admin';
    UPDATE memberships SET role = 'manager' WHERE role = 'admin';
    RAISE NOTICE 'Converted % admin roles to manager', admin_count;
    
    -- Convert any other weird roles to member
    SELECT COUNT(*) INTO other_count FROM memberships WHERE role NOT IN ('member', 'manager');
    UPDATE memberships SET role = 'member' WHERE role NOT IN ('member', 'manager');
    RAISE NOTICE 'Converted % other roles to member', other_count;
END $$;

-- STEP 4: Create new clean constraint
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check 
CHECK (role IN ('member', 'manager'));

-- STEP 5: Verify success
DO $$
DECLARE
    member_count INTEGER;
    manager_count INTEGER;
    superadmin_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== FINAL VERIFICATION ===';
    
    SELECT COUNT(*) INTO member_count FROM memberships WHERE role = 'member';
    SELECT COUNT(*) INTO manager_count FROM memberships WHERE role = 'manager';
    SELECT COUNT(*) INTO superadmin_count FROM memberships WHERE is_superadmin = true;
    
    RAISE NOTICE 'Final role counts:';
    RAISE NOTICE '  Members: %', member_count;
    RAISE NOTICE '  Managers: %', manager_count;
    RAISE NOTICE '  SuperAdmins: %', superadmin_count;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ SUCCESS! Role system simplified to member/manager only';
    RAISE NOTICE '🛡️ All SuperAdmin privileges preserved';
    RAISE NOTICE '🎯 Ready to test role assignments in the UI';
END $$;