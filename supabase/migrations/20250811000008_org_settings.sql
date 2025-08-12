-- Update org_ai_configs table to support organization settings

-- Add new columns for org settings
DO $$ 
BEGIN
  BEGIN
    ALTER TABLE org_ai_configs ADD COLUMN default_framework_version text DEFAULT '1.0';
  EXCEPTION
    WHEN duplicate_column THEN 
      RAISE NOTICE 'Column default_framework_version already exists in org_ai_configs table';
  END;
  
  BEGIN
    ALTER TABLE org_ai_configs ADD COLUMN default_assistant_version_id uuid REFERENCES ai_assistant_versions(id);
  EXCEPTION
    WHEN duplicate_column THEN 
      RAISE NOTICE 'Column default_assistant_version_id already exists in org_ai_configs table';
  END;

  BEGIN
    ALTER TABLE org_ai_configs ADD COLUMN tool_flags jsonb DEFAULT '{}';
  EXCEPTION
    WHEN duplicate_column THEN 
      RAISE NOTICE 'Column tool_flags already exists in org_ai_configs table';
  END;
END $$;

-- Update existing records to have default values
UPDATE org_ai_configs 
SET 
  default_framework_version = COALESCE(default_framework_version, '1.0'),
  tool_flags = COALESCE(tool_flags, '{"require_suitability_first": false, "enable_compliance_mode": false, "require_disclosure": false}'::jsonb)
WHERE default_framework_version IS NULL OR tool_flags IS NULL;