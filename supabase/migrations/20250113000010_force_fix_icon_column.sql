-- Force fix the icon column size issue
-- This migration will directly alter the column regardless of current state

-- First, let's see what columns exist and their types
-- Then alter the icon column to be larger

ALTER TABLE resources ALTER COLUMN icon TYPE VARCHAR(100);

-- Also check and fix category column in case that's causing issues
DO $$
BEGIN
    -- Get current column info
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'resources' 
        AND column_name = 'category'
        AND character_maximum_length < 100
        AND table_schema = 'public'
    ) THEN
        ALTER TABLE resources ALTER COLUMN category TYPE VARCHAR(200);
    END IF;
END $$;

-- Update any existing records that might have been truncated
UPDATE resources SET icon = '📄' WHERE icon IS NULL OR length(icon) = 0;