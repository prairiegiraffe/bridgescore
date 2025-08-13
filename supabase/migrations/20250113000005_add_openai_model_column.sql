-- Add openai_model column to organizations table
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS openai_model VARCHAR(100);

-- Add comment to explain the column
COMMENT ON COLUMN organizations.openai_model IS 'OpenAI model used for the assistant (e.g., gpt-4o, gpt-4-turbo)';

-- Update organization_details view to include the new column
CREATE OR REPLACE VIEW organization_details AS
SELECT 
    o.id,
    o.name,
    o.domain,
    o.primary_color,
    o.secondary_color,
    o.bridge_steps,
    o.openai_assistant_id,
    o.openai_vector_store_id,
    o.openai_model,
    o.created_at,
    COALESCE(member_count.count, 0) as member_count
FROM organizations o
LEFT JOIN (
    SELECT 
        org_id,
        COUNT(*) as count
    FROM memberships 
    GROUP BY org_id
) member_count ON o.id = member_count.org_id;