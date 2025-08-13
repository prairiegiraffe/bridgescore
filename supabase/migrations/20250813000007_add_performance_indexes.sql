-- Add critical performance indexes for common query patterns

-- Critical indexes for calls table (most queried table)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_org_created_at 
ON calls(org_id, created_at DESC) 
WHERE org_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_user_created_at 
ON calls(user_id, created_at DESC) 
WHERE user_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_score_total 
ON calls(score_total) 
WHERE score_total IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_manually_adjusted 
ON calls(manually_adjusted, created_at DESC) 
WHERE manually_adjusted = true;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_flagged_review 
ON calls(flagged_for_review, created_at DESC) 
WHERE flagged_for_review = true;

-- Composite index for dashboard queries (org + user + date range)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_dashboard_stats 
ON calls(org_id, user_id, created_at DESC, score_total) 
WHERE org_id IS NOT NULL AND user_id IS NOT NULL AND score_total IS NOT NULL;

-- Indexes for memberships table (frequently joined)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memberships_user_org_role 
ON memberships(user_id, org_id, role);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memberships_org_role 
ON memberships(org_id, role) 
WHERE role IN ('owner', 'admin');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_memberships_superadmin 
ON memberships(user_id, is_superadmin) 
WHERE is_superadmin = true;

-- Indexes for organizations table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_created_at 
ON organizations(created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_openai_assistant 
ON organizations(openai_assistant_id) 
WHERE openai_assistant_id IS NOT NULL;

-- GIN indexes for JSONB columns (for fast JSON queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_organizations_bridge_steps_gin 
ON organizations USING GIN(bridge_steps) 
WHERE bridge_steps IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_score_breakdown_gin 
ON calls USING GIN(score_breakdown) 
WHERE score_breakdown IS NOT NULL;

-- Indexes for resources table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resources_org_type 
ON resources(org_id, resource_type) 
WHERE org_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_resources_created_at 
ON resources(created_at DESC);

-- Indexes for saved_views table
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_saved_views_org_user 
ON saved_views(org_id, user_id);

-- Indexes for profiles table (auth queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_email 
ON profiles(email) 
WHERE email IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_updated_at 
ON profiles(updated_at DESC);

-- Index for user_files
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_files_user_created 
ON user_files(user_id, created_at DESC);

-- Partial indexes for common filter patterns
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_recent_org 
ON calls(org_id, created_at DESC) 
WHERE created_at > (CURRENT_DATE - INTERVAL '30 days') AND org_id IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_high_scores 
ON calls(score_total, created_at DESC) 
WHERE score_total >= 80;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_low_scores 
ON calls(score_total, created_at DESC) 
WHERE score_total < 70;

-- Text search indexes for full-text search
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_title_search 
ON calls USING GIN(to_tsvector('english', title)) 
WHERE title IS NOT NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_calls_transcript_search 
ON calls USING GIN(to_tsvector('english', transcript)) 
WHERE transcript IS NOT NULL;

-- Add statistics targets for better query planning
ALTER TABLE calls ALTER COLUMN org_id SET STATISTICS 1000;
ALTER TABLE calls ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE calls ALTER COLUMN score_total SET STATISTICS 1000;
ALTER TABLE calls ALTER COLUMN created_at SET STATISTICS 1000;

ALTER TABLE memberships ALTER COLUMN org_id SET STATISTICS 1000;
ALTER TABLE memberships ALTER COLUMN user_id SET STATISTICS 1000;
ALTER TABLE memberships ALTER COLUMN role SET STATISTICS 1000;