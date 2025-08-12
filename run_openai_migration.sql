-- First, check if the migration has already been applied by checking if columns exist
DO $$ 
BEGIN
    -- Add OpenAI-specific fields to org_ai_configs if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'org_ai_configs' AND column_name = 'openai_api_key') THEN
        ALTER TABLE org_ai_configs ADD COLUMN openai_api_key TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'org_ai_configs' AND column_name = 'openai_enabled') THEN
        ALTER TABLE org_ai_configs ADD COLUMN openai_enabled BOOLEAN DEFAULT false;
    END IF;

    -- Add OpenAI Assistant ID to assistant versions if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_assistant_versions' AND column_name = 'openai_assistant_id') THEN
        ALTER TABLE ai_assistant_versions ADD COLUMN openai_assistant_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_assistant_versions' AND column_name = 'use_openai') THEN
        ALTER TABLE ai_assistant_versions ADD COLUMN use_openai BOOLEAN DEFAULT false;
    END IF;

    -- Rename column if it exists with old name
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'org_ai_configs' AND column_name = 'active_assistant_version_id') THEN
        ALTER TABLE org_ai_configs RENAME COLUMN active_assistant_version_id TO default_assistant_version_id;
    END IF;

    -- Add scoring method configuration to calls table if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'scoring_method') THEN
        ALTER TABLE calls ADD COLUMN scoring_method TEXT DEFAULT 'local' CHECK (scoring_method IN ('local', 'openai'));
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'openai_thread_id') THEN
        ALTER TABLE calls ADD COLUMN openai_thread_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'openai_run_id') THEN
        ALTER TABLE calls ADD COLUMN openai_run_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'openai_raw_response') THEN
        ALTER TABLE calls ADD COLUMN openai_raw_response TEXT;
    END IF;
END $$;

-- Create index for OpenAI assistant lookups if it doesn't exist
CREATE INDEX IF NOT EXISTS idx_ai_assistant_versions_openai_assistant_id 
ON ai_assistant_versions(openai_assistant_id) 
WHERE openai_assistant_id IS NOT NULL;

-- Add comments for documentation
COMMENT ON COLUMN org_ai_configs.openai_api_key IS 'Encrypted OpenAI API key for the organization';
COMMENT ON COLUMN ai_assistant_versions.openai_assistant_id IS 'OpenAI Assistant ID to use for scoring';
COMMENT ON COLUMN ai_assistant_versions.use_openai IS 'Whether to use OpenAI for scoring instead of local scoring';
COMMENT ON COLUMN calls.scoring_method IS 'Method used to score this call: local or openai';
COMMENT ON COLUMN calls.openai_thread_id IS 'OpenAI thread ID if scored with OpenAI';
COMMENT ON COLUMN calls.openai_run_id IS 'OpenAI run ID if scored with OpenAI';
COMMENT ON COLUMN calls.openai_raw_response IS 'Raw response from OpenAI assistant';

-- Log the migration
INSERT INTO supabase_migrations.schema_migrations (version, name, statements) 
VALUES ('20250812000001', 'openai_integration', ARRAY['Added OpenAI integration fields'])
ON CONFLICT (version) DO NOTHING;