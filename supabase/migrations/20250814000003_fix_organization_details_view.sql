-- Fix organization_details view and RLS policies

-- First drop the existing view to recreate it properly
DROP VIEW IF EXISTS organization_details CASCADE;

-- Ensure RLS is enabled on organizations table
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to recreate them
DROP POLICY IF EXISTS "Organizations are viewable by members" ON organizations;
DROP POLICY IF EXISTS "Organizations updateable by superadmins" ON organizations;
DROP POLICY IF EXISTS "Organizations insertable by superadmins" ON organizations;

-- Create policy: Members can view their organization
CREATE POLICY "Organizations are viewable by members" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid()
    )
  );

-- Create policy: Only superadmins can update organizations
CREATE POLICY "Organizations updateable by superadmins" ON organizations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND org_id = organizations.id
      AND is_superadmin = true
    )
  );

-- Create policy: Only superadmins can insert organizations
CREATE POLICY "Organizations insertable by superadmins" ON organizations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_superadmin = true
    )
  );

-- Recreate organization_details view with all the correct columns
CREATE OR REPLACE VIEW organization_details AS
SELECT 
  o.id,
  o.name,
  o.domain,
  o.primary_color,
  o.secondary_color,
  o.bridge_steps,
  o.openai_assistant_id,
  o.openai_vector_store_id,
  o.openai_model,
  o.demo_mode,
  o.created_at,
  o.updated_at,
  (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id) as member_count
FROM organizations o
WHERE o.id IN (
  SELECT org_id FROM memberships 
  WHERE user_id = auth.uid()
);

-- Grant appropriate permissions on the view
GRANT SELECT ON organization_details TO authenticated;