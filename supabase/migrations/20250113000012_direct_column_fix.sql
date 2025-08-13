-- Direct column fixes - no conditionals, just force the changes
-- This will show us exactly what's happening

-- Show current table structure first
SELECT column_name, data_type, character_maximum_length, is_nullable
FROM information_schema.columns 
WHERE table_name = 'resources' 
AND table_schema = 'public'
ORDER BY ordinal_position;