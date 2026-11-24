create or replace function private.can_manage_exam_schedule(p_school_id text)
returns boolean language sql stable security definer set search_path=''
as $function$
 select (select auth.uid()) is not null and (
  exists(select 1 from public.school_tenants t where t.school_id=p_school_id and t.admin_user_id=(select auth.uid()))
  or exists(select 1 from public.school_user_roles r where r.school_id=p_school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Exam Schedules'=any(r.allowed_pages))
 );
$function$;
revoke all on function private.can_manage_exam_schedule(text) from public, anon;
grant execute on function private.can_manage_exam_schedule(text) to authenticated;

create or replace function private.can_write_exam_marks(p_school_id text,p_exam_schedule_id uuid)
returns boolean language sql stable security definer set search_path=''
as $function$
 select (select auth.uid()) is not null and exists(
  select 1 from public.school_exam_schedules e
  where e.school_id=p_school_id and e.id=p_exam_schedule_id and not e.is_published
   and (
    exists(select 1 from public.school_tenants t where t.school_id=e.school_id and t.admin_user_id=(select auth.uid()))
    or exists(select 1 from public.school_user_roles r where r.school_id=e.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Marks Entry'=any(r.allowed_pages))
    or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active where r.school_id=e.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role='Teacher' and 'Marks Entry'=any(r.allowed_pages) and a.standard_name=e.standard_name and a.section_name=e.section_name and (a.subject_name is null or a.subject_name=e.subject_name))
   )
 );
$function$;
revoke all on function private.can_write_exam_marks(text,uuid) from public, anon;
grant execute on function private.can_write_exam_marks(text,uuid) to authenticated;

drop policy if exists "Academic managers create exam schedules" on public.school_exam_schedules;
drop policy if exists "Admins and assigned teachers create exam schedules" on public.school_exam_schedules;
create policy "Academic managers create exam schedules" on public.school_exam_schedules for insert to authenticated
with check (private.can_manage_exam_schedule(school_id));

drop policy if exists "Academic managers update exam schedules" on public.school_exam_schedules;
drop policy if exists "Admins and assigned teachers update exam schedules" on public.school_exam_schedules;
create policy "Academic managers update exam schedules" on public.school_exam_schedules for update to authenticated
using (private.can_manage_exam_schedule(school_id))
with check (private.can_manage_exam_schedule(school_id));

drop policy if exists "Authorized users enter exam marks" on public.school_exam_marks;
drop policy if exists "Admins and assigned teachers enter exam marks" on public.school_exam_marks;
create policy "Authorized users enter exam marks" on public.school_exam_marks for insert to authenticated
with check (
 entered_by=(select auth.uid())
 and private.can_write_exam_marks(school_id,exam_schedule_id)
 and exists(select 1 from public.school_exam_schedules e join public.school_people s on s.school_id=e.school_id and s.person_id=school_exam_marks.student_person_id and s.record_type='Student' and s.details->>'joining_standard'=e.standard_name and coalesce(s.details->>'section','')=e.section_name where e.school_id=school_exam_marks.school_id and e.id=school_exam_marks.exam_schedule_id and school_exam_marks.marks_obtained between 0 and e.max_marks)
);

drop policy if exists "Authorized users update exam marks" on public.school_exam_marks;
drop policy if exists "Admins and assigned teachers update exam marks" on public.school_exam_marks;
create policy "Authorized users update exam marks" on public.school_exam_marks for update to authenticated
using (private.can_write_exam_marks(school_id,exam_schedule_id))
with check (
 entered_by=(select auth.uid())
 and private.can_write_exam_marks(school_id,exam_schedule_id)
 and exists(select 1 from public.school_exam_schedules e join public.school_people s on s.school_id=e.school_id and s.person_id=school_exam_marks.student_person_id and s.record_type='Student' and s.details->>'joining_standard'=e.standard_name and coalesce(s.details->>'section','')=e.section_name where e.school_id=school_exam_marks.school_id and e.id=school_exam_marks.exam_schedule_id and school_exam_marks.marks_obtained between 0 and e.max_marks)
);
