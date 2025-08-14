-- Fix duplicate demo columns (both is_demo and demo_mode exist)

DO $$
BEGIN
  -- Check if both columns exist
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'organizations' 
    AND column_name = 'is_demo'
  ) AND EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'organizations' 
    AND column_name = 'demo_mode'
  ) THEN
    -- Both exist, so migrate data from is_demo to demo_mode if needed
    UPDATE organizations 
    SET demo_mode = is_demo 
    WHERE demo_mode IS NULL OR demo_mode = false;
    
    -- Drop the is_demo column
    ALTER TABLE organizations DROP COLUMN is_demo;
    
    RAISE NOTICE 'Migrated is_demo data to demo_mode and removed is_demo column';
  
  ELSIF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'organizations' 
    AND column_name = 'is_demo'
  ) THEN
    -- Only is_demo exists, rename it
    ALTER TABLE organizations RENAME COLUMN is_demo TO demo_mode;
    RAISE NOTICE 'Renamed is_demo to demo_mode';
    
  ELSIF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'organizations' 
    AND column_name = 'demo_mode'
  ) THEN
    -- Neither exists, create demo_mode
    ALTER TABLE organizations ADD COLUMN demo_mode BOOLEAN DEFAULT false;
    RAISE NOTICE 'Added demo_mode column';
  ELSE
    RAISE NOTICE 'demo_mode column already exists and is_demo does not exist - no action needed';
  END IF;
END $$;

-- Ensure demo_mode has a default value
ALTER TABLE organizations ALTER COLUMN demo_mode SET DEFAULT false;

-- Update any NULL values to false
UPDATE organizations SET demo_mode = false WHERE demo_mode IS NULL;