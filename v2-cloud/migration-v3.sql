-- migration v3: ingredient substitutions (per-household)
create table if not exists substitutions (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references households(id) on delete cascade,
  from_text text not null,
  to_text text not null,
  created_at timestamptz not null default now()
);

create index if not exists substitutions_household_idx on substitutions (household_id);

alter table substitutions enable row level security;

drop policy if exists "household rw substitutions" on substitutions;
create policy "household rw substitutions"
  on substitutions for all
  using (household_id = public.current_household())
  with check (household_id = public.current_household());

do $$
begin
  alter publication supabase_realtime add table substitutions;
exception when duplicate_object then null;
end$$;
