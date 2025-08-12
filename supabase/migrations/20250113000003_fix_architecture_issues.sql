-- Fix the architecture migration issues
-- This migration addresses the database schema problems

-- First, let's ensure the profiles table has proper relationships
DROP VIEW IF EXISTS user_management_view;

-- Fix profiles table relationships
ALTER TABLE profiles 
ADD CONSTRAINT profiles_id_fkey 
FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;

-- Ensure memberships has proper user reference
-- The memberships.user_id should reference auth.users(id), but we can't create FK to auth schema
-- So we'll ensure it references profiles.id instead for our queries to work
-- Update any orphaned memberships to reference actual users

-- Remove any memberships that reference non-existent users
DELETE FROM memberships 
WHERE user_id NOT IN (SELECT id FROM auth.users);

-- Fix the user_management_view to work with the current schema
CREATE OR REPLACE VIEW user_management_view AS
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.created_at,
  p.avatar_url,
  COALESCE(
    json_agg(
      DISTINCT jsonb_build_object(
        'org_id', m.org_id,
        'role', m.role,
        'is_superadmin', m.is_superadmin,
        'organization', jsonb_build_object(
          'id', o.id,
          'name', o.name,
          'domain', o.domain,
          'primary_color', o.primary_color
        )
      )
    ) FILTER (WHERE m.org_id IS NOT NULL),
    '[]'::json
  ) as memberships
FROM profiles p
LEFT JOIN memberships m ON m.user_id = p.id
LEFT JOIN organizations o ON o.id = m.org_id
GROUP BY p.id, p.email, p.full_name, p.created_at, p.avatar_url;

-- Update the organization_details view to ensure it works
DROP VIEW IF EXISTS organization_details;
CREATE OR REPLACE VIEW organization_details AS
SELECT 
  o.id,
  o.name,
  o.domain,
  o.logo_url,
  o.primary_color,
  o.secondary_color,
  o.bridge_steps,
  o.openai_assistant_id,
  o.openai_vector_store_id,
  o.created_by,
  o.created_at,
  o.is_demo,
  COUNT(m.user_id) as member_count
FROM organizations o
LEFT JOIN memberships m ON m.org_id = o.id
GROUP BY o.id, o.name, o.domain, o.logo_url, o.primary_color, o.secondary_color, 
         o.bridge_steps, o.openai_assistant_id, o.openai_vector_store_id, 
         o.created_by, o.created_at, o.is_demo;

-- Ensure proper grants
GRANT SELECT ON organization_details TO authenticated;
GRANT SELECT ON user_management_view TO authenticated;

-- Fix the create_organization_as_superadmin function to ensure it works
DROP FUNCTION IF EXISTS create_organization_as_superadmin;
CREATE OR REPLACE FUNCTION create_organization_as_superadmin(
  org_name TEXT,
  org_domain TEXT DEFAULT NULL,
  org_primary_color TEXT DEFAULT '#3B82F6',
  org_secondary_color TEXT DEFAULT '#1E40AF'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_org_id UUID;
  caller_is_superadmin BOOLEAN := false;
BEGIN
  -- Check if caller is SuperAdmin
  SELECT EXISTS (
    SELECT 1 FROM memberships 
    WHERE user_id = auth.uid() 
    AND is_superadmin = true
  ) INTO caller_is_superadmin;

  IF NOT caller_is_superadmin THEN
    RAISE EXCEPTION 'Only SuperAdmins can create organizations';
  END IF;

  -- Create the organization
  INSERT INTO organizations (
    name, 
    domain, 
    primary_color, 
    secondary_color, 
    created_by,
    bridge_steps
  )
  VALUES (
    org_name, 
    org_domain, 
    org_primary_color, 
    org_secondary_color, 
    auth.uid(),
    '[
      {"key": "pinpoint_pain", "name": "Pinpoint Pain", "weight": 4, "order": 1},
      {"key": "qualify", "name": "Qualify", "weight": 3, "order": 2},
      {"key": "solution_success", "name": "Solution Success", "weight": 3, "order": 3},
      {"key": "qa", "name": "Q&A", "weight": 3, "order": 4},
      {"key": "next_steps", "name": "Next Steps", "weight": 4, "order": 5},
      {"key": "close_or_schedule", "name": "Close or Schedule", "weight": 3, "order": 6}
    ]'::jsonb
  )
  RETURNING id INTO new_org_id;

  RETURN json_build_object(
    'success', true,
    'organization_id', new_org_id,
    'message', 'Organization created successfully'
  );
END;
$$;

-- Grant permissions
GRANT EXECUTE ON FUNCTION create_organization_as_superadmin TO authenticated;

-- Clean up any broken references in the scoring system
-- Update the scoring system to use organizations directly
UPDATE calls 
SET organization_id = (
  SELECT m.org_id 
  FROM memberships m 
  WHERE m.user_id = calls.user_id 
  LIMIT 1
)
WHERE organization_id IS NULL AND client_id IS NOT NULL;

-- Update the newCallScoring to use organization_id instead of client_id
-- The application will need to be updated to use organization_id in scoring logic

-- Create a function to deploy after Edge Functions are ready
CREATE OR REPLACE FUNCTION invite_user_placeholder(
  user_email TEXT,
  user_full_name TEXT DEFAULT '',
  user_org_id UUID DEFAULT NULL,
  user_role TEXT DEFAULT 'member',
  user_is_superadmin BOOLEAN DEFAULT FALSE
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- This is a placeholder until Edge Functions are deployed
  RETURN json_build_object(
    'success', false,
    'message', 'Please deploy the Edge Function first: supabase functions deploy invite-user'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION invite_user_placeholder TO authenticated;

-- Success message
SELECT 'Architecture issues fixed. Deploy Edge Functions next.' as status;