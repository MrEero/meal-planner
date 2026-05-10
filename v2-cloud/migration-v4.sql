-- migration v4: saved menus (snapshots in "Ajalugu" tab)
create table if not exists saved_menus (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  label text not null,
  saved_at timestamptz not null default now(),
  plan_data jsonb not null default '{}'::jsonb
);

create index if not exists saved_menus_household_idx on saved_menus (household_id, saved_at desc);

alter table saved_menus enable row level security;

drop policy if exists "household rw saved menus" on saved_menus;
create policy "household rw saved menus"
  on saved_menus for all
  using (household_id = public.current_household())
  with check (household_id = public.current_household());

do $$
begin
  alter publication supabase_realtime add table saved_menus;
exception when duplicate_object then null;
end$$;
