-- Create a view that SuperAdmins can use to see user information
-- This safely exposes user data without giving direct access to auth.users

-- Create profiles table if it doesn't exist
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS on profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Create policy for profiles
CREATE POLICY "Users can view all profiles" ON public.profiles
  FOR SELECT
  USING (true);

CREATE POLICY "Users can update own profile" ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id);

-- Create or replace function to sync user profiles
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'full_name',
    NEW.created_at
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to auto-create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();

-- Backfill existing users into profiles
INSERT INTO public.profiles (id, email, full_name, created_at)
SELECT 
  id,
  email,
  raw_user_meta_data->>'full_name',
  created_at
FROM auth.users
ON CONFLICT (id) DO UPDATE
SET 
  email = EXCLUDED.email,
  full_name = EXCLUDED.full_name;

-- Create a view for SuperAdmins to see all user data with their memberships
CREATE OR REPLACE VIEW public.user_management_view AS
SELECT 
  p.id,
  p.email,
  p.full_name,
  p.created_at,
  p.avatar_url,
  COALESCE(
    json_agg(
      DISTINCT jsonb_build_object(
        'org_id', m.org_id,
        'role', m.role,
        'is_superadmin', m.is_superadmin,
        'organization', jsonb_build_object(
          'id', o.id,
          'name', o.name,
          'client', CASE 
            WHEN c.id IS NOT NULL THEN jsonb_build_object(
              'id', c.id,
              'name', c.name
            )
            ELSE NULL
          END
        )
      )
    ) FILTER (WHERE m.org_id IS NOT NULL),
    '[]'::json
  ) as memberships
FROM public.profiles p
LEFT JOIN public.memberships m ON m.user_id = p.id
LEFT JOIN public.organizations o ON o.id = m.org_id
LEFT JOIN public.clients c ON c.id = o.client_id
GROUP BY p.id, p.email, p.full_name, p.created_at, p.avatar_url;

-- Grant access to the view
GRANT SELECT ON public.user_management_view TO authenticated;

-- Create function for SuperAdmins to create users
CREATE OR REPLACE FUNCTION public.create_user_as_superadmin(
  user_email TEXT,
  user_password TEXT,
  user_full_name TEXT,
  user_org_id UUID DEFAULT NULL,
  user_role TEXT DEFAULT 'member',
  user_is_superadmin BOOLEAN DEFAULT FALSE
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  new_user_id UUID;
  caller_is_superadmin BOOLEAN;
BEGIN
  -- Check if caller is SuperAdmin
  SELECT is_superadmin INTO caller_is_superadmin
  FROM public.memberships
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF NOT caller_is_superadmin THEN
    RAISE EXCEPTION 'Only SuperAdmins can create users';
  END IF;

  -- Create the user (this requires service role key in practice)
  -- For now, return an error message
  RETURN json_build_object(
    'success', false,
    'message', 'User creation requires service role key. Please use Supabase Dashboard or API with service role key.'
  );
END;
$$;

-- Create function for SuperAdmins to delete users  
CREATE OR REPLACE FUNCTION public.delete_user_as_superadmin(target_user_id UUID)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  caller_is_superadmin BOOLEAN;
BEGIN
  -- Check if caller is SuperAdmin
  SELECT is_superadmin INTO caller_is_superadmin
  FROM public.memberships
  WHERE user_id = auth.uid()
  LIMIT 1;

  IF NOT caller_is_superadmin THEN
    RAISE EXCEPTION 'Only SuperAdmins can delete users';
  END IF;

  -- Don't allow self-deletion
  IF target_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete your own account';
  END IF;

  -- Delete user's memberships first
  DELETE FROM public.memberships WHERE user_id = target_user_id;
  
  -- Delete from profiles
  DELETE FROM public.profiles WHERE id = target_user_id;

  -- Note: Actual auth.users deletion requires service role
  RETURN json_build_object(
    'success', true,
    'message', 'User data deleted. Complete removal requires service role key.'
  );
END;
$$;