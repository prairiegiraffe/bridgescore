-- Fix resources RLS policies to allow managers and admins to create resources
-- This enables organization managers to add resources for their organizations

-- Drop existing policies
DROP POLICY IF EXISTS "SuperAdmins can create resources" ON resources;
DROP POLICY IF EXISTS "SuperAdmins can update resources" ON resources;
DROP POLICY IF EXISTS "SuperAdmins can delete resources" ON resources;

-- Create new policies that allow managers/admins and SuperAdmins
CREATE POLICY "Managers and SuperAdmins can create resources" ON resources
FOR INSERT WITH CHECK (
    -- SuperAdmins can create any resource
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND is_superadmin = true
    )
    OR
    -- Managers/Admins can create resources for their organization
    (
        org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid() 
            AND role IN ('manager', 'admin', 'owner')
        )
    )
);

CREATE POLICY "Managers and SuperAdmins can update resources" ON resources
FOR UPDATE USING (
    -- SuperAdmins can update any resource
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND is_superadmin = true
    )
    OR
    -- Managers/Admins can update resources in their organization
    (
        org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid() 
            AND role IN ('manager', 'admin', 'owner')
        )
    )
);

CREATE POLICY "Managers and SuperAdmins can delete resources" ON resources
FOR DELETE USING (
    -- SuperAdmins can delete any resource
    EXISTS (
        SELECT 1 FROM memberships 
        WHERE user_id = auth.uid() 
        AND is_superadmin = true
    )
    OR
    -- Managers/Admins can delete resources in their organization
    (
        org_id IN (
            SELECT org_id FROM memberships 
            WHERE user_id = auth.uid() 
            AND role IN ('manager', 'admin', 'owner')
        )
    )
);

-- Add comment for documentation
COMMENT ON TABLE resources IS 'Resources table with RLS policies allowing SuperAdmins global access and managers/admins access to their organization resources';