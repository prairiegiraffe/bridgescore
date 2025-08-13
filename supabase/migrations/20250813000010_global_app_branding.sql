-- Add global app branding settings
-- Only accessible to BridgeSelling staff via Organization Management page

-- Create app_settings table for global configuration
CREATE TABLE IF NOT EXISTS app_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB NOT NULL,
  description TEXT,
  updated_by UUID REFERENCES auth.users(id),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default branding settings
INSERT INTO app_settings (setting_key, setting_value, description) VALUES 
(
  'global_branding',
  '{
    "app_name": "BridgeScore",
    "logo_url": "",
    "primary_color": "#3B82F6",
    "secondary_color": "#1E40AF",
    "accent_color": "#10B981"
  }'::jsonb,
  'Global app branding including logo, colors, and app name'
) ON CONFLICT (setting_key) DO NOTHING;

-- Enable RLS
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Only superadmins can view/modify global settings
CREATE POLICY "Superadmins can manage app settings" ON app_settings
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM memberships 
      WHERE user_id = auth.uid() 
      AND is_superadmin = true
    )
  );

-- Create index for performance
CREATE INDEX IF NOT EXISTS idx_app_settings_key ON app_settings(setting_key);

-- Create function to get global branding settings
CREATE OR REPLACE FUNCTION get_global_branding()
RETURNS JSONB AS $$
DECLARE
  branding_settings JSONB;
BEGIN
  SELECT setting_value INTO branding_settings
  FROM app_settings 
  WHERE setting_key = 'global_branding';
  
  -- Return default if not found
  IF branding_settings IS NULL THEN
    RETURN '{
      "app_name": "BridgeScore",
      "logo_url": "",
      "primary_color": "#3B82F6",
      "secondary_color": "#1E40AF",
      "accent_color": "#10B981"
    }'::jsonb;
  END IF;
  
  RETURN branding_settings;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create function to update global branding
CREATE OR REPLACE FUNCTION update_global_branding(
  new_settings JSONB,
  updated_by_user UUID
)
RETURNS BOOLEAN AS $$
BEGIN
  -- Check if user is superadmin
  IF NOT EXISTS (
    SELECT 1 FROM memberships 
    WHERE user_id = updated_by_user 
    AND is_superadmin = true
  ) THEN
    RAISE EXCEPTION 'Only superadmins can update global branding';
  END IF;
  
  -- Update or insert the branding settings
  INSERT INTO app_settings (setting_key, setting_value, updated_by, updated_at)
  VALUES ('global_branding', new_settings, updated_by_user, NOW())
  ON CONFLICT (setting_key) 
  DO UPDATE SET 
    setting_value = new_settings,
    updated_by = updated_by_user,
    updated_at = NOW();
    
  RETURN true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;