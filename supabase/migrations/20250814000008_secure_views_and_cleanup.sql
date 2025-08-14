-- Secure unrestricted views and identify obsolete tables

-- STEP 1: Secure membership_with_profiles view
DROP VIEW IF EXISTS membership_with_profiles CASCADE;

-- Recreate as a secure view that only shows memberships for the current user's org
CREATE OR REPLACE VIEW membership_with_profiles AS
SELECT 
  m.id,
  m.user_id,
  m.org_id,
  m.role,
  m.is_superadmin,
  m.created_at,
  u.email,
  u.raw_user_meta_data->>'full_name' as full_name
FROM memberships m
JOIN auth.users u ON m.user_id = u.id
WHERE m.org_id IN (
  SELECT org_id FROM memberships 
  WHERE user_id = auth.uid()
);

-- Grant appropriate permissions
GRANT SELECT ON membership_with_profiles TO authenticated;

-- STEP 2: Secure user_management_view
DROP VIEW IF EXISTS user_management_view CASCADE;

-- Recreate as a secure view for superadmins only
CREATE OR REPLACE VIEW user_management_view AS
SELECT 
  u.id,
  u.email,
  u.created_at,
  u.last_sign_in_at,
  u.raw_user_meta_data->>'full_name' as full_name,
  m.org_id,
  m.role,
  m.is_superadmin,
  o.name as org_name
FROM auth.users u
LEFT JOIN memberships m ON u.id = m.user_id
LEFT JOIN organizations o ON m.org_id = o.id
WHERE EXISTS (
  SELECT 1 FROM memberships 
  WHERE user_id = auth.uid() 
  AND is_superadmin = true
);

-- Grant appropriate permissions
GRANT SELECT ON user_management_view TO authenticated;

-- STEP 3: Check for obsolete tables and report them
DO $$
DECLARE
  table_record RECORD;
  obsolete_tables TEXT := '';
BEGIN
  -- Check if clients table exists (might be obsolete if using organizations)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'clients' 
    AND table_type = 'BASE TABLE'
  ) THEN
    -- Check if it has any recent data
    SELECT COUNT(*) INTO table_record FROM clients WHERE created_at > NOW() - INTERVAL '30 days';
    IF table_record.count = 0 THEN
      obsolete_tables := obsolete_tables || 'clients (no recent data - consider migrating to organizations), ';
    END IF;
  END IF;

  -- Check if client_files exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'client_files' 
    AND table_type = 'BASE TABLE'
  ) THEN
    obsolete_tables := obsolete_tables || 'client_files (might be obsolete), ';
  END IF;

  -- Check if profiles table exists (might duplicate auth.users)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'profiles' 
    AND table_type = 'BASE TABLE'
  ) THEN
    obsolete_tables := obsolete_tables || 'profiles (might duplicate auth.users), ';
  END IF;

  -- Check if users_meta exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'users_meta' 
    AND table_type = 'BASE TABLE'
  ) THEN
    obsolete_tables := obsolete_tables || 'users_meta (might duplicate auth.users metadata), ';
  END IF;

  -- Check if pivots exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'pivots' 
    AND table_type = 'BASE TABLE'
  ) THEN
    obsolete_tables := obsolete_tables || 'pivots (purpose unclear), ';
  END IF;

  IF LENGTH(obsolete_tables) > 0 THEN
    RAISE NOTICE 'Potentially obsolete tables found: %', obsolete_tables;
    RAISE NOTICE 'Review these tables and consider removing them if not needed.';
  ELSE
    RAISE NOTICE 'No obviously obsolete tables found.';
  END IF;
END $$;

-- STEP 4: Add RLS to any tables that are missing it
ALTER TABLE calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE call_score_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;

-- Add basic RLS policies if they don't exist
-- For calls table
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'calls' 
    AND policyname = 'Users can view their org calls'
  ) THEN
    CREATE POLICY "Users can view their org calls" ON calls
      FOR SELECT USING (
        org_id IN (
          SELECT org_id FROM memberships 
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Report on table security status
DO $$
DECLARE
  rec RECORD;
  unsecured_tables TEXT := '';
BEGIN
  FOR rec IN 
    SELECT tablename 
    FROM pg_tables 
    WHERE schemaname = 'public' 
    AND tablename NOT IN ('schema_migrations', 'app_settings') -- These might be ok without RLS
    AND NOT EXISTS (
      SELECT 1 FROM pg_policies 
      WHERE pg_policies.tablename = pg_tables.tablename
    )
  LOOP
    unsecured_tables := unsecured_tables || rec.tablename || ', ';
  END LOOP;
  
  IF LENGTH(unsecured_tables) > 0 THEN
    RAISE NOTICE 'Tables without RLS policies: %', unsecured_tables;
  END IF;
END $$;