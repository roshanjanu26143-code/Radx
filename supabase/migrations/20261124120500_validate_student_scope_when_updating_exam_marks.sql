drop policy if exists "Admins and assigned teachers update exam marks" on public.school_exam_marks;
create policy "Admins and assigned teachers update exam marks"
on public.school_exam_marks for update to authenticated using (
 exists(select 1 from public.school_exam_schedules e where e.school_id=school_exam_marks.school_id and e.id=school_exam_marks.exam_schedule_id
  and (exists(select 1 from public.school_tenants t where t.school_id=e.school_id and t.admin_user_id=(select auth.uid()))
   or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a
    on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active
    where r.school_id=e.school_id and r.user_id=(select auth.uid()) and r.status='active'
     and r.allowed_pages && array['Marks Entry']::text[] and a.standard_name=e.standard_name and a.section_name=e.section_name
     and (a.subject_name is null or a.subject_name=e.subject_name))))
) with check (
 exists(select 1 from public.school_exam_schedules e
  where e.school_id=school_exam_marks.school_id and e.id=school_exam_marks.exam_schedule_id
   and school_exam_marks.marks_obtained<=e.max_marks
   and exists(select 1 from public.school_people s where s.school_id=e.school_id and s.person_id=school_exam_marks.student_person_id
    and s.record_type='Student' and s.details->>'joining_standard'=e.standard_name and coalesce(s.details->>'section','')=e.section_name)
   and (exists(select 1 from public.school_tenants t where t.school_id=e.school_id and t.admin_user_id=(select auth.uid()))
    or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a
     on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active
     where r.school_id=e.school_id and r.user_id=(select auth.uid()) and r.status='active'
      and r.allowed_pages && array['Marks Entry']::text[] and a.standard_name=e.standard_name and a.section_name=e.section_name
      and (a.subject_name is null or a.subject_name=e.subject_name)))
 )
);
