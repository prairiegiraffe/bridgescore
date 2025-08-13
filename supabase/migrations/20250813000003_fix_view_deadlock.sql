-- Fix view conflicts that are causing deadlocks during organization table updates

-- Drop the existing view temporarily
DROP VIEW IF EXISTS organization_details;

-- Ensure all necessary columns exist on organizations table
DO $$
BEGIN
  -- Add columns if they don't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'domain'
  ) THEN
    ALTER TABLE organizations ADD COLUMN domain TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'logo_url'
  ) THEN
    ALTER TABLE organizations ADD COLUMN logo_url TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'primary_color'
  ) THEN
    ALTER TABLE organizations ADD COLUMN primary_color TEXT DEFAULT '#3B82F6';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'secondary_color'
  ) THEN
    ALTER TABLE organizations ADD COLUMN secondary_color TEXT DEFAULT '#1E40AF';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'bridge_steps'
  ) THEN
    ALTER TABLE organizations ADD COLUMN bridge_steps JSONB DEFAULT '[
      {"key": "pinpoint_pain", "name": "Pinpoint Pain", "weight": 4, "order": 1},
      {"key": "qualify", "name": "Qualify", "weight": 3, "order": 2},
      {"key": "solution_success", "name": "Solution Success", "weight": 3, "order": 3},
      {"key": "qa", "name": "Q&A", "weight": 3, "order": 4},
      {"key": "next_steps", "name": "Next Steps", "weight": 4, "order": 5},
      {"key": "close_or_schedule", "name": "Close or Schedule", "weight": 3, "order": 6}
    ]'::jsonb;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'openai_assistant_id'
  ) THEN
    ALTER TABLE organizations ADD COLUMN openai_assistant_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'openai_vector_store_id'
  ) THEN
    ALTER TABLE organizations ADD COLUMN openai_vector_store_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'openai_model'
  ) THEN
    ALTER TABLE organizations ADD COLUMN openai_model TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'organizations' AND column_name = 'created_by'
  ) THEN
    ALTER TABLE organizations ADD COLUMN created_by UUID REFERENCES auth.users(id);
  END IF;
END $$;

-- Recreate the view with proper column structure
CREATE OR REPLACE VIEW organization_details AS
SELECT 
  o.id,
  o.name,
  o.domain,
  o.logo_url,
  o.primary_color,
  o.secondary_color,
  o.bridge_steps,
  o.openai_assistant_id,
  o.openai_vector_store_id,
  o.openai_model,
  o.created_by,
  o.created_at,
  o.is_demo,
  -- Count of members
  COUNT(m.user_id) as member_count
FROM organizations o
LEFT JOIN memberships m ON m.org_id = o.id
GROUP BY o.id, o.name, o.domain, o.logo_url, o.primary_color, o.secondary_color, 
         o.bridge_steps, o.openai_assistant_id, o.openai_vector_store_id, o.openai_model,
         o.created_by, o.created_at, o.is_demo;