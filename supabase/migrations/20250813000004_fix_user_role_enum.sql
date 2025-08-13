-- Fix user_role enum type issue that's causing migration failures
-- This creates the missing enum type that other migrations reference

-- First, check if the enum already exists and create it if it doesn't
DO $$
BEGIN
  -- Check if the user_role type exists
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
    -- Create the enum type with all possible values
    CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'superadmin');
  ELSE
    -- If it exists, make sure it has the superadmin value
    BEGIN
      ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'superadmin';
    EXCEPTION
      WHEN duplicate_object THEN
        NULL; -- Ignore if value already exists
    END;
  END IF;
END $$;

-- Ensure memberships table uses the enum type (if not already)
-- We'll be conservative and only add a check constraint for now
-- This won't break existing data
DO $$
BEGIN
  -- Add a check constraint to ensure valid roles
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'memberships_role_check' 
    AND table_name = 'memberships'
  ) THEN
    ALTER TABLE memberships 
    ADD CONSTRAINT memberships_role_check 
    CHECK (role IN ('owner', 'admin', 'member', 'superadmin'));
  END IF;
END $$;