-- Fix inconsistent foreign key references and improve data integrity

-- Ensure all user references point to auth.users consistently
-- Some tables reference profiles(id) while others reference auth.users(id)

-- First, ensure all profiles exist for auth users
INSERT INTO profiles (id, email, full_name, updated_at)
SELECT 
  au.id, 
  au.email, 
  COALESCE(au.raw_user_meta_data->>'full_name', au.email), 
  NOW()
FROM auth.users au
LEFT JOIN profiles p ON p.id = au.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Add proper foreign key constraints where missing
-- These use IF NOT EXISTS pattern to be safe

-- Ensure calls.user_id references auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'calls_user_id_fkey' 
    AND table_name = 'calls'
  ) THEN
    ALTER TABLE calls 
    ADD CONSTRAINT calls_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Ensure calls.org_id references organizations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'calls_org_id_fkey' 
    AND table_name = 'calls'
  ) THEN
    ALTER TABLE calls 
    ADD CONSTRAINT calls_org_id_fkey 
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Ensure resources.org_id references organizations
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'resources_org_id_fkey' 
    AND table_name = 'resources'
  ) THEN
    ALTER TABLE resources 
    ADD CONSTRAINT resources_org_id_fkey 
    FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Ensure user_files.user_id references auth.users
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints 
    WHERE constraint_name = 'user_files_user_id_fkey' 
    AND table_name = 'user_files'
  ) THEN
    ALTER TABLE user_files 
    ADD CONSTRAINT user_files_user_id_fkey 
    FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- Add proper CASCADE behavior for organization deletions
-- When an organization is deleted, related data should be cleaned up properly

-- Update existing foreign keys to have proper CASCADE behavior
-- We'll do this carefully to avoid breaking existing data

-- For calls: SET NULL when org is deleted (preserve the call data)
ALTER TABLE calls DROP CONSTRAINT IF EXISTS calls_org_id_fkey;
ALTER TABLE calls 
ADD CONSTRAINT calls_org_id_fkey 
FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE SET NULL;

-- For resources: CASCADE delete when org is deleted (resources belong to org)
ALTER TABLE resources DROP CONSTRAINT IF EXISTS resources_org_id_fkey;
ALTER TABLE resources 
ADD CONSTRAINT resources_org_id_fkey 
FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- For saved_views: CASCADE delete when org is deleted
ALTER TABLE saved_views DROP CONSTRAINT IF EXISTS saved_views_org_id_fkey;
ALTER TABLE saved_views 
ADD CONSTRAINT saved_views_org_id_fkey 
FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- Add NOT NULL constraints where they make sense
-- But only where it won't break existing data

-- Ensure organizations have names
UPDATE organizations SET name = 'Unnamed Organization' WHERE name IS NULL OR name = '';
ALTER TABLE organizations ALTER COLUMN name SET NOT NULL;

-- Ensure memberships have valid roles and references
DELETE FROM memberships WHERE role IS NULL OR role = '';
ALTER TABLE memberships ALTER COLUMN role SET NOT NULL;
ALTER TABLE memberships ALTER COLUMN org_id SET NOT NULL;
ALTER TABLE memberships ALTER COLUMN user_id SET NOT NULL;

-- Add check constraints for data integrity
ALTER TABLE calls 
ADD CONSTRAINT calls_score_total_range 
CHECK (score_total IS NULL OR (score_total >= 0 AND score_total <= 100));

ALTER TABLE memberships 
ADD CONSTRAINT memberships_role_valid 
CHECK (role IN ('owner', 'admin', 'member', 'superadmin'));

-- Add unique constraints where they make sense
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_memberships_user_org_unique 
ON memberships(user_id, org_id);

-- Replace the existing unique constraint if it exists
ALTER TABLE memberships DROP CONSTRAINT IF EXISTS memberships_user_id_org_id_key;
ALTER TABLE memberships 
ADD CONSTRAINT memberships_user_id_org_id_key 
UNIQUE USING INDEX idx_memberships_user_org_unique;

-- Ensure profiles have proper constraints
ALTER TABLE profiles ALTER COLUMN id SET NOT NULL;
ALTER TABLE profiles ALTER COLUMN updated_at SET NOT NULL;