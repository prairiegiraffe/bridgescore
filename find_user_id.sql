-- Find your user ID
-- Run this in Supabase SQL Editor to find your user ID

SELECT 
    id,
    email,
    created_at
FROM auth.users
ORDER BY created_at DESC
LIMIT 10;