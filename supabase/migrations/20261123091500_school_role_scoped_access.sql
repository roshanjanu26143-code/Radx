-- Permit invited users to resolve their school and read only their assigned modules.
create policy "School members can read their school tenant"
on public.school_tenants for select to authenticated
using (exists (select 1 from public.school_user_roles r where r.school_id=school_tenants.school_id and r.user_id=(select auth.uid()) and r.status='active'));

create policy "Assigned school users can read people"
on public.school_people for select to authenticated
using (exists (select 1 from public.school_user_roles r where r.school_id=school_people.school_id and r.user_id=(select auth.uid()) and r.status='active'
  and (r.allowed_pages && array['Students Data','Teachers','Staff','Driver & Cleaner','Parent Book','Attendance','Create Student','Create Teacher','Create Staff','Create Driver & Cleaner']::text[])));

create policy "Assigned school users can add people"
on public.school_people for insert to authenticated
with check (exists (select 1 from public.school_user_roles r where r.school_id=school_people.school_id and r.user_id=(select auth.uid()) and r.status='active'
  and (r.allowed_pages && array['Create Student','Create Teacher','Create Staff','Create Driver & Cleaner']::text[])));

create policy "Assigned school users can read workspace structure"
on public.school_workspace_state for select to authenticated
using (exists (select 1 from public.school_user_roles r where r.school_id=school_workspace_state.school_id and r.user_id=(select auth.uid()) and r.status='active'
  and (r.allowed_pages && array['Standard','Routes','Buses','Attendance','GPS - Bus']::text[])));

create policy "Assigned teachers can read classroom QR tokens"
on public.school_classroom_qr for select to authenticated
using (exists (select 1 from public.school_user_roles r where r.school_id=school_classroom_qr.school_id and r.user_id=(select auth.uid()) and r.status='active'
  and 'Attendance'=any(r.allowed_pages)));

create policy "Assigned teachers can read attendance sessions"
on public.school_attendance_sessions for select to authenticated
using (exists (select 1 from public.school_user_roles r where r.school_id=school_attendance_sessions.school_id and r.user_id=(select auth.uid()) and r.status='active'
  and 'Attendance'=any(r.allowed_pages)));

create policy "Assigned teachers can read attendance marks"
on public.school_attendance_marks for select to authenticated
using (exists (select 1 from public.school_user_roles r where r.school_id=school_attendance_marks.school_id and r.user_id=(select auth.uid()) and r.status='active'
  and 'Attendance'=any(r.allowed_pages)));

-- Role invitations are audited using the original Admin actor stored on the role row.
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

-- Attendance writes remain Admin-only until teacher-to-person and class allotments are mapped.
drop policy if exists "Assigned teachers can create attendance sessions" on public.school_attendance_sessions;
drop policy if exists "Assigned teachers can insert attendance marks" on public.school_attendance_marks;
