-- Add missing columns to resources table if they don't exist
DO $$
BEGIN
    -- Add file_path column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'resources' 
        AND column_name = 'file_path'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE resources ADD COLUMN file_path TEXT;
    END IF;
    
    -- Add file_size column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'resources' 
        AND column_name = 'file_size'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE resources ADD COLUMN file_size VARCHAR(20);
    END IF;
    
    -- Add file_type column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'resources' 
        AND column_name = 'file_type'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE resources ADD COLUMN file_type VARCHAR(50);
    END IF;
    
    -- Add download_count column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'resources' 
        AND column_name = 'download_count'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE resources ADD COLUMN download_count INTEGER DEFAULT 0;
    END IF;
    
    -- Add org_id column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'resources' 
        AND column_name = 'org_id'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE resources ADD COLUMN org_id UUID REFERENCES organizations(id) ON DELETE CASCADE;
    END IF;
    
    -- Add is_global column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'resources' 
        AND column_name = 'is_global'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE resources ADD COLUMN is_global BOOLEAN DEFAULT false;
    END IF;
    
    -- Add created_by column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'resources' 
        AND column_name = 'created_by'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE resources ADD COLUMN created_by UUID REFERENCES auth.users(id);
    END IF;
    
    -- Add external_url column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'resources' 
        AND column_name = 'external_url'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE resources ADD COLUMN external_url TEXT;
    END IF;
    
    -- Add file_url column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'resources' 
        AND column_name = 'file_url'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE resources ADD COLUMN file_url TEXT;
    END IF;
    
    -- Add icon column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'resources' 
        AND column_name = 'icon'
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE resources ADD COLUMN icon VARCHAR(10) DEFAULT '📄';
    END IF;

END $$;