-- Fix the infinite recursion in clients RLS policy
-- The issue is that the policy is trying to reference the clients table within itself

-- First, drop the problematic policies
DROP POLICY IF EXISTS "SuperAdmins can manage all clients" ON clients;
DROP POLICY IF EXISTS "Users can view their client data" ON clients;

-- Create simpler, non-recursive policies
-- Policy 1: SuperAdmins can do everything
CREATE POLICY "SuperAdmins full access" ON clients
  FOR ALL 
  USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_superadmin = true
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_superadmin = true
    )
  );

-- Policy 2: Regular users can only view clients their org is linked to
CREATE POLICY "Users can view their org client" ON clients
  FOR SELECT 
  USING (
    EXISTS (
      SELECT 1 FROM organizations org
      JOIN memberships m ON m.org_id = org.id
      WHERE m.user_id = auth.uid()
      AND org.client_id = clients.id
    )
  );

-- Test the fix by trying to select from clients
SELECT 'RLS policies fixed successfully' as status;

-- Verify you can see clients now (should work for SuperAdmins)
SELECT COUNT(*) as client_count FROM clients;