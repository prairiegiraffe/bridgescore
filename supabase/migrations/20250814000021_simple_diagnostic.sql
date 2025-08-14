-- Simple diagnostic queries to see what's happening

-- Show current user and memberships
SELECT 
  'Current User Info' as info_type,
  auth.uid() as user_id,
  (SELECT email FROM auth.users WHERE id = auth.uid()) as email;

-- Show all memberships for current user
SELECT 
  'User Memberships' as info_type,
  m.org_id,
  m.role,
  m.is_superadmin,
  o.name as org_name
FROM memberships m
JOIN organizations o ON m.org_id = o.id
WHERE m.user_id = auth.uid();

-- Show all organizations
SELECT 
  'All Organizations' as info_type,
  id,
  name,
  demo_mode
FROM organizations;

-- Test organization_details view
SELECT 
  'organization_details test' as info_type,
  COUNT(*) as row_count
FROM organization_details;

-- Test membership_with_profiles view  
SELECT 
  'membership_with_profiles test' as info_type,
  COUNT(*) as row_count
FROM membership_with_profiles;

-- Check RLS status
SELECT 
  'RLS Status' as info_type,
  'organizations' as table_name,
  relrowsecurity as rls_enabled
FROM pg_class 
WHERE relname = 'organizations'
UNION ALL
SELECT 
  'RLS Status' as info_type,
  'memberships' as table_name,
  relrowsecurity as rls_enabled
FROM pg_class 
WHERE relname = 'memberships';