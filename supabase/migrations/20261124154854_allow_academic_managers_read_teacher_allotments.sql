create policy "Academic managers read teacher profiles for timetable"
on public.school_people for select to authenticated
using (
 record_type='Teacher' and exists(
  select 1 from public.school_user_roles r
  where r.school_id=school_people.school_id and r.user_id=(select auth.uid())
   and r.status='active' and r.role<>'Teacher' and 'Timetable'=any(r.allowed_pages)
 )
);

create policy "Academic managers read teacher class allotments"
on public.school_teacher_class_assignments for select to authenticated
using (
 exists(
  select 1 from public.school_user_roles r
  where r.school_id=school_teacher_class_assignments.school_id and r.user_id=(select auth.uid())
   and r.status='active' and r.role<>'Teacher'
   and ( 'Timetable'=any(r.allowed_pages) or 'Standard'=any(r.allowed_pages) )
 )
);
