-- Fix RLS policies for organizations table to allow members to read their org's settings

-- First, ensure RLS is enabled on organizations table
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to recreate them
DROP POLICY IF EXISTS "Organizations are viewable by members" ON organizations;
DROP POLICY IF EXISTS "Organizations updateable by superadmins" ON organizations;

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

-- Check if organization_details is a view or table and handle accordingly
DO $$
BEGIN
  -- If organization_details exists as a table (not a view), add RLS
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'organization_details' 
    AND table_type = 'BASE TABLE'
  ) THEN
    -- It's a table, so we should probably drop it and create a view instead
    DROP TABLE IF EXISTS organization_details;
  END IF;
END $$;

-- Create or replace organization_details as a secure view
CREATE OR REPLACE VIEW organization_details AS
SELECT 
  o.*,
  (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id) as member_count
FROM organizations o
WHERE o.id IN (
  SELECT org_id FROM memberships 
  WHERE user_id = auth.uid()
);