-- Migration: Add OpenAI Integration Fields

-- Add OpenAI-specific fields to org_ai_configs
ALTER TABLE org_ai_configs 
ADD COLUMN IF NOT EXISTS openai_api_key TEXT,
ADD COLUMN IF NOT EXISTS openai_enabled BOOLEAN DEFAULT false;

-- Add OpenAI Assistant ID to assistant versions
ALTER TABLE ai_assistant_versions
ADD COLUMN IF NOT EXISTS openai_assistant_id TEXT,
ADD COLUMN IF NOT EXISTS use_openai BOOLEAN DEFAULT false;

-- Update org_ai_configs to rename columns for clarity
ALTER TABLE org_ai_configs
RENAME COLUMN active_assistant_version_id TO default_assistant_version_id;

-- Add scoring method configuration to calls table
ALTER TABLE calls
ADD COLUMN IF NOT EXISTS scoring_method TEXT DEFAULT 'local' CHECK (scoring_method IN ('local', 'openai')),
ADD COLUMN IF NOT EXISTS openai_thread_id TEXT,
ADD COLUMN IF NOT EXISTS openai_run_id TEXT,
ADD COLUMN IF NOT EXISTS openai_raw_response TEXT;

-- Create index for OpenAI assistant lookups
CREATE INDEX IF NOT EXISTS idx_ai_assistant_versions_openai_assistant_id 
ON ai_assistant_versions(openai_assistant_id) 
WHERE openai_assistant_id IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN org_ai_configs.openai_api_key IS 'Encrypted OpenAI API key for the organization';
COMMENT ON COLUMN ai_assistant_versions.openai_assistant_id IS 'OpenAI Assistant ID to use for scoring';
COMMENT ON COLUMN ai_assistant_versions.use_openai IS 'Whether to use OpenAI for scoring instead of local scoring';
COMMENT ON COLUMN calls.scoring_method IS 'Method used to score this call: local or openai';
COMMENT ON COLUMN calls.openai_thread_id IS 'OpenAI thread ID if scored with OpenAI';
COMMENT ON COLUMN calls.openai_run_id IS 'OpenAI run ID if scored with OpenAI';
COMMENT ON COLUMN calls.openai_raw_response IS 'Raw response from OpenAI assistant';