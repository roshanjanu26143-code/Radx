create sequence if not exists public.school_registration_queue_seq
  as bigint
  start with 1
  increment by 1
  no minvalue
  no maxvalue
  cache 1;

create table if not exists public.school_tenants (
  id uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null unique references auth.users(id) on delete cascade,
  school_id text not null unique,
  school_name text not null check (length(btrim(school_name)) > 0),
  admin_email text not null,
  school_logo_url text,
  created_at timestamptz not null default now()
);

create or replace function public.assign_acadamix_school_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  queue_number bigint;
  registration_year text;
begin
  if new.school_id is null or btrim(new.school_id) = '' then
    queue_number := nextval('public.school_registration_queue_seq'::regclass);
    registration_year := to_char(now() at time zone 'Asia/Kolkata', 'YYYY');
    new.school_id := registration_year || 'RADXID' || lpad(queue_number::text, 6, '0');
  end if;
  return new;
end;
$$;

drop trigger if exists assign_acadamix_school_id_before_insert on public.school_tenants;
create trigger assign_acadamix_school_id_before_insert
before insert on public.school_tenants
for each row execute function public.assign_acadamix_school_id();

alter table public.school_tenants enable row level security;

drop policy if exists "School admins can view their own school registration" on public.school_tenants;
create policy "School admins can view their own school registration"
on public.school_tenants
for select
to authenticated
using ((select auth.uid()) = admin_user_id);

grant select on public.school_tenants to authenticated;
revoke all on public.school_tenants from anon;
