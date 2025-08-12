-- Debug why scoring is using local instead of OpenAI
-- Run this in Supabase SQL Editor

-- 1. Check your current organization and its client linkage
SELECT 
    o.id as org_id,
    o.name as org_name,
    o.client_id,
    c.name as client_name,
    c.openai_assistant_id,
    c.openai_vector_store_id
FROM organizations o
LEFT JOIN clients c ON c.id = o.client_id
JOIN memberships m ON m.org_id = o.id
JOIN auth.users u ON u.id = m.user_id
WHERE u.email = 'kellee@prairiegiraffe.com';

-- 2. Check all available clients
SELECT 
    id,
    name,
    openai_assistant_id,
    openai_vector_store_id,
    created_at
FROM clients 
ORDER BY created_at DESC;

-- 3. Check recent calls to see scoring method
SELECT 
    id,
    title,
    scoring_method,
    client_id,
    openai_assistant_id,
    created_at
FROM calls 
ORDER BY created_at DESC 
LIMIT 5;