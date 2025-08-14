-- Add demo_mode toggle to organizations
-- Allows organizations to show demo data on Team page for client presentations

ALTER TABLE organizations 
ADD COLUMN demo_mode BOOLEAN DEFAULT false;

-- Update existing organizations to have demo_mode = false by default
UPDATE organizations SET demo_mode = false WHERE demo_mode IS NULL;