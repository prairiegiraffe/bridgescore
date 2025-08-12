-- Migration: Add SuperAdmin role and Client Management System

-- Add SuperAdmin role (BridgeSelling employees)
ALTER TYPE user_role ADD VALUE IF NOT EXISTS 'superadmin';

-- Create clients table (replaces/extends organizations concept)
CREATE TABLE IF NOT EXISTS clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain TEXT, -- company domain for email validation
  logo_url TEXT,
  primary_color TEXT DEFAULT '#3B82F6',
  secondary_color TEXT DEFAULT '#1E40AF',
  
  -- Bridge Selling Step Customization
  bridge_steps JSONB DEFAULT '[
    {"key": "pinpoint_pain", "name": "Pinpoint Pain", "weight": 5, "order": 1},
    {"key": "qualify", "name": "Qualify", "weight": 3, "order": 2},
    {"key": "solution_success", "name": "Solution Success", "weight": 3, "order": 3},
    {"key": "qa", "name": "Q&A", "weight": 3, "order": 4},
    {"key": "next_steps", "name": "Next Steps", "weight": 3, "order": 5},
    {"key": "close_or_schedule", "name": "Close or Schedule", "weight": 3, "order": 6}
  ]'::jsonb,
  
  -- OpenAI Integration (managed by SuperAdmins)
  openai_assistant_id TEXT,
  openai_vector_store_id TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  created_by UUID REFERENCES auth.users(id) -- SuperAdmin who created this client
);

-- Update organizations to reference clients
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id) ON DELETE SET NULL;

-- Create client_files table for managing assistant knowledge base
CREATE TABLE IF NOT EXISTS client_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  filename TEXT NOT NULL,
  original_name TEXT NOT NULL,
  file_size INTEGER,
  mime_type TEXT,
  openai_file_id TEXT, -- OpenAI's file ID
  status TEXT DEFAULT 'uploading' CHECK (status IN ('uploading', 'processing', 'ready', 'error')),
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Add SuperAdmin tracking to memberships
ALTER TABLE memberships 
ADD COLUMN IF NOT EXISTS is_superadmin BOOLEAN DEFAULT false;

-- Update calls table to reference client instead of just org
ALTER TABLE calls
ADD COLUMN IF NOT EXISTS client_id UUID REFERENCES clients(id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);
CREATE INDEX IF NOT EXISTS idx_client_files_client_id ON client_files(client_id);
CREATE INDEX IF NOT EXISTS idx_client_files_status ON client_files(status);
CREATE INDEX IF NOT EXISTS idx_organizations_client_id ON organizations(client_id);
CREATE INDEX IF NOT EXISTS idx_calls_client_id ON calls(client_id);
CREATE INDEX IF NOT EXISTS idx_memberships_superadmin ON memberships(is_superadmin) WHERE is_superadmin = true;

-- RLS Policies for clients table
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

-- SuperAdmins can do everything with clients
CREATE POLICY "SuperAdmins can manage all clients" ON clients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_superadmin = true
    )
  );

-- Client users can only view their own client data
CREATE POLICY "Users can view their client data" ON clients
  FOR SELECT USING (
    id IN (
      SELECT c.id FROM clients c
      JOIN organizations o ON o.client_id = c.id
      JOIN memberships m ON m.org_id = o.id
      WHERE m.user_id = auth.uid()
    )
  );

-- RLS Policies for client_files
ALTER TABLE client_files ENABLE ROW LEVEL SECURITY;

CREATE POLICY "SuperAdmins can manage all client files" ON client_files
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_superadmin = true
    )
  );

-- Add comments
COMMENT ON TABLE clients IS 'Client companies that use the Bridge Selling system';
COMMENT ON COLUMN clients.bridge_steps IS 'Customized Bridge Selling steps for this client';
COMMENT ON COLUMN clients.openai_assistant_id IS 'OpenAI Assistant ID for this client';
COMMENT ON COLUMN clients.openai_vector_store_id IS 'OpenAI Vector Store ID for this client';
COMMENT ON TABLE client_files IS 'Files uploaded to client assistants knowledge base';
COMMENT ON COLUMN memberships.is_superadmin IS 'True if user is a BridgeSelling SuperAdmin';