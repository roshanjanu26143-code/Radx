create table if not exists public.school_people (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
  person_id text not null,
  record_type text not null check (record_type in ('Student','Teacher','Staff','Driver & Cleaner')),
  full_name text not null check (length(btrim(full_name)) > 0),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint school_people_school_person_id_unique unique (school_id, person_id)
);
create index if not exists school_people_school_type_idx on public.school_people (school_id, record_type);
create index if not exists school_people_school_name_idx on public.school_people (school_id, full_name);

alter table public.school_people enable row level security;
drop policy if exists "School admins can manage their own people" on public.school_people;
create policy "School admins can manage their own people"
on public.school_people for all to authenticated
using (exists (select 1 from public.school_tenants t where t.school_id = school_people.school_id and t.admin_user_id = (select auth.uid())))
with check (exists (select 1 from public.school_tenants t where t.school_id = school_people.school_id and t.admin_user_id = (select auth.uid())));
grant select, insert, update, delete on public.school_people to authenticated;

create table if not exists public.school_workspace_state (
  school_id text primary key references public.school_tenants(school_id) on update cascade on delete cascade,
  standards jsonb not null default '[]'::jsonb check (jsonb_typeof(standards) = 'array'),
  routes jsonb not null default '[]'::jsonb check (jsonb_typeof(routes) = 'array'),
  buses jsonb not null default '[]'::jsonb check (jsonb_typeof(buses) = 'array'),
  people_id_settings jsonb not null default '{}'::jsonb check (jsonb_typeof(people_id_settings) = 'object'),
  updated_at timestamptz not null default now()
);
alter table public.school_workspace_state enable row level security;
drop policy if exists "School admins can manage their own workspace state" on public.school_workspace_state;
create policy "School admins can manage their own workspace state"
on public.school_workspace_state for all to authenticated
using (exists (select 1 from public.school_tenants t where t.school_id = school_workspace_state.school_id and t.admin_user_id = (select auth.uid())))
with check (exists (select 1 from public.school_tenants t where t.school_id = school_workspace_state.school_id and t.admin_user_id = (select auth.uid())));
grant select, insert, update, delete on public.school_workspace_state to authenticated;
