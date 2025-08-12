-- OpenAI Integration Migration (Fixed)
-- This migration safely adds OpenAI integration fields

DO $$ 
BEGIN
    -- Add OpenAI-specific fields to org_ai_configs if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'org_ai_configs' AND column_name = 'openai_api_key') THEN
        ALTER TABLE org_ai_configs ADD COLUMN openai_api_key TEXT;
        RAISE NOTICE 'Added openai_api_key column to org_ai_configs';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'org_ai_configs' AND column_name = 'openai_enabled') THEN
        ALTER TABLE org_ai_configs ADD COLUMN openai_enabled BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added openai_enabled column to org_ai_configs';
    END IF;

    -- Add OpenAI Assistant ID to assistant versions if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_assistant_versions' AND column_name = 'openai_assistant_id') THEN
        ALTER TABLE ai_assistant_versions ADD COLUMN openai_assistant_id TEXT;
        RAISE NOTICE 'Added openai_assistant_id column to ai_assistant_versions';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'ai_assistant_versions' AND column_name = 'use_openai') THEN
        ALTER TABLE ai_assistant_versions ADD COLUMN use_openai BOOLEAN DEFAULT false;
        RAISE NOTICE 'Added use_openai column to ai_assistant_versions';
    END IF;

    -- Add scoring method configuration to calls table if they don't exist
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'scoring_method') THEN
        ALTER TABLE calls ADD COLUMN scoring_method TEXT DEFAULT 'local' CHECK (scoring_method IN ('local', 'openai'));
        RAISE NOTICE 'Added scoring_method column to calls';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'openai_thread_id') THEN
        ALTER TABLE calls ADD COLUMN openai_thread_id TEXT;
        RAISE NOTICE 'Added openai_thread_id column to calls';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'openai_run_id') THEN
        ALTER TABLE calls ADD COLUMN openai_run_id TEXT;
        RAISE NOTICE 'Added openai_run_id column to calls';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'calls' AND column_name = 'openai_raw_response') THEN
        ALTER TABLE calls ADD COLUMN openai_raw_response TEXT;
        RAISE NOTICE 'Added openai_raw_response column to calls';
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

-- Return summary of what was done
SELECT 
    'Migration completed successfully' as status,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'org_ai_configs' AND column_name IN ('openai_api_key', 'openai_enabled')) as org_config_fields_added,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'ai_assistant_versions' AND column_name IN ('openai_assistant_id', 'use_openai')) as assistant_fields_added,
    (SELECT COUNT(*) FROM information_schema.columns WHERE table_name = 'calls' AND column_name IN ('scoring_method', 'openai_thread_id', 'openai_run_id', 'openai_raw_response')) as call_fields_added;