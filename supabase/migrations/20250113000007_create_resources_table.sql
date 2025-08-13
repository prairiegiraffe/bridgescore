-- Create resources table if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'resources') THEN
        CREATE TABLE resources (
            id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
            title VARCHAR(255) NOT NULL,
            description TEXT NOT NULL,
            icon VARCHAR(10) DEFAULT '📄',
            category VARCHAR(100) NOT NULL,
            file_url TEXT,
            external_url TEXT,
            file_path TEXT, -- Store the storage path for deletion
            file_size VARCHAR(20),
            file_type VARCHAR(50),
            download_count INTEGER DEFAULT 0,
            org_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
            is_global BOOLEAN DEFAULT false,
            created_by UUID REFERENCES auth.users(id),
            created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
            updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
    END IF;
END $$;

-- Add RLS policies (only if table exists)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'resources') THEN
        -- Enable RLS
        ALTER TABLE resources ENABLE ROW LEVEL SECURITY;
        
        -- Drop existing policies if they exist
        DROP POLICY IF EXISTS "Users can view accessible resources" ON resources;
        DROP POLICY IF EXISTS "SuperAdmins can create resources" ON resources;
        DROP POLICY IF EXISTS "SuperAdmins can update resources" ON resources;
        DROP POLICY IF EXISTS "SuperAdmins can delete resources" ON resources;
        
        -- Create policies
        CREATE POLICY "Users can view accessible resources" ON resources
        FOR SELECT USING (
            is_global = true 
            OR org_id IN (
                SELECT org_id FROM memberships WHERE user_id = auth.uid()
            )
        );

        CREATE POLICY "SuperAdmins can create resources" ON resources
        FOR INSERT WITH CHECK (
            EXISTS (
                SELECT 1 FROM memberships 
                WHERE user_id = auth.uid() 
                AND is_superadmin = true
            )
        );

        CREATE POLICY "SuperAdmins can update resources" ON resources
        FOR UPDATE USING (
            EXISTS (
                SELECT 1 FROM memberships 
                WHERE user_id = auth.uid() 
                AND is_superadmin = true
            )
        );

        CREATE POLICY "SuperAdmins can delete resources" ON resources
        FOR DELETE USING (
            EXISTS (
                SELECT 1 FROM memberships 
                WHERE user_id = auth.uid() 
                AND is_superadmin = true
            )
        );
    END IF;
END $$;

-- Create indexes for better performance (only if table exists and indexes don't exist)
DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'resources') THEN
        -- Create indexes if they don't exist
        CREATE INDEX IF NOT EXISTS idx_resources_category ON resources(category);
        CREATE INDEX IF NOT EXISTS idx_resources_org_id ON resources(org_id);
        CREATE INDEX IF NOT EXISTS idx_resources_is_global ON resources(is_global);
        CREATE INDEX IF NOT EXISTS idx_resources_created_at ON resources(created_at);
    END IF;
END $$;

-- Add updated_at trigger function and trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

DO $$
BEGIN
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'resources') THEN
        -- Drop trigger if exists and recreate
        DROP TRIGGER IF EXISTS update_resources_updated_at ON resources;
        CREATE TRIGGER update_resources_updated_at 
            BEFORE UPDATE ON resources 
            FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
    END IF;
END $$;