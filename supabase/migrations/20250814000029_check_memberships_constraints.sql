-- Check what role values are allowed by the memberships_role_check constraint

-- Show the constraint definition
SELECT conname, consrc 
FROM pg_constraint 
WHERE conname = 'memberships_role_check';

-- Alternative way to see constraint
SELECT 
  tc.constraint_name, 
  tc.table_name, 
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'memberships' AND tc.constraint_type = 'CHECK';

-- Show all constraints on memberships table
SELECT * FROM information_schema.check_constraints 
WHERE constraint_name LIKE '%memberships%';

-- Show current role values in use
SELECT DISTINCT role FROM memberships ORDER BY role;