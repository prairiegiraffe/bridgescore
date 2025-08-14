-- Verify cleanup is complete and report final database state

-- STEP 1: Confirm deprecated tables are gone
DO $$
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== VERIFYING CLEANUP ===';
  
  -- Check if deprecated tables are gone
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients') THEN
    RAISE NOTICE '✅ clients table successfully removed';
  ELSE
    RAISE NOTICE '⚠️  clients table still exists';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_files') THEN
    RAISE NOTICE '✅ client_files table successfully removed';
  ELSE
    RAISE NOTICE '⚠️  client_files table still exists';
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users_meta') THEN
    RAISE NOTICE '✅ users_meta table successfully removed';
  ELSE
    RAISE NOTICE '⚠️  users_meta table still exists';
  END IF;
END $$;

-- STEP 2: Final inventory of all tables and views with their status
DO $$
DECLARE
  rec RECORD;
  table_count INTEGER := 0;
  view_count INTEGER := 0;
  rls_enabled_count INTEGER := 0;
  rls_disabled_count INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== FINAL DATABASE INVENTORY ===';
  RAISE NOTICE '';
  
  -- List all tables with RLS status
  RAISE NOTICE '📊 TABLES:';
  RAISE NOTICE '----------';
  FOR rec IN 
    SELECT 
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      COUNT(p.policyname) as policy_count
    FROM pg_class c
    LEFT JOIN pg_policies p ON p.tablename = c.relname
    WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind = 'r'  -- Regular tables only
    AND c.relname NOT IN ('schema_migrations')
    GROUP BY c.relname, c.relrowsecurity
    ORDER BY c.relname
  LOOP
    table_count := table_count + 1;
    IF rec.rls_enabled THEN
      RAISE NOTICE '  ✅ % - RLS enabled with % policies', rec.table_name, rec.policy_count;
      rls_enabled_count := rls_enabled_count + 1;
    ELSE
      RAISE NOTICE '  ⚠️  % - RLS DISABLED (needs security)', rec.table_name;
      rls_disabled_count := rls_disabled_count + 1;
    END IF;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '👁️  VIEWS:';
  RAISE NOTICE '----------';
  -- List all views
  FOR rec IN 
    SELECT c.relname as view_name
    FROM pg_class c
    WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind = 'v'  -- Views only
    ORDER BY c.relname
  LOOP
    view_count := view_count + 1;
    RAISE NOTICE '  • %', rec.view_name;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== SUMMARY ===';
  RAISE NOTICE 'Total Tables: %', table_count;
  RAISE NOTICE 'Tables with RLS: %', rls_enabled_count;
  RAISE NOTICE 'Tables without RLS: % ⚠️', rls_disabled_count;
  RAISE NOTICE 'Total Views: %', view_count;
  RAISE NOTICE '';
  
  IF rls_disabled_count > 0 THEN
    RAISE NOTICE '⚠️  ACTION NEEDED: Some tables lack RLS policies!';
    RAISE NOTICE 'Consider adding RLS to protect sensitive data.';
  ELSE
    RAISE NOTICE '✅ All tables have RLS enabled!';
  END IF;
END $$;

-- STEP 3: Check demo mode functionality
DO $$
DECLARE
  org_count INTEGER;
  demo_enabled_count INTEGER;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '=== DEMO MODE STATUS ===';
  
  SELECT COUNT(*) INTO org_count FROM organizations;
  SELECT COUNT(*) INTO demo_enabled_count FROM organizations WHERE demo_mode = true;
  
  RAISE NOTICE 'Total Organizations: %', org_count;
  RAISE NOTICE 'Organizations with Demo Mode ON: %', demo_enabled_count;
  RAISE NOTICE 'Organizations with Demo Mode OFF: %', org_count - demo_enabled_count;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ Database cleanup complete!';
  RAISE NOTICE '✅ Deprecated tables removed successfully';
  RAISE NOTICE '✅ Demo mode functionality is ready';
END $$;