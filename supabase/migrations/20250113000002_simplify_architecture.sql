-- Simplify the architecture: Organizations become the top-level entities
-- Remove the confusing Client/Organization distinction

-- Step 1: Migrate existing client data to organizations
-- First, let's see what we have and create a backup

-- Create a backup of current data
CREATE TABLE IF NOT EXISTS backup_organizations AS SELECT * FROM organizations;
CREATE TABLE IF NOT EXISTS backup_clients AS SELECT * FROM clients;

-- Update organizations to have the client properties directly
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS domain TEXT,
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#3B82F6',
ADD COLUMN IF NOT EXISTS secondary_color TEXT DEFAULT '#1E40AF',
ADD COLUMN IF NOT EXISTS bridge_steps JSONB DEFAULT '[
  {"key": "pinpoint_pain", "name": "Pinpoint Pain", "weight": 4, "order": 1},
  {"key": "qualify", "name": "Qualify", "weight": 3, "order": 2},
  {"key": "solution_success", "name": "Solution Success", "weight": 3, "order": 3},
  {"key": "qa", "name": "Q&A", "weight": 3, "order": 4},
  {"key": "next_steps", "name": "Next Steps", "weight": 4, "order": 5},
  {"key": "close_or_schedule", "name": "Close or Schedule", "weight": 3, "order": 6}
]'::jsonb,
ADD COLUMN IF NOT EXISTS openai_assistant_id TEXT,
ADD COLUMN IF NOT EXISTS openai_vector_store_id TEXT,
ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

-- Migrate data from clients to organizations where they're linked
UPDATE organizations o
SET 
  domain = c.domain,
  logo_url = c.logo_url,
  primary_color = COALESCE(c.primary_color, '#3B82F6'),
  secondary_color = COALESCE(c.secondary_color, '#1E40AF'),
  bridge_steps = COALESCE(c.bridge_steps, '[
    {"key": "pinpoint_pain", "name": "Pinpoint Pain", "weight": 4, "order": 1},
    {"key": "qualify", "name": "Qualify", "weight": 3, "order": 2},
    {"key": "solution_success", "name": "Solution Success", "weight": 3, "order": 3},
    {"key": "qa", "name": "Q&A", "weight": 3, "order": 4},
    {"key": "next_steps", "name": "Next Steps", "weight": 4, "order": 5},
    {"key": "close_or_schedule", "name": "Close or Schedule", "weight": 3, "order": 6}
  ]'::jsonb),
  openai_assistant_id = c.openai_assistant_id,
  openai_vector_store_id = c.openai_vector_store_id,
  created_by = c.created_by
FROM clients c
WHERE o.client_id = c.id;

-- For organizations that don't have a linked client, set defaults
UPDATE organizations 
SET 
  primary_color = COALESCE(primary_color, '#3B82F6'),
  secondary_color = COALESCE(secondary_color, '#1E40AF'),
  bridge_steps = COALESCE(bridge_steps, '[
    {"key": "pinpoint_pain", "name": "Pinpoint Pain", "weight": 4, "order": 1},
    {"key": "qualify", "name": "Qualify", "weight": 3, "order": 2},
    {"key": "solution_success", "name": "Solution Success", "weight": 3, "order": 3},
    {"key": "qa", "name": "Q&A", "weight": 3, "order": 4},
    {"key": "next_steps", "name": "Next Steps", "weight": 4, "order": 5},
    {"key": "close_or_schedule", "name": "Close or Schedule", "weight": 3, "order": 6}
  ]'::jsonb)
WHERE primary_color IS NULL OR bridge_steps IS NULL;

-- Update calls table to reference organizations directly instead of clients
ALTER TABLE calls 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Migrate call data to reference organizations directly
UPDATE calls c
SET organization_id = o.id
FROM organizations o
WHERE c.client_id = o.client_id AND c.client_id IS NOT NULL;

-- Update the scoring system to work with organizations
-- Update calls that reference clients to reference organizations instead
UPDATE calls 
SET organization_id = (
  SELECT id FROM organizations WHERE client_id = calls.client_id LIMIT 1
)
WHERE client_id IS NOT NULL AND organization_id IS NULL;

-- Update client_files to reference organizations instead
ALTER TABLE client_files 
ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

UPDATE client_files cf
SET organization_id = o.id
FROM organizations o
WHERE cf.client_id = o.client_id;

-- Create a view for backward compatibility during transition
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
  -- Count of members
  COUNT(m.user_id) as member_count
FROM organizations o
LEFT JOIN memberships m ON m.org_id = o.id
GROUP BY o.id, o.name, o.domain, o.logo_url, o.primary_color, o.secondary_color, 
         o.bridge_steps, o.openai_assistant_id, o.openai_vector_store_id, 
         o.created_by, o.created_at, o.is_demo;

-- Update RLS policies for the new structure
DROP POLICY IF EXISTS "SuperAdmins can manage all organizations" ON organizations;
DROP POLICY IF EXISTS "Users can view their organization" ON organizations;

CREATE POLICY "SuperAdmins can manage all organizations" ON organizations
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_superadmin = true
    )
  );

CREATE POLICY "Users can view their organization" ON organizations
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND org_id = organizations.id
    )
  );

-- Create function for SuperAdmins to create organizations
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
  caller_is_superadmin BOOLEAN;
BEGIN
  -- Check if caller is SuperAdmin
  SELECT is_superadmin INTO caller_is_superadmin
  FROM memberships
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF NOT caller_is_superadmin THEN
    RAISE EXCEPTION 'Only SuperAdmins can create organizations';
  END IF;

  -- Create the organization
  INSERT INTO organizations (name, domain, primary_color, secondary_color, created_by)
  VALUES (org_name, org_domain, org_primary_color, org_secondary_color, auth.uid())
  RETURNING id INTO new_org_id;

  RETURN json_build_object(
    'success', true,
    'organization_id', new_org_id,
    'message', 'Organization created successfully'
  );
END;
$$;

-- Grant access to the function
GRANT EXECUTE ON FUNCTION create_organization_as_superadmin TO authenticated;

-- Update the user management view to reflect the new structure
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

-- Add some helpful comments
COMMENT ON TABLE organizations IS 'Organizations are the companies that purchase BridgeSelling. Each organization has its own OpenAI assistant, branding, and customized Bridge Selling steps.';
COMMENT ON COLUMN organizations.openai_assistant_id IS 'OpenAI Assistant ID for this organization. Each organization gets its own AI assistant for call scoring.';
COMMENT ON COLUMN organizations.bridge_steps IS 'Customized Bridge Selling steps for this organization. Can be reordered, renamed, and have custom prompts.';

-- Success message
SELECT 'Architecture simplified successfully. Organizations are now the top-level entities.' as status;