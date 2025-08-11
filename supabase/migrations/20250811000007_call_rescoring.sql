-- Add assistant version tracking to calls table
ALTER TABLE calls 
ADD COLUMN assistant_version_id uuid REFERENCES ai_assistant_versions(id),
ADD COLUMN framework_version text DEFAULT '1.0';

-- Create call score history audit table
CREATE TABLE call_score_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  call_id uuid NOT NULL REFERENCES calls(id) ON DELETE CASCADE,
  assistant_version_id uuid REFERENCES ai_assistant_versions(id),
  framework_version text NOT NULL DEFAULT '1.0',
  score_total integer NOT NULL CHECK (score_total >= 0 AND score_total <= 20),
  score_breakdown jsonb NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Add indexes for performance
CREATE INDEX idx_call_score_history_call_id ON call_score_history(call_id);
CREATE INDEX idx_call_score_history_created_at ON call_score_history(created_at);

-- Enable RLS on call_score_history
ALTER TABLE call_score_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for call_score_history (org members can view history for their org's calls)
CREATE POLICY "call_score_history_select" ON call_score_history
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM calls c
      JOIN memberships m ON c.org_id = m.org_id
      WHERE c.id = call_score_history.call_id 
      AND m.user_id = auth.uid()
    )
  );

-- Only owners/admins can insert history records (through rescoring)
CREATE POLICY "call_score_history_insert" ON call_score_history
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM calls c
      JOIN memberships m ON c.org_id = m.org_id
      WHERE c.id = call_score_history.call_id 
      AND m.user_id = auth.uid()
      AND m.role IN ('owner', 'admin')
    )
  );

-- Add trigger to automatically create history record when call is rescored
CREATE OR REPLACE FUNCTION create_score_history_on_rescore()
RETURNS TRIGGER AS $$
BEGIN
  -- Only create history if score actually changed and version info is available
  IF (OLD.score_total != NEW.score_total OR OLD.score_breakdown != NEW.score_breakdown) 
     AND NEW.assistant_version_id IS NOT NULL THEN
    INSERT INTO call_score_history (
      call_id, 
      assistant_version_id, 
      framework_version,
      score_total, 
      score_breakdown
    ) VALUES (
      NEW.id, 
      NEW.assistant_version_id, 
      NEW.framework_version,
      NEW.score_total, 
      NEW.score_breakdown
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_create_score_history
  AFTER UPDATE ON calls
  FOR EACH ROW
  EXECUTE FUNCTION create_score_history_on_rescore();