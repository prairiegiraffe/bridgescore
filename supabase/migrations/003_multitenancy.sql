-- Migration 003: Add multitenancy with organizations and memberships

-- Create organizations table
CREATE TABLE organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  is_demo BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Create memberships table for user-org relationships with roles
CREATE TABLE memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  
  -- Ensure unique user per org
  UNIQUE(org_id, user_id)
);

-- Add org_id to calls table (nullable for backfill)
ALTER TABLE calls ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX idx_memberships_org_id ON memberships (org_id);
CREATE INDEX idx_memberships_user_id ON memberships (user_id);
CREATE INDEX idx_calls_org_id ON calls (org_id);

-- Enable RLS on new tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;

-- RLS Policies for organizations
-- Users can only see orgs they belong to
CREATE POLICY "Users can view orgs they belong to" ON organizations
  FOR SELECT USING (
    id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid()
    )
  );

-- Only owners/admins can update org details
CREATE POLICY "Owners and admins can update orgs" ON organizations
  FOR UPDATE USING (
    id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- RLS Policies for memberships
-- Users can view memberships for orgs they belong to
CREATE POLICY "Users can view memberships in their orgs" ON memberships
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid()
    )
  );

-- Users can only manage their own membership
CREATE POLICY "Users can manage their own membership" ON memberships
  FOR ALL USING (user_id = auth.uid());

-- Owners and admins can manage memberships in their orgs
CREATE POLICY "Owners and admins can manage org memberships" ON memberships
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- Update calls RLS to include org-based access
DROP POLICY IF EXISTS "Users can manage own calls" ON calls;

-- New org-aware calls policies
CREATE POLICY "Users can view calls in their orgs" ON calls
  FOR SELECT USING (
    org_id IS NULL AND user_id = auth.uid() -- Personal calls (legacy)
    OR
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create calls in their orgs" ON calls
  FOR INSERT WITH CHECK (
    org_id IS NULL AND user_id = auth.uid() -- Personal calls (legacy)
    OR
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update calls in their orgs" ON calls
  FOR UPDATE USING (
    org_id IS NULL AND user_id = auth.uid() -- Personal calls (legacy)
    OR
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete calls in their orgs" ON calls
  FOR DELETE USING (
    org_id IS NULL AND user_id = auth.uid() -- Personal calls (legacy)
    OR
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid()
    )
  );