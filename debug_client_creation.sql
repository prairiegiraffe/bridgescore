-- Debug: Test basic client creation
-- Run this in Supabase SQL Editor to test if basic client creation works

-- Test 1: Check if you can manually create a client
INSERT INTO clients (
    name,
    domain,
    primary_color,
    secondary_color,
    created_by
) VALUES (
    'Test Client Manual',
    'test.com',
    '#3B82F6',
    '#1E40AF',
    (SELECT id FROM auth.users WHERE email = 'your-email@domain.com' LIMIT 1)
) RETURNING *;

-- Test 2: Check if the user has SuperAdmin privileges
SELECT 
    u.email,
    m.is_superadmin,
    m.role
FROM auth.users u
JOIN memberships m ON m.user_id = u.id
WHERE u.email = 'your-email@domain.com';

-- Test 3: Check RLS policies
SELECT * FROM clients;