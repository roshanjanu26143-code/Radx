drop policy if exists "School admins insert academic subjects" on public.school_academic_subjects;
drop policy if exists "School admins update academic subjects" on public.school_academic_subjects;
drop policy if exists "School admins delete academic subjects" on public.school_academic_subjects;
create policy "Authorized academic users insert subjects" on public.school_academic_subjects for insert to authenticated with check (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_subjects.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=school_academic_subjects.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Subjects'=any(r.allowed_pages))
);
create policy "Authorized academic users update subjects" on public.school_academic_subjects for update to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_subjects.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=school_academic_subjects.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Subjects'=any(r.allowed_pages))
) with check (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_subjects.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=school_academic_subjects.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Subjects'=any(r.allowed_pages))
);
create policy "Authorized academic users delete subjects" on public.school_academic_subjects for delete to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_subjects.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=school_academic_subjects.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Subjects'=any(r.allowed_pages))
);

drop policy if exists "School admins insert academic timetable" on public.school_academic_timetable;
drop policy if exists "School admins update academic timetable" on public.school_academic_timetable;
drop policy if exists "School admins delete academic timetable" on public.school_academic_timetable;
create policy "Authorized academic users insert timetable" on public.school_academic_timetable for insert to authenticated with check (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_timetable.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=school_academic_timetable.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Timetable'=any(r.allowed_pages))
);
create policy "Authorized academic users update timetable" on public.school_academic_timetable for update to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_timetable.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=school_academic_timetable.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Timetable'=any(r.allowed_pages))
) with check (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_timetable.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=school_academic_timetable.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Timetable'=any(r.allowed_pages))
);
create policy "Authorized academic users delete timetable" on public.school_academic_timetable for delete to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_timetable.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=school_academic_timetable.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Timetable'=any(r.allowed_pages))
);
