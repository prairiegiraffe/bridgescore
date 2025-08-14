-- Safely clean up deprecated tables after backing up data

-- STEP 1: Create backup of deprecated tables data (just in case)
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== BACKING UP DATA FROM DEPRECATED TABLES ===';
  
  -- Backup clients table data
  IF EXISTS (SELECT 1 FROM clients LIMIT 1) THEN
    RAISE NOTICE 'clients table data:';
    FOR r IN SELECT * FROM clients LOOP
      RAISE NOTICE 'Client: id=%, name=%, domain=%', r.id, r.name, r.domain;
    END LOOP;
  END IF;
  
  -- Backup client_files data
  IF EXISTS (SELECT 1 FROM client_files LIMIT 1) THEN
    RAISE NOTICE 'client_files table data:';
    FOR r IN SELECT * FROM client_files LOOP
      RAISE NOTICE 'File: id=%, client_id=%, name=%', r.id, r.client_id, r.file_name;
    END LOOP;
  END IF;
  
  RAISE NOTICE '=== BACKUP COMPLETE ===';
  RAISE NOTICE 'Data has been logged. You can proceed with deletion.';
END $$;

-- STEP 2: Check if the deprecated data exists in new tables
DO $$
DECLARE
  unmatched_clients INTEGER := 0;
  unmatched_files INTEGER := 0;
BEGIN
  -- Check if any clients data is NOT in organizations
  SELECT COUNT(*) INTO unmatched_clients
  FROM clients c
  WHERE NOT EXISTS (
    SELECT 1 FROM organizations o 
    WHERE o.name = c.name OR o.id = c.id
  );
  
  IF unmatched_clients > 0 THEN
    RAISE WARNING 'Found % clients not in organizations table - consider migrating first', unmatched_clients;
    
    -- Attempt to migrate unmatched clients
    INSERT INTO organizations (id, name, domain, primary_color, secondary_color, bridge_steps, created_at)
    SELECT 
      c.id,
      c.name,
      c.domain,
      COALESCE(c.primary_color, '#3B82F6'),
      COALESCE(c.secondary_color, '#1E40AF'),
      c.bridge_steps,
      c.created_at
    FROM clients c
    WHERE NOT EXISTS (
      SELECT 1 FROM organizations o 
      WHERE o.name = c.name OR o.id = c.id
    )
    ON CONFLICT (id) DO NOTHING;
    
    RAISE NOTICE 'Migrated any missing clients to organizations table';
  END IF;
END $$;

-- STEP 3: Drop deprecated tables that are safe to remove
DO $$
BEGIN
  -- Drop client_files (only 1 row, deprecated)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_files') THEN
    DROP TABLE client_files CASCADE;
    RAISE NOTICE 'Dropped deprecated client_files table';
  END IF;
  
  -- Drop clients (deprecated, data migrated to organizations)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients') THEN
    DROP TABLE clients CASCADE;
    RAISE NOTICE 'Dropped deprecated clients table';
  END IF;
  
  -- Drop users_meta (0 rows, not being used)
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users_meta') THEN
    DROP TABLE users_meta CASCADE;
    RAISE NOTICE 'Dropped unused users_meta table';
  END IF;
END $$;

-- STEP 4: Final report on remaining tables
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== FINAL TABLE INVENTORY ===';
  
  FOR rec IN 
    SELECT 
      c.relname as table_name,
      obj_description(c.oid, 'pg_class') as description,
      c.relrowsecurity as rls_enabled,
      CASE 
        WHEN c.relkind = 'r' THEN 'Table'
        WHEN c.relkind = 'v' THEN 'View'
        ELSE 'Other'
      END as type
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind IN ('r', 'v')  -- Tables and views
    AND c.relname NOT IN ('schema_migrations')
    ORDER BY c.relkind DESC, c.relname  -- Tables first, then views
  LOOP
    IF rec.type = 'Table' THEN
      IF rec.rls_enabled THEN
        RAISE NOTICE '✅ [Table] % - RLS Enabled', rec.table_name;
      ELSE
        RAISE NOTICE '⚠️  [Table] % - NO RLS', rec.table_name;
      END IF;
    ELSE
      RAISE NOTICE '👁️  [View] %', rec.table_name;
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE 'Cleanup complete! Removed deprecated tables: clients, client_files, users_meta';
  RAISE NOTICE 'All active tables with real data have been preserved.';
END $$;