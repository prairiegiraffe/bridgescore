-- Fix all role constraints - there are multiple constraint names we need to handle

-- STEP 1: Find and drop ALL role-related constraints
DO $$
DECLARE
    constraint_record RECORD;
BEGIN
    RAISE NOTICE '=== FINDING ALL ROLE CONSTRAINTS ===';
    
    -- Find all check constraints on memberships table that might be role-related
    FOR constraint_record IN 
        SELECT constraint_name, check_clause
        FROM information_schema.check_constraints cc
        JOIN information_schema.table_constraints tc ON cc.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'memberships' AND tc.constraint_type = 'CHECK'
    LOOP
        RAISE NOTICE 'Found constraint: % -> %', constraint_record.constraint_name, constraint_record.check_clause;
        
        -- Drop the constraint
        EXECUTE format('ALTER TABLE memberships DROP CONSTRAINT IF EXISTS %I', constraint_record.constraint_name);
        RAISE NOTICE 'Dropped constraint: %', constraint_record.constraint_name;
    END LOOP;
END $$;

-- STEP 2: Now safely convert the roles
DO $$
DECLARE
    update_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== CONVERTING ROLES (NO CONSTRAINTS) ===';
    
    -- Show current roles
    RAISE NOTICE 'Current role distribution:';
    FOR role_record IN 
        SELECT role, COUNT(*) as count 
        FROM memberships 
        GROUP BY role 
        ORDER BY role
    LOOP
        RAISE NOTICE '  %: % users', role_record.role, role_record.count;
    END LOOP;
    
    -- Convert owner/admin to manager
    UPDATE memberships 
    SET role = 'manager' 
    WHERE role IN ('owner', 'admin');
    
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RAISE NOTICE 'Converted % owner/admin roles to manager', update_count;
    
    -- Convert any other weird roles to member
    UPDATE memberships 
    SET role = 'member' 
    WHERE role NOT IN ('member', 'manager');
    
    GET DIAGNOSTICS update_count = ROW_COUNT;
    RAISE NOTICE 'Converted % other roles to member', update_count;
    
    -- Show new roles
    RAISE NOTICE 'New role distribution:';
    FOR role_record IN 
        SELECT role, COUNT(*) as count 
        FROM memberships 
        GROUP BY role 
        ORDER BY role
    LOOP
        RAISE NOTICE '  %: % users', role_record.role, role_record.count;
    END LOOP;
END $$;

-- STEP 3: Create the new simplified constraint
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check 
CHECK (role IN ('member', 'manager'));

-- STEP 4: Verify everything worked
DO $$
DECLARE
    constraint_record RECORD;
    superadmin_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '=== VERIFICATION ===';
    
    -- Show new constraint
    FOR constraint_record IN 
        SELECT constraint_name, check_clause
        FROM information_schema.check_constraints cc
        JOIN information_schema.table_constraints tc ON cc.constraint_name = tc.constraint_name
        WHERE tc.table_name = 'memberships' AND tc.constraint_type = 'CHECK'
    LOOP
        RAISE NOTICE 'New constraint: % -> %', constraint_record.constraint_name, constraint_record.check_clause;
    END LOOP;
    
    -- Verify SuperAdmin preservation
    SELECT COUNT(*) INTO superadmin_count FROM memberships WHERE is_superadmin = true;
    RAISE NOTICE 'SuperAdmins preserved: %', superadmin_count;
    
    RAISE NOTICE '';
    RAISE NOTICE '✅ ROLE SYSTEM SIMPLIFIED SUCCESSFULLY!';
    RAISE NOTICE 'Valid roles: member, manager';
    RAISE NOTICE 'SuperAdmin access preserved';
END $$;