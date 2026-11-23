create table if not exists public.school_user_roles (
  id uuid primary key default gen_random_uuid(),
  school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('Cashier-Staff','Accountant-Staff','Principal','Assistant Principal','Correspondent','Academic Director','Teacher','Staff')),
  allowed_pages text[] not null default '{}',
  status text not null default 'active' check (status in ('active','suspended')),
  created_by uuid not null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id,user_id),
  unique (school_id,email)
);
create index if not exists school_user_roles_user_idx on public.school_user_roles(user_id);
create index if not exists school_user_roles_school_role_idx on public.school_user_roles(school_id,role);
alter table public.school_user_roles enable row level security;
drop policy if exists "Users can read their own school role" on public.school_user_roles;
create policy "Users can read their own school role" on public.school_user_roles
for select to authenticated using (user_id = (select auth.uid()));
drop policy if exists "School admins manage role assignments" on public.school_user_roles;
create policy "School admins manage role assignments" on public.school_user_roles
for all to authenticated
using (exists (select 1 from public.school_tenants t where t.school_id=school_user_roles.school_id and t.admin_user_id=(select auth.uid())))
with check (exists (select 1 from public.school_tenants t where t.school_id=school_user_roles.school_id and t.admin_user_id=(select auth.uid())));
grant select, insert, update, delete on public.school_user_roles to authenticated;

create table if not exists public.school_audit_logs (
  id bigint generated always as identity primary key,
  school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
  actor_user_id uuid,
  actor_email text,
  action text not null,
  entity_type text not null,
  entity_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists school_audit_logs_school_created_idx on public.school_audit_logs(school_id,created_at desc);
alter table public.school_audit_logs enable row level security;
drop policy if exists "School admins can read audit logs" on public.school_audit_logs;
create policy "School admins can read audit logs" on public.school_audit_logs
for select to authenticated
using (exists (select 1 from public.school_tenants t where t.school_id=school_audit_logs.school_id and t.admin_user_id=(select auth.uid())));
grant select on public.school_audit_logs to authenticated;

create or replace function public.write_school_role_audit_log()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target_school_id text; target_user_id uuid; target_email text; target_actor uuid; audit_action text;
begin
  if tg_op = 'DELETE' then target_school_id:=old.school_id; target_user_id:=old.user_id; target_email:=old.email; target_actor:=old.created_by; audit_action:='role_user.deleted';
  elsif tg_op = 'UPDATE' then target_school_id:=new.school_id; target_user_id:=new.user_id; target_email:=new.email; target_actor:=new.created_by; audit_action:='role_user.updated';
  else target_school_id:=new.school_id; target_user_id:=new.user_id; target_email:=new.email; target_actor:=new.created_by; audit_action:='role_user.created'; end if;
  insert into public.school_audit_logs(school_id,actor_user_id,actor_email,action,entity_type,entity_id,details)
  values(target_school_id,target_actor,(select u.email from auth.users u where u.id=target_actor),audit_action,'school_user_role',target_user_id::text,
    jsonb_build_object('email',target_email,'role',case when tg_op='DELETE' then old.role else new.role end));
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;
drop trigger if exists school_user_roles_audit on public.school_user_roles;
create trigger school_user_roles_audit after insert or update or delete on public.school_user_roles for each row execute function public.write_school_role_audit_log();
