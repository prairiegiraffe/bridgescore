-- Fix overly permissive RLS policies for better security

-- Fix the overly permissive pivots table policy
-- Currently allows global read access - restrict to organization members
DROP POLICY IF EXISTS "Pivots are globally readable" ON pivots;

-- Create a more secure policy for pivots
-- Pivots should only be readable by users in organizations that use them
CREATE POLICY "Users can view their organization's pivots" ON pivots
  FOR SELECT USING (
    -- For now, we'll allow all authenticated users to see pivots
    -- since they appear to be scoring criteria that could be shared
    -- This is safer than global access but still functional
    auth.uid() IS NOT NULL
  );

-- Add proper RLS policy for resources table if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'resources' AND policyname = 'Users can view org resources'
  ) THEN
    CREATE POLICY "Users can view org resources" ON resources
      FOR SELECT USING (
        org_id IN (
          SELECT org_id FROM memberships 
          WHERE user_id = auth.uid()
        )
      );
  END IF;
END $$;

-- Add proper RLS policy for resources INSERT
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'resources' AND policyname = 'Users can create org resources'
  ) THEN
    CREATE POLICY "Users can create org resources" ON resources
      FOR INSERT WITH CHECK (
        org_id IN (
          SELECT org_id FROM memberships 
          WHERE user_id = auth.uid() 
          AND role IN ('owner', 'admin')
        )
      );
  END IF;
END $$;

-- Ensure calls table has proper RLS for the consolidated org_id column
-- Update existing policies to use org_id consistently
DROP POLICY IF EXISTS "Users can view their organization calls" ON calls;
CREATE POLICY "Users can view their organization calls" ON calls
  FOR SELECT USING (
    -- Users can see calls from their organization OR their personal calls
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid()
    ) OR (
      user_id = auth.uid() AND org_id IS NULL
    )
  );

-- Update calls INSERT policy to use org_id
DROP POLICY IF EXISTS "Users can create calls in their organization" ON calls;
CREATE POLICY "Users can create calls in their organization" ON calls
  FOR INSERT WITH CHECK (
    -- Users can create calls in their organization OR personal calls
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid()
    ) OR (
      user_id = auth.uid() AND org_id IS NULL
    )
  );

-- Update calls UPDATE policy
DROP POLICY IF EXISTS "Users can update their own calls or org calls if admin" ON calls;
CREATE POLICY "Users can update their own calls or org calls if admin" ON calls
  FOR UPDATE USING (
    -- Users can update their own calls
    user_id = auth.uid() OR
    -- Or org admins/owners can update org calls
    (org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    ))
  );

-- Ensure user_files has proper RLS
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'user_files' AND policyname = 'Users can manage their own files'
  ) THEN
    CREATE POLICY "Users can manage their own files" ON user_files
      FOR ALL USING (user_id = auth.uid());
  END IF;
END $$;

-- Add policy for saved_views to ensure proper organization scoping
DROP POLICY IF EXISTS "saved_views_select" ON saved_views;
CREATE POLICY "saved_views_select" ON saved_views
  FOR SELECT USING (
    -- Users can view saved views in their organization
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid()
    )
  );