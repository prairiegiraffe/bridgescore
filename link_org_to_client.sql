-- Link your organization to the Test client for OpenAI scoring to work
-- Run this in Supabase SQL Editor

-- First, find your organization
SELECT 
    o.id as org_id,
    o.name as org_name,
    o.client_id as current_client_id
FROM organizations o
JOIN memberships m ON m.org_id = o.id
JOIN auth.users u ON u.id = m.user_id
WHERE u.email = 'kellee@prairiegiraffe.com';

-- Find the Test client
SELECT 
    id as client_id,
    name,
    openai_assistant_id,
    openai_vector_store_id
FROM clients
WHERE name = 'Test';

-- Link your organization to the Test client
-- Replace the IDs below with the actual IDs from the queries above
UPDATE organizations
SET client_id = (SELECT id FROM clients WHERE name = 'Test' LIMIT 1)
WHERE id IN (
    SELECT o.id 
    FROM organizations o
    JOIN memberships m ON m.org_id = o.id
    JOIN auth.users u ON u.id = m.user_id
    WHERE u.email = 'kellee@prairiegiraffe.com'
);

-- Verify the link was created
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