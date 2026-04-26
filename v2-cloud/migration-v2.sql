-- Perekonna Toiduplaan — migration v2
-- Adds: household_invites, recipes, updated handle_new_user trigger
-- Run in Supabase SQL Editor after schema.sql.

-- ---------------------------------------------------------------------------
-- 1. Household invites (pending invites by email)
-- ---------------------------------------------------------------------------

create table if not exists household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  invited_email text not null,
  invited_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create unique index if not exists household_invites_email_idx
  on household_invites (lower(invited_email));

alter table household_invites enable row level security;

drop policy if exists "household read invites" on household_invites;
create policy "household read invites"
  on household_invites for select using (household_id = public.current_household());

drop policy if exists "household add invites" on household_invites;
create policy "household add invites"
  on household_invites for insert
  with check (household_id = public.current_household());

drop policy if exists "household delete invites" on household_invites;
create policy "household delete invites"
  on household_invites for delete using (household_id = public.current_household());

-- ---------------------------------------------------------------------------
-- 2. Update handle_new_user trigger to auto-join household from invites
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_household uuid;
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  )
  on conflict (id) do nothing;

  select household_id into pending_household
  from public.household_invites
  where lower(invited_email) = lower(new.email)
  limit 1;

  if pending_household is not null then
    update public.profiles set household_id = pending_household where id = new.id;
    delete from public.household_invites where lower(invited_email) = lower(new.email);
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Recipes table
-- ---------------------------------------------------------------------------

create table if not exists recipes (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  legacy_id int,
  name text not null,
  type text,
  kcal int,
  fat numeric(6,2),
  protein numeric(6,2),
  carbs numeric(6,2),
  fiber numeric(6,2),
  prep_time int,
  ingredients jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists recipes_household_idx on recipes (household_id);
create index if not exists recipes_household_type_idx on recipes (household_id, type);

alter table recipes enable row level security;

drop policy if exists "household rw recipes" on recipes;
create policy "household rw recipes"
  on recipes for all
  using (household_id = public.current_household())
  with check (household_id = public.current_household());

-- ---------------------------------------------------------------------------
-- 4. Updated_at trigger for recipes
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists recipes_set_updated_at on recipes;
create trigger recipes_set_updated_at
  before update on recipes
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 5. Realtime publication
-- ---------------------------------------------------------------------------

do $$
begin
  alter publication supabase_realtime add table recipes;
exception when duplicate_object then null;
end$$;

do $$
begin
  alter publication supabase_realtime add table household_invites;
exception when duplicate_object then null;
end$$;
