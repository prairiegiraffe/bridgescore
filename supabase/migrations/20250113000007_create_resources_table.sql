-- Create resources table
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

-- Add RLS policies
ALTER TABLE resources ENABLE ROW LEVEL SECURITY;

-- Users can view global resources or resources from their organization
CREATE POLICY "Users can view accessible resources" ON resources
FOR SELECT USING (
    is_global = true 
    OR org_id IN (
        SELECT org_id FROM memberships WHERE user_id = auth.uid()
    )
);

-- SuperAdmins can create resources
CREATE POLICY "SuperAdmins can create resources" ON resources
FOR INSERT WITH CHECK (
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND is_superadmin = true
    )
);

-- SuperAdmins can update resources
CREATE POLICY "SuperAdmins can update resources" ON resources
FOR UPDATE USING (
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND is_superadmin = true
    )
);

-- SuperAdmins can delete resources
CREATE POLICY "SuperAdmins can delete resources" ON resources
FOR DELETE USING (
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND is_superadmin = true
    )
);

-- Create indexes for better performance
CREATE INDEX idx_resources_category ON resources(category);
CREATE INDEX idx_resources_org_id ON resources(org_id);
CREATE INDEX idx_resources_is_global ON resources(is_global);
CREATE INDEX idx_resources_created_at ON resources(created_at);

-- Add updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_resources_updated_at 
    BEFORE UPDATE ON resources 
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();