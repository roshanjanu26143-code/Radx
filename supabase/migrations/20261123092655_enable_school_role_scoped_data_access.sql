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
