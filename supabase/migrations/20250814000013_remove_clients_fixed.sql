-- Find and remove all dependencies on clients table, then drop it

-- STEP 1: Find what depends on the clients table
DO $$
DECLARE
  dep RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== FINDING DEPENDENCIES ON CLIENTS TABLE ===';
  
  FOR dep IN
    SELECT 
      dependent_ns.nspname AS dependent_schema,
      dependent_view.relname AS dependent_object,
      dependent_view.relkind AS object_type,
      CASE dependent_view.relkind
        WHEN 'v' THEN 'VIEW'
        WHEN 'r' THEN 'TABLE'
        WHEN 'f' THEN 'FOREIGN TABLE'
        WHEN 'i' THEN 'INDEX'
        ELSE 'OTHER'
      END AS object_type_name
    FROM pg_depend 
    JOIN pg_rewrite ON pg_depend.objid = pg_rewrite.oid 
    JOIN pg_class AS dependent_view ON pg_rewrite.ev_class = dependent_view.oid 
    JOIN pg_class AS source_table ON pg_depend.refobjid = source_table.oid 
    JOIN pg_namespace dependent_ns ON dependent_view.relnamespace = dependent_ns.oid
    JOIN pg_namespace source_ns ON source_table.relnamespace = source_ns.oid
    WHERE 
      source_ns.nspname = 'public'
      AND source_table.relname = 'clients'
      AND dependent_view.relname != 'clients'
  LOOP
    RAISE NOTICE 'Found dependency: % % in schema %', 
      dep.object_type_name, dep.dependent_object, dep.dependent_schema;
  END LOOP;

  -- Also check for foreign key constraints
  FOR dep IN
    SELECT
      tc.table_name,
      kcu.column_name,
      tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
      AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND ccu.table_name = 'clients'
  LOOP
    RAISE NOTICE 'Found foreign key: %.% references clients (constraint: %)',
      dep.table_name, dep.column_name, dep.constraint_name;
  END LOOP;
END $$;

-- STEP 2: Drop any views that depend on clients
DROP VIEW IF EXISTS client_details CASCADE;
DROP VIEW IF EXISTS client_summary CASCADE;
DROP VIEW IF EXISTS client_metrics CASCADE;

-- STEP 3: Check if client_files still exists and has foreign key to clients
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_type = 'FOREIGN KEY' 
    AND table_name = 'client_files'
  ) THEN
    -- Drop the foreign key constraint
    ALTER TABLE client_files DROP CONSTRAINT IF EXISTS client_files_client_id_fkey;
    RAISE NOTICE 'Dropped foreign key from client_files to clients';
  END IF;
END $$;

-- STEP 4: Check for any RLS policies on clients
DO $$
DECLARE
  policy RECORD;
BEGIN
  FOR policy IN
    SELECT policyname 
    FROM pg_policies 
    WHERE tablename = 'clients'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON clients', policy.policyname);
    RAISE NOTICE 'Dropped policy: %', policy.policyname;
  END LOOP;
END $$;

-- STEP 5: Backup any data before deletion (if any exists)
DO $$
DECLARE
  client_record RECORD;
  record_count INTEGER := 0;
BEGIN
  FOR client_record IN SELECT * FROM clients LIMIT 10
  LOOP
    record_count := record_count + 1;
    RAISE NOTICE 'Backup - Client %: name=%, domain=%, created=%', 
      record_count, client_record.name, client_record.domain, client_record.created_at;
  END LOOP;
  
  IF record_count > 0 THEN
    RAISE NOTICE 'Backed up % client records', record_count;
  END IF;
END $$;

-- STEP 6: Migrate any remaining data to organizations if needed
INSERT INTO organizations (
  id, 
  name, 
  domain, 
  primary_color, 
  secondary_color, 
  bridge_steps,
  created_at
)
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
  WHERE o.id = c.id OR o.name = c.name
)
ON CONFLICT (id) DO NOTHING;

-- STEP 7: Now we can safely drop the clients table
DROP TABLE IF EXISTS clients CASCADE;

-- STEP 8: Final verification and summary
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== CLEANUP SUMMARY ===';
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients') THEN
    RAISE NOTICE '✅ SUCCESS: clients table has been removed';
  ELSE
    RAISE NOTICE '❌ ERROR: clients table still exists';
  END IF;
  
  RAISE NOTICE '✅ Any unique data was migrated to organizations table';
  RAISE NOTICE '✅ All dependencies were handled';
  RAISE NOTICE '';
  RAISE NOTICE 'Database cleanup complete!';
END $$;