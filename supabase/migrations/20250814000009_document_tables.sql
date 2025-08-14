-- Document all tables and their purposes (NO DELETIONS - just documentation)

-- Add comments to document what each table is for
COMMENT ON TABLE organizations IS 'Companies/clients using BridgeScore';
COMMENT ON TABLE memberships IS 'Links users to organizations with roles (SuperAdmin/Manager/Staff)';
COMMENT ON TABLE calls IS 'Sales call records and scores';
COMMENT ON TABLE resources IS 'Training materials and resources';
COMMENT ON TABLE app_settings IS 'Global application settings (branding, etc)';

-- Feature tables
COMMENT ON TABLE pivots IS 'Magic Pivots - key phrases to use in sales calls per organization';
COMMENT ON TABLE coaching_tasks IS 'Future feature - coaching tasks for team members';
COMMENT ON TABLE call_score_history IS 'Audit trail of score changes and rescoring events';
COMMENT ON TABLE ai_assistant_versions IS 'Tracks different AI model versions used for scoring';
COMMENT ON TABLE ai_knowledge_packs IS 'AI training data and knowledge base content';
COMMENT ON TABLE saved_views IS 'User saved filters and dashboard views';
COMMENT ON TABLE review_queue IS 'Calls queued for manual review';
COMMENT ON TABLE org_ai_configs IS 'Organization-specific AI configuration';

-- Tables that might need migration
COMMENT ON TABLE clients IS 'DEPRECATED - Should use organizations table instead';
COMMENT ON TABLE client_files IS 'DEPRECATED - Files should be linked to organizations';

-- User-related tables
COMMENT ON TABLE profiles IS 'Additional user profile data beyond auth.users';
COMMENT ON TABLE users_meta IS 'Extended user metadata';

-- Views (these don't store data, just query other tables)
COMMENT ON VIEW organization_details IS 'View of organizations with computed fields like member_count';
COMMENT ON VIEW membership_with_profiles IS 'View joining memberships with user profile data';
COMMENT ON VIEW user_management_view IS 'Admin view for managing users across organizations';

-- Check what's in the potentially deprecated tables
DO $$
DECLARE
  client_count INTEGER;
  client_files_count INTEGER;
  profiles_count INTEGER;
  users_meta_count INTEGER;
BEGIN
  -- Check clients table
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients') THEN
    SELECT COUNT(*) INTO client_count FROM clients;
    RAISE NOTICE 'clients table has % records', client_count;
    
    -- Check if clients has data not in organizations
    PERFORM * FROM clients c WHERE NOT EXISTS (
      SELECT 1 FROM organizations o WHERE o.id = c.id OR o.name = c.name
    ) LIMIT 1;
    IF FOUND THEN
      RAISE NOTICE 'WARNING: clients table has data not in organizations table - needs migration';
    END IF;
  END IF;

  -- Check client_files
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_files') THEN
    SELECT COUNT(*) INTO client_files_count FROM client_files;
    RAISE NOTICE 'client_files table has % records', client_files_count;
  END IF;

  -- Check profiles
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'profiles') THEN
    SELECT COUNT(*) INTO profiles_count FROM profiles;
    RAISE NOTICE 'profiles table has % records', profiles_count;
  END IF;

  -- Check users_meta
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'users_meta') THEN
    SELECT COUNT(*) INTO users_meta_count FROM users_meta;
    RAISE NOTICE 'users_meta table has % records', users_meta_count;
  END IF;
END $$;

-- Report on RLS status for each table
DO $$
DECLARE
  rec RECORD;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE 'RLS Security Status:';
  RAISE NOTICE '-------------------';
  
  FOR rec IN 
    SELECT 
      c.relname as table_name,
      c.relrowsecurity as rls_enabled,
      COUNT(p.policyname) as policy_count
    FROM pg_class c
    LEFT JOIN pg_policies p ON p.tablename = c.relname
    WHERE c.relnamespace = 'public'::regnamespace
    AND c.relkind = 'r'  -- Only regular tables
    AND c.relname NOT IN ('schema_migrations')  -- Exclude migration tracking
    GROUP BY c.relname, c.relrowsecurity
    ORDER BY c.relname
  LOOP
    IF rec.rls_enabled THEN
      RAISE NOTICE '✅ % - RLS enabled with % policies', rec.table_name, rec.policy_count;
    ELSE
      RAISE NOTICE '⚠️  % - RLS DISABLED', rec.table_name;
    END IF;
  END LOOP;
END $$;