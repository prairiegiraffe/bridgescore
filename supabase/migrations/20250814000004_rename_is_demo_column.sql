-- Check if is_demo column exists and rename it to demo_mode if needed

DO $$
BEGIN
  -- Check if is_demo column exists in organizations table
  IF EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'organizations' 
    AND column_name = 'is_demo'
  ) THEN
    -- Rename is_demo to demo_mode
    ALTER TABLE organizations RENAME COLUMN is_demo TO demo_mode;
  END IF;
  
  -- Ensure demo_mode column exists (in case neither existed)
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.columns 
    WHERE table_name = 'organizations' 
    AND column_name = 'demo_mode'
  ) THEN
    -- Add demo_mode column if it doesn't exist
    ALTER TABLE organizations ADD COLUMN demo_mode BOOLEAN DEFAULT false;
  END IF;
END $$;