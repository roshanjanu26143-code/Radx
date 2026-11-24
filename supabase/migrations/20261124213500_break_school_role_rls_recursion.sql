create schema if not exists private;
revoke all on schema private from public, anon;
grant usage on schema private to authenticated;

create or replace function private.is_school_admin(p_school_id text)
returns boolean
language sql
stable
security definer
set search_path=''
as $function$
 select exists(
  select 1 from public.school_tenants t
  where t.school_id=p_school_id
   and t.admin_user_id=(select auth.uid())
 );
$function$;

revoke all on function private.is_school_admin(text) from public, anon;
grant execute on function private.is_school_admin(text) to authenticated;

drop policy if exists "School admins manage role assignments" on public.school_user_roles;
create policy "School admins manage role assignments"
on public.school_user_roles for all to authenticated
using (private.is_school_admin(school_id))
with check (private.is_school_admin(school_id));
