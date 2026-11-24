drop policy if exists "School users read exam schedules" on public.school_exam_schedules;
create policy "School users read scoped exam schedules"
on public.school_exam_schedules for select to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_exam_schedules.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r
  where r.school_id=school_exam_schedules.school_id and r.user_id=(select auth.uid()) and r.status='active'
   and r.role<>'Teacher' and r.allowed_pages && array['Exam Schedules','Student Results','Performance','Marks Entry']::text[])
 or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a
  on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active
  where r.school_id=school_exam_schedules.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role='Teacher'
   and r.allowed_pages && array['Exam Schedules','Student Results','Performance','Marks Entry']::text[]
   and a.standard_name=school_exam_schedules.standard_name and a.section_name=school_exam_schedules.section_name
   and (a.subject_name is null or a.subject_name=school_exam_schedules.subject_name))
);

drop policy if exists "School users read exam marks" on public.school_exam_marks;
create policy "School users read scoped exam marks"
on public.school_exam_marks for select to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_exam_marks.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r
  where r.school_id=school_exam_marks.school_id and r.user_id=(select auth.uid()) and r.status='active'
   and r.role<>'Teacher' and r.allowed_pages && array['Student Results','Performance','Marks Entry','Exam Schedules']::text[])
 or exists(select 1 from public.school_user_roles r
  join public.school_teacher_class_assignments a on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active
  join public.school_exam_schedules e on e.school_id=a.school_id and e.standard_name=a.standard_name and e.section_name=a.section_name
   and e.id=school_exam_marks.exam_schedule_id and (a.subject_name is null or a.subject_name=e.subject_name)
  where r.school_id=school_exam_marks.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role='Teacher'
   and r.allowed_pages && array['Student Results','Performance','Marks Entry','Exam Schedules']::text[])
);

create policy "Assigned teachers read students for marks entry"
on public.school_people for select to authenticated using (
 record_type='Student' and exists(
  select 1 from public.school_user_roles r join public.school_teacher_class_assignments a
   on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active
  where r.school_id=school_people.school_id and r.user_id=(select auth.uid()) and r.status='active'
   and 'Marks Entry'=any(r.allowed_pages)
   and a.standard_name=school_people.details->>'joining_standard'
   and a.section_name=coalesce(school_people.details->>'section','')
 )
);
