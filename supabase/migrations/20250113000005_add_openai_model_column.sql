-- Add openai_model column to organizations table
DO $$
BEGIN
    -- Add the column if it doesn't exist
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' 
        AND column_name = 'openai_model'
    ) THEN
        ALTER TABLE organizations ADD COLUMN openai_model VARCHAR(100);
    END IF;
END $$;

-- Add comment to explain the column
DO $$
BEGIN
    -- Only add comment if the column exists
    IF EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'organizations' 
        AND column_name = 'openai_model'
    ) THEN
        EXECUTE 'COMMENT ON COLUMN organizations.openai_model IS ''OpenAI model used for the assistant (e.g., gpt-4o, gpt-4-turbo)''';
    END IF;
END $$;

-- Drop and recreate the organization_details view to include the new column
DROP VIEW IF EXISTS organization_details;

CREATE VIEW organization_details AS
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