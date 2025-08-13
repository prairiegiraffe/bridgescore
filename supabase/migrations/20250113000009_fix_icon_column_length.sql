-- Increase icon column size to handle longer emojis and text
DO $$
BEGIN
    -- Check if resources table exists and modify icon column
    IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'resources') THEN
        -- Modify icon column to allow up to 50 characters
        ALTER TABLE resources ALTER COLUMN icon TYPE VARCHAR(50);
        
        -- Update the default value as well
        ALTER TABLE resources ALTER COLUMN icon SET DEFAULT '📄';
    END IF;
END $$;