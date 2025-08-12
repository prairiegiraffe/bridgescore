-- SuperAdmin and Client Management Migration (Fixed)
-- This migration safely adds all required components

DO $$ 
BEGIN
    -- Create user_role enum if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'user_role') THEN
        CREATE TYPE user_role AS ENUM ('owner', 'admin', 'member', 'superadmin');
        RAISE NOTICE 'Created user_role enum';
    ELSE
        -- Add superadmin to existing enum if not present
        IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'superadmin' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'user_role')) THEN
            ALTER TYPE user_role ADD VALUE 'superadmin';
            RAISE NOTICE 'Added superadmin to user_role enum';
        END IF;
    END IF;

    -- Create clients table if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'clients') THEN
        CREATE TABLE clients (
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
        RAISE NOTICE 'Created clients table';
    END IF;

    -- Add client_id to organizations if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'organizations' AND column_name = 'client_id') THEN
        ALTER TABLE organizations ADD COLUMN client_id UUID REFERENCES clients(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added client_id to organizations';
    END IF;

    -- Create client_files table if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'client_files') THEN
        CREATE TABLE client_files (
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
        RAISE NOTICE 'Created client_files table';
    END IF;

    -- Add SuperAdmin tracking to memberships if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'memberships' AND column_name = 'is_superadmin') THEN
        ALTER TABLE memberships ADD COLUMN is_superadmin BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added is_superadmin to memberships';
    END IF;

    -- Add client_id to calls if it doesn't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'client_id') THEN
        ALTER TABLE calls ADD COLUMN client_id UUID REFERENCES clients(id);
        RAISE NOTICE 'Added client_id to calls';
    END IF;
END $$;

-- Create indexes if they don't exist
CREATE INDEX IF NOT EXISTS idx_clients_created_by ON clients(created_by);
CREATE INDEX IF NOT EXISTS idx_client_files_client_id ON client_files(client_id);
CREATE INDEX IF NOT EXISTS idx_client_files_status ON client_files(status);
CREATE INDEX IF NOT EXISTS idx_organizations_client_id ON organizations(client_id);
CREATE INDEX IF NOT EXISTS idx_calls_client_id ON calls(client_id);
CREATE INDEX IF NOT EXISTS idx_memberships_superadmin ON memberships(is_superadmin) WHERE is_superadmin = true;

-- Enable RLS on new tables
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies for clients table
DO $$
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "SuperAdmins can manage all clients" ON clients;
    DROP POLICY IF EXISTS "Users can view their client data" ON clients;
    
    -- Create new policies
    CREATE POLICY "SuperAdmins can manage all clients" ON clients
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM memberships 
          WHERE user_id = auth.uid() 
          AND is_superadmin = true
        )
      );

    CREATE POLICY "Users can view their client data" ON clients
      FOR SELECT USING (
        id IN (
          SELECT c.id FROM clients c
          JOIN organizations o ON o.client_id = c.id
          JOIN memberships m ON m.org_id = o.id
          WHERE m.user_id = auth.uid()
        )
      );
    
    RAISE NOTICE 'Created RLS policies for clients';
END $$;

-- RLS Policies for client_files
DO $$
BEGIN
    -- Drop existing policies if they exist
    DROP POLICY IF EXISTS "SuperAdmins can manage all client files" ON client_files;
    
    -- Create new policies
    CREATE POLICY "SuperAdmins can manage all client files" ON client_files
      FOR ALL USING (
        EXISTS (
          SELECT 1 FROM memberships 
          WHERE user_id = auth.uid() 
          AND is_superadmin = true
        )
      );
    
    RAISE NOTICE 'Created RLS policies for client_files';
END $$;

-- Add comments
COMMENT ON TABLE clients IS 'Client companies that use the Bridge Selling system';
COMMENT ON COLUMN clients.bridge_steps IS 'Customized Bridge Selling steps for this client';
COMMENT ON COLUMN clients.openai_assistant_id IS 'OpenAI Assistant ID for this client';
COMMENT ON COLUMN clients.openai_vector_store_id IS 'OpenAI Vector Store ID for this client';
COMMENT ON TABLE client_files IS 'Files uploaded to client assistants knowledge base';
COMMENT ON COLUMN memberships.is_superadmin IS 'True if user is a BridgeSelling SuperAdmin';

-- Return summary
SELECT 
    'Migration completed successfully' as status,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'clients') as clients_table_exists,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_name = 'client_files') as client_files_table_exists,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'memberships' AND column_name = 'is_superadmin') as superadmin_column_exists;