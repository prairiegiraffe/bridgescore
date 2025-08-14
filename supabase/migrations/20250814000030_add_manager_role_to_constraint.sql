-- Add 'manager' role to the memberships role check constraint

-- First, let's see what the current constraint allows
DO $$
DECLARE
    constraint_def TEXT;
BEGIN
    -- Get the current constraint definition
    SELECT pg_get_constraintdef(oid) INTO constraint_def
    FROM pg_constraint 
    WHERE conname = 'memberships_role_check' AND conrelid = 'memberships'::regclass;
    
    RAISE NOTICE 'Current constraint definition: %', constraint_def;
END $$;

-- Drop the existing constraint
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_role_check;

-- Create a new constraint that includes 'manager'
ALTER TABLE memberships ADD CONSTRAINT memberships_role_check 
CHECK (role IN ('member', 'manager', 'admin', 'owner'));

-- Verify the new constraint
DO $$
DECLARE
    constraint_def TEXT;
BEGIN
    -- Get the new constraint definition
    SELECT pg_get_constraintdef(oid) INTO constraint_def
    FROM pg_constraint 
    WHERE conname = 'memberships_role_check' AND conrelid = 'memberships'::regclass;
    
    RAISE NOTICE 'New constraint definition: %', constraint_def;
    RAISE NOTICE '✅ Manager role has been added to valid roles: member, manager, admin, owner';
END $$;