-- Ensure profiles are automatically created for new users
-- This fixes the issue where invited users don't show in the users list

-- Create a function to automatically create profiles for new auth users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', ''),
    NEW.created_at
  )
  ON CONFLICT (id) DO UPDATE SET
    email = NEW.email,
    full_name = COALESCE(NEW.raw_user_meta_data->>'full_name', profiles.full_name);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to run the function when a new user is created
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Backfill any missing profiles for existing users
INSERT INTO public.profiles (id, email, full_name, created_at)
SELECT 
  u.id,
  u.email,
  COALESCE(u.raw_user_meta_data->>'full_name', ''),
  u.created_at
FROM auth.users u
LEFT JOIN public.profiles p ON p.id = u.id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

-- Update the fetchOrgUsers query to be more robust
-- This handles cases where profiles might be missing temporarily
CREATE OR REPLACE VIEW membership_with_profiles AS
SELECT 
  m.user_id,
  m.org_id,
  m.role,
  m.is_superadmin,
  COALESCE(p.email, u.email) as email,
  COALESCE(p.full_name, u.raw_user_meta_data->>'full_name', '') as full_name,
  COALESCE(p.created_at, u.created_at) as created_at,
  p.avatar_url
FROM memberships m
LEFT JOIN profiles p ON p.id = m.user_id
LEFT JOIN auth.users u ON u.id = m.user_id
WHERE u.id IS NOT NULL;

-- Grant access to the view
GRANT SELECT ON membership_with_profiles TO authenticated;

-- Success message
SELECT 'Profiles creation trigger added successfully.' as status;