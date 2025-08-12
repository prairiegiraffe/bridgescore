-- Create org_ai_configs record for your organization
-- This will enable the OpenAI integration settings

-- First, find your organization ID
SELECT id, name FROM organizations LIMIT 10;

-- Replace 'YOUR_ORG_ID_HERE' with your actual organization ID from the query above
-- Then run this insert statement:

INSERT INTO org_ai_configs (
    org_id,
    default_framework_version,
    tool_flags,
    openai_enabled,
    openai_api_key
) VALUES (
    'YOUR_ORG_ID_HERE',  -- Replace this with your actual org ID
    '1.0',
    '{"require_suitability_first": false, "enable_compliance_mode": false, "require_disclosure": false}'::jsonb,
    false,
    null
) ON CONFLICT (org_id) DO UPDATE SET
    openai_enabled = EXCLUDED.openai_enabled,
    openai_api_key = EXCLUDED.openai_api_key;