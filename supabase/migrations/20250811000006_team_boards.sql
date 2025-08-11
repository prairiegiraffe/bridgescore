-- Migration 006: Team Management Boards

-- Create review_queue table for call review workflow
CREATE TABLE review_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  call_id UUID NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  reviewer_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'in_review', 'coached', 'done')),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  
  -- Ensure unique call per org in queue
  UNIQUE(org_id, call_id)
);

-- Create coaching_tasks table for rep coaching plans
CREATE TABLE coaching_tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rep_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  call_id UUID REFERENCES calls(id) ON DELETE SET NULL,
  step_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo', 'doing', 'done')),
  due_date DATE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Create indexes for performance
CREATE INDEX idx_review_queue_org_id ON review_queue(org_id);
CREATE INDEX idx_review_queue_status ON review_queue(status);
CREATE INDEX idx_review_queue_call_id ON review_queue(call_id);
CREATE INDEX idx_coaching_tasks_org_id ON coaching_tasks(org_id);
CREATE INDEX idx_coaching_tasks_rep_user_id ON coaching_tasks(rep_user_id);
CREATE INDEX idx_coaching_tasks_status ON coaching_tasks(status);
CREATE INDEX idx_coaching_tasks_due_date ON coaching_tasks(due_date);

-- Enable RLS
ALTER TABLE review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE coaching_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies for review_queue
-- Members can view review queue items in their org
CREATE POLICY "Members can view review queue in their org" ON review_queue
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE memberships.org_id = review_queue.org_id 
      AND memberships.user_id = auth.uid()
    )
  );

-- Owners and admins can manage review queue
CREATE POLICY "Owners and admins can insert review queue items" ON review_queue
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE memberships.org_id = review_queue.org_id 
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can update review queue items" ON review_queue
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE memberships.org_id = review_queue.org_id 
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can delete review queue items" ON review_queue
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE memberships.org_id = review_queue.org_id 
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

-- RLS Policies for coaching_tasks
-- Members can view coaching tasks in their org
CREATE POLICY "Members can view coaching tasks in their org" ON coaching_tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE memberships.org_id = coaching_tasks.org_id 
      AND memberships.user_id = auth.uid()
    )
  );

-- Owners and admins can manage coaching tasks
CREATE POLICY "Owners and admins can insert coaching tasks" ON coaching_tasks
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE memberships.org_id = coaching_tasks.org_id 
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can update coaching tasks" ON coaching_tasks
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE memberships.org_id = coaching_tasks.org_id 
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can delete coaching tasks" ON coaching_tasks
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE memberships.org_id = coaching_tasks.org_id 
      AND memberships.user_id = auth.uid()
      AND memberships.role IN ('owner', 'admin')
    )
  );

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = timezone('utc', now());
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger for review_queue updated_at
CREATE TRIGGER update_review_queue_updated_at 
  BEFORE UPDATE ON review_queue 
  FOR EACH ROW 
  EXECUTE FUNCTION update_updated_at_column();