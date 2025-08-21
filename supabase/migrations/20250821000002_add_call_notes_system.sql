-- Add comprehensive call notes system for managers, trainers, and users
-- This enables notes on calls for coaching, feedback, and collaboration

-- Create call_notes table
CREATE TABLE IF NOT EXISTS call_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid REFERENCES calls(id) ON DELETE CASCADE NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT NOW(),
  updated_at timestamp with time zone DEFAULT NOW(),
  note_type text NOT NULL CHECK (note_type IN ('flag', 'manager', 'trainer', 'user', 'general')),
  title text,
  content text NOT NULL,
  is_private boolean DEFAULT false, -- For internal manager/trainer notes
  visible_to_user boolean DEFAULT true -- Controls if user can see manager/trainer notes
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_call_notes_call_id ON call_notes(call_id);
CREATE INDEX IF NOT EXISTS idx_call_notes_created_by ON call_notes(created_by);
CREATE INDEX IF NOT EXISTS idx_call_notes_note_type ON call_notes(note_type);
CREATE INDEX IF NOT EXISTS idx_call_notes_created_at ON call_notes(created_at DESC);

-- Enable RLS
ALTER TABLE call_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for call_notes
-- Users can see their own notes and non-private notes on their calls
CREATE POLICY "Users can view relevant call notes" ON call_notes
  FOR SELECT USING (
    -- Own notes
    created_by = auth.uid() OR
    -- Notes on their own calls (if not private or if they're allowed to see them)
    (
      call_id IN (SELECT id FROM calls WHERE user_id = auth.uid()) AND
      (is_private = false OR visible_to_user = true)
    ) OR
    -- Managers/SuperAdmins can see all notes
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND (role IN ('manager', 'admin', 'owner') OR is_superadmin = true)
    )
  );

-- Users can create notes on calls they have access to
CREATE POLICY "Users can create call notes" ON call_notes
  FOR INSERT WITH CHECK (
    -- Can create notes on their own calls
    call_id IN (SELECT id FROM calls WHERE user_id = auth.uid()) OR
    -- Managers/SuperAdmins can create notes on any call in their org
    EXISTS (
      SELECT 1 FROM calls c 
      JOIN memberships m ON m.org_id = c.org_id 
      WHERE c.id = call_id 
      AND m.user_id = auth.uid() 
      AND (m.role IN ('manager', 'admin', 'owner') OR m.is_superadmin = true)
    )
  );

-- Users can update their own notes, managers can update notes on calls in their org
CREATE POLICY "Users can update relevant call notes" ON call_notes
  FOR UPDATE USING (
    -- Own notes
    created_by = auth.uid() OR
    -- Managers/SuperAdmins can edit notes on calls in their org
    EXISTS (
      SELECT 1 FROM calls c 
      JOIN memberships m ON m.org_id = c.org_id 
      WHERE c.id = call_id 
      AND m.user_id = auth.uid() 
      AND (m.role IN ('manager', 'admin', 'owner') OR m.is_superadmin = true)
    )
  );

-- Users can delete their own notes, managers can delete notes on calls in their org
CREATE POLICY "Users can delete relevant call notes" ON call_notes
  FOR DELETE USING (
    -- Own notes
    created_by = auth.uid() OR
    -- Managers/SuperAdmins can delete notes on calls in their org
    EXISTS (
      SELECT 1 FROM calls c 
      JOIN memberships m ON m.org_id = c.org_id 
      WHERE c.id = call_id 
      AND m.user_id = auth.uid() 
      AND (m.role IN ('manager', 'admin', 'owner') OR m.is_superadmin = true)
    )
  );

-- Grant permissions
GRANT ALL ON call_notes TO authenticated;

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_call_notes_updated_at
  BEFORE UPDATE ON call_notes
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Add comment for documentation
COMMENT ON TABLE call_notes IS 'Notes system for calls supporting manager feedback, trainer notes, user notes, and flag reasons';
COMMENT ON COLUMN call_notes.note_type IS 'Type of note: flag (flag reason), manager (manager feedback), trainer (trainer notes), user (user notes), general (other)';
COMMENT ON COLUMN call_notes.is_private IS 'If true, only managers/trainers can see this note';
COMMENT ON COLUMN call_notes.visible_to_user IS 'Controls whether users can see manager/trainer notes about their calls';