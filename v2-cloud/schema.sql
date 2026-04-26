-- Perekonna Toiduplaan — Postgres schema for Supabase
-- Run this once in the Supabase SQL Editor after creating your project.
--
-- Tables: households, profiles, meal_plans, shopping_state, prisma_queue, weight_log
-- Auth model: Supabase Auth (Google OAuth)
-- Multi-user: profiles.household_id binds a user to one household.
-- Family members of the same household see the same plans, shopping list, queue.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists households (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  created_at  timestamptz not null default now()
);

create table if not exists profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  display_name  text,
  household_id  uuid references households(id) on delete set null,
  created_at    timestamptz not null default now()
);

create table if not exists meal_plans (
  id            uuid primary key default gen_random_uuid(),
  household_id  uuid not null references households(id) on delete cascade,
  week_start    date not null,
  plan_data     jsonb not null default '{}'::jsonb,
  updated_at    timestamptz not null default now(),
  unique (household_id, week_start)
);

create table if not exists shopping_state (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  week_start      date not null,
  checked_keys    text[] not null default '{}',
  extras          jsonb not null default '[]'::jsonb,
  prefer_organic  boolean not null default false,
  updated_at      timestamptz not null default now(),
  unique (household_id, week_start)
);

create table if not exists prisma_queue (
  id              uuid primary key default gen_random_uuid(),
  household_id    uuid not null references households(id) on delete cascade,
  enqueued_by     uuid references auth.users(id) on delete set null,
  name            text not null,
  organic         boolean not null default false,
  status          text not null default 'pending',  -- pending | processing | done | failed
  result_message  text,
  created_at      timestamptz not null default now(),
  processed_at    timestamptz
);

create index if not exists prisma_queue_pending_idx
  on prisma_queue (household_id, created_at)
  where status = 'pending';

create table if not exists weight_log (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  date        date not null,
  weight_kg   numeric(5,2) not null,
  created_at  timestamptz not null default now(),
  unique (user_id, date)
);

-- ---------------------------------------------------------------------------
-- Auto-create profile when a new auth user signs up
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.email)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- RLS — every table is locked down by default
-- ---------------------------------------------------------------------------

alter table households       enable row level security;
alter table profiles         enable row level security;
alter table meal_plans       enable row level security;
alter table shopping_state   enable row level security;
alter table prisma_queue     enable row level security;
alter table weight_log       enable row level security;

-- Helper: returns the household_id of the current authenticated user.
-- Marked stable + security definer so RLS policies can call it safely.
create or replace function public.current_household()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id from public.profiles where id = auth.uid();
$$;

-- profiles
drop policy if exists "self read profile"        on profiles;
drop policy if exists "household read members"   on profiles;
drop policy if exists "self update profile"      on profiles;
create policy "self read profile"
  on profiles for select using (auth.uid() = id);
create policy "household read members"
  on profiles for select using (household_id = public.current_household());
create policy "self update profile"
  on profiles for update using (auth.uid() = id)
  with check (auth.uid() = id);

-- households
drop policy if exists "members read household" on households;
drop policy if exists "any user creates household" on households;
create policy "members read household"
  on households for select using (id = public.current_household());
create policy "any user creates household"
  on households for insert with check (auth.uid() is not null);

-- meal_plans
drop policy if exists "household rw plans" on meal_plans;
create policy "household rw plans"
  on meal_plans for all
  using (household_id = public.current_household())
  with check (household_id = public.current_household());

-- shopping_state
drop policy if exists "household rw shopping" on shopping_state;
create policy "household rw shopping"
  on shopping_state for all
  using (household_id = public.current_household())
  with check (household_id = public.current_household());

-- prisma_queue
drop policy if exists "household rw queue" on prisma_queue;
create policy "household rw queue"
  on prisma_queue for all
  using (household_id = public.current_household())
  with check (household_id = public.current_household());

-- weight_log (per-user, not shared with household)
drop policy if exists "self rw weight" on weight_log;
create policy "self rw weight"
  on weight_log for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Realtime — broadcast row changes to subscribed clients
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table meal_plans;
alter publication supabase_realtime add table shopping_state;
alter publication supabase_realtime add table prisma_queue;

-- ---------------------------------------------------------------------------
-- Done. Next step: run the Vercel + extension setup.
-- ---------------------------------------------------------------------------
