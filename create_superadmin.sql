-- Create SuperAdmin
-- 1. First run find_user_id.sql to get your user ID
-- 2. Replace 'YOUR_USER_ID_HERE' with your actual user ID
-- 3. Run this query

UPDATE memberships 
SET is_superadmin = true 
WHERE user_id = 'YOUR_USER_ID_HERE';

-- Verify it worked
SELECT 
    u.email,
    m.is_superadmin,
    m.role,
    o.name as org_name
FROM memberships m
JOIN auth.users u ON u.id = m.user_id
JOIN organizations o ON o.id = m.org_id
WHERE m.is_superadmin = true;