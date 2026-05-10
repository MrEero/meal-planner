-- migration v5: atomic household creation for current user
-- Solves a chicken-and-egg with RLS where INSERT+SELECT on households fails
-- because the read policy needs profile.household_id to already point at it.

create or replace function public.ensure_household_for_current_user()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  hh_id uuid;
  current_user_id uuid;
  user_email text;
  user_name text;
begin
  current_user_id := auth.uid();
  if current_user_id is null then
    raise exception 'not authenticated';
  end if;

  -- Pull display name/email from auth.users for the profile row
  select email, raw_user_meta_data ->> 'full_name'
    into user_email, user_name
    from auth.users where id = current_user_id;

  -- Make sure profile exists
  insert into profiles (id, display_name)
  values (current_user_id, coalesce(user_name, user_email))
  on conflict (id) do nothing;

  -- Read current household_id
  select household_id into hh_id from profiles where id = current_user_id;

  -- If null, create new household and bind it
  if hh_id is null then
    insert into households (name) values ('Perekond') returning id into hh_id;
    update profiles set household_id = hh_id where id = current_user_id;
  end if;

  return hh_id;
end;
$$;

grant execute on function public.ensure_household_for_current_user() to authenticated;
