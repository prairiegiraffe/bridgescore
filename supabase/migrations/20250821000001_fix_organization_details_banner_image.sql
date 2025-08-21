-- Fix organization_details view to include banner_image_url
-- This ensures banner images persist after page reload

-- Drop and recreate the organization_details view with banner_image_url
DROP VIEW IF EXISTS organization_details CASCADE;

CREATE VIEW organization_details AS
SELECT 
  o.id,
  o.name,
  o.domain,
  o.primary_color,
  o.secondary_color,
  o.banner_image_url,  -- Add missing banner_image_url column
  o.bridge_steps,
  o.openai_assistant_id,
  o.openai_vector_store_id,
  o.openai_model,
  o.demo_mode,
  o.created_at,
  (SELECT COUNT(*) FROM memberships m WHERE m.org_id = o.id) as member_count
FROM organizations o
WHERE o.id IN (
  SELECT org_id FROM memberships 
  WHERE user_id = auth.uid()
);

-- Grant select permission to authenticated users
GRANT SELECT ON organization_details TO authenticated;

-- Add comment for documentation
COMMENT ON VIEW organization_details IS 'View of organizations with computed fields like member_count, now includes banner_image_url for proper banner display';