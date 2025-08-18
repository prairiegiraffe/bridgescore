-- Add video link support to resources table
-- This enables YouTube/Vimeo links as resources

-- Add new columns for video link support
ALTER TABLE resources 
ADD COLUMN IF NOT EXISTS video_url TEXT,
ADD COLUMN IF NOT EXISTS resource_type VARCHAR(10) DEFAULT 'file' CHECK (resource_type IN ('file', 'url'));

-- Add index for faster querying by resource type
CREATE INDEX IF NOT EXISTS idx_resources_resource_type ON resources(resource_type);

-- Add comment for documentation
COMMENT ON COLUMN resources.video_url IS 'URL for YouTube/Vimeo videos when resource_type is url';
COMMENT ON COLUMN resources.resource_type IS 'Type of resource: file (document/PDF) or url (YouTube/Vimeo link)';