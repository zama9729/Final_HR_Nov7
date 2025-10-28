-- Update handle_new_user to only create profile, not roles
-- Roles are now handled by edge functions or signup flow
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_count INTEGER;
  assigned_role app_role;
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, email, first_name, last_name)
  VALUES (
    NEW.id,
    NEW.email,
    NEW.raw_user_meta_data->>'first_name',
    NEW.raw_user_meta_data->>'last_name'
  );
  
  -- Only assign role if this is first user OR if it's a signup (not created by edge function)
  -- Edge function sets needs_password_setup metadata
  IF NEW.raw_user_meta_data->>'needs_password_setup' IS NULL THEN
    -- This is a regular signup, check if first user
    SELECT COUNT(*) INTO user_count FROM public.user_roles;
    
    IF user_count = 0 THEN
      assigned_role := 'ceo';
    ELSE
      assigned_role := 'employee';
    END IF;
    
    -- Insert user role
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, assigned_role);
  END IF;
  
  RETURN NEW;
END;
$$;