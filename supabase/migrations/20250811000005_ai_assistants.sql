-- Migration 005: AI Assistants and Knowledge Management

-- Create org_ai_configs table (one config per org)
CREATE TABLE org_ai_configs (
  org_id UUID PRIMARY KEY REFERENCES organizations(id) ON DELETE CASCADE,
  active_assistant_version_id UUID,
  default_model TEXT DEFAULT 'gpt-4',
  tool_flags JSONB DEFAULT '{"web_search": true, "code_interpreter": false, "retrieval": true}'::jsonb,
  last_synced_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Create ai_assistant_versions table
CREATE TABLE ai_assistant_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT 'gpt-4',
  system_prompt TEXT,
  vectorstore_id TEXT,
  tool_flags JSONB DEFAULT '{"web_search": true, "code_interpreter": false, "retrieval": true}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Create ai_knowledge_packs table
CREATE TABLE ai_knowledge_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  source_type TEXT CHECK (source_type IN ('file', 'url', 'text', 'integration')),
  source_ref TEXT,
  vectorstore_id TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc', now()) NOT NULL
);

-- Add foreign key constraint for active assistant version
ALTER TABLE org_ai_configs 
  ADD CONSTRAINT fk_active_assistant_version 
  FOREIGN KEY (active_assistant_version_id) 
  REFERENCES ai_assistant_versions(id) ON DELETE SET NULL;

-- Create indexes for performance
CREATE INDEX idx_ai_assistant_versions_org_id ON ai_assistant_versions(org_id);
CREATE INDEX idx_ai_knowledge_packs_org_id ON ai_knowledge_packs(org_id);

-- Enable RLS on all AI tables
ALTER TABLE org_ai_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assistant_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_knowledge_packs ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Only org owners and admins can manage AI configs
CREATE POLICY "Owners and admins can view org AI config" ON org_ai_configs
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can manage org AI config" ON org_ai_configs
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- RLS Policies for assistant versions
CREATE POLICY "Owners and admins can view assistant versions" ON ai_assistant_versions
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can manage assistant versions" ON ai_assistant_versions
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

-- RLS Policies for knowledge packs
CREATE POLICY "Owners and admins can view knowledge packs" ON ai_knowledge_packs
  FOR SELECT USING (
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );

CREATE POLICY "Owners and admins can manage knowledge packs" ON ai_knowledge_packs
  FOR ALL USING (
    org_id IN (
      SELECT org_id FROM memberships 
      WHERE user_id = auth.uid() 
      AND role IN ('owner', 'admin')
    )
  );