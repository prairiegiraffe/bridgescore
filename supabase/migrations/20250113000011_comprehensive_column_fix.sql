-- Comprehensive fix for all VARCHAR(10) columns in resources table
-- This will identify and expand any column that might be causing the issue

-- First, let's see the current table structure
DO $$
DECLARE
    column_record RECORD;
BEGIN
    -- Loop through all VARCHAR columns in resources table and expand small ones
    FOR column_record IN 
        SELECT column_name, character_maximum_length
        FROM information_schema.columns 
        WHERE table_name = 'resources' 
        AND table_schema = 'public'
        AND data_type = 'character varying'
        AND character_maximum_length <= 50
    LOOP
        -- Expand any VARCHAR column with length <= 50 to VARCHAR(200)
        EXECUTE format('ALTER TABLE resources ALTER COLUMN %I TYPE VARCHAR(200)', column_record.column_name);
        RAISE NOTICE 'Expanded column % from VARCHAR(%) to VARCHAR(200)', column_record.column_name, column_record.character_maximum_length;
    END LOOP;
END $$;

-- Also make sure all expected columns have reasonable sizes
ALTER TABLE resources 
    ALTER COLUMN icon TYPE VARCHAR(100),
    ALTER COLUMN category TYPE VARCHAR(200),
    ALTER COLUMN file_size TYPE VARCHAR(50),
    ALTER COLUMN file_type TYPE VARCHAR(100);

-- Show the current table structure for debugging
DO $$
DECLARE
    column_info RECORD;
BEGIN
    RAISE NOTICE 'Current resources table structure:';
    FOR column_info IN 
        SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
        FROM information_schema.columns 
        WHERE table_name = 'resources' 
        AND table_schema = 'public'
        ORDER BY ordinal_position
    LOOP
        RAISE NOTICE 'Column: %, Type: %, Max Length: %, Nullable: %, Default: %', 
            column_info.column_name, 
            column_info.data_type, 
            column_info.character_maximum_length,
            column_info.is_nullable,
            column_info.column_default;
    END LOOP;
END $$;