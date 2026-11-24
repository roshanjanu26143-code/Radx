create index if not exists school_academic_subjects_created_by_idx on public.school_academic_subjects(created_by);
create index if not exists school_academic_timetable_created_by_idx on public.school_academic_timetable(created_by);
create index if not exists school_academic_timetable_subject_idx on public.school_academic_timetable(school_id,subject_id);

drop policy if exists "School admins manage academic subjects" on public.school_academic_subjects;
create policy "School admins insert academic subjects" on public.school_academic_subjects for insert to authenticated with check (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_subjects.school_id and t.admin_user_id=(select auth.uid()))
);
create policy "School admins update academic subjects" on public.school_academic_subjects for update to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_subjects.school_id and t.admin_user_id=(select auth.uid()))
) with check (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_subjects.school_id and t.admin_user_id=(select auth.uid()))
);
create policy "School admins delete academic subjects" on public.school_academic_subjects for delete to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_subjects.school_id and t.admin_user_id=(select auth.uid()))
);

drop policy if exists "School admins manage academic timetable" on public.school_academic_timetable;
create policy "School admins insert academic timetable" on public.school_academic_timetable for insert to authenticated with check (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_timetable.school_id and t.admin_user_id=(select auth.uid()))
);
create policy "School admins update academic timetable" on public.school_academic_timetable for update to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_timetable.school_id and t.admin_user_id=(select auth.uid()))
) with check (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_timetable.school_id and t.admin_user_id=(select auth.uid()))
);
create policy "School admins delete academic timetable" on public.school_academic_timetable for delete to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_timetable.school_id and t.admin_user_id=(select auth.uid()))
);
