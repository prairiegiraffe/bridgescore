-- Test 1: Check if you are SuperAdmin
SELECT 
    u.email,
    m.is_superadmin,
    m.role,
    o.name as org_name
FROM memberships m
JOIN auth.users u ON u.id = m.user_id
JOIN organizations o ON o.id = m.org_id
WHERE m.user_id = auth.uid();

-- Test 2: Try manual client creation (replace the email with yours)
DO $$
DECLARE
    test_user_id UUID;
    new_client_id UUID;
BEGIN
    -- Get your user ID
    SELECT id INTO test_user_id 
    FROM auth.users 
    WHERE email = 'your-email@domain.com' -- REPLACE WITH YOUR EMAIL
    LIMIT 1;
    
    IF test_user_id IS NOT NULL THEN
        -- Try to create a test client
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
            test_user_id
        ) RETURNING id INTO new_client_id;
        
        RAISE NOTICE 'Successfully created client with ID: %', new_client_id;
    ELSE
        RAISE NOTICE 'User not found with that email';
    END IF;
END $$;

-- Test 3: Check if the client was created
SELECT * FROM clients ORDER BY created_at DESC LIMIT 5;