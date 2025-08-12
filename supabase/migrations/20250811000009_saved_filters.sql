-- Create saved_views table for filter management
CREATE TABLE saved_views (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_saved_views_org_id ON saved_views(org_id);
CREATE INDEX idx_saved_views_user_id ON saved_views(user_id);
CREATE INDEX idx_saved_views_created_at ON saved_views(created_at);

-- Enable RLS
ALTER TABLE saved_views ENABLE ROW LEVEL SECURITY;

-- RLS policies for saved_views
-- Users can view all saved views in their org (for sharing)
CREATE POLICY "saved_views_select" ON saved_views
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM memberships m 
      WHERE m.org_id = saved_views.org_id 
      AND m.user_id = auth.uid()
    )
  );

-- Users can insert their own saved views
CREATE POLICY "saved_views_insert" ON saved_views
  FOR INSERT WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM memberships m 
      WHERE m.org_id = saved_views.org_id 
      AND m.user_id = auth.uid()
    )
  );

-- Users can update their own saved views
CREATE POLICY "saved_views_update" ON saved_views
  FOR UPDATE USING (
    user_id = auth.uid()
  );

-- Users can delete their own saved views
CREATE POLICY "saved_views_delete" ON saved_views
  FOR DELETE USING (
    user_id = auth.uid()
  );