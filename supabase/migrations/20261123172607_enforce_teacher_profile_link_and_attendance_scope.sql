alter table public.school_user_roles add constraint school_user_roles_teacher_person_fk foreign key(school_id,person_id) references public.school_people(school_id,person_id) on update cascade on delete set null;
create or replace function public.validate_school_role_person_link() returns trigger language plpgsql set search_path='' as $$
begin
 if new.role='Teacher' and new.person_id is not null and not exists(select 1 from public.school_people p where p.school_id=new.school_id and p.person_id=new.person_id and p.record_type='Teacher') then raise exception 'Teacher role must be linked to a Teacher profile in the same school';end if;
 if new.role<>'Teacher' and new.person_id is not null then raise exception 'Only Teacher role accounts can be linked to a teacher profile';end if;
 return new;
end;$$;
drop trigger if exists school_role_person_link_guard on public.school_user_roles;
create trigger school_role_person_link_guard before insert or update of role,person_id,school_id on public.school_user_roles for each row execute function public.validate_school_role_person_link();
drop policy if exists "Assigned teachers can read classroom QR tokens" on public.school_classroom_qr;
create policy "Assigned teachers can read classroom QR tokens" on public.school_classroom_qr for select to authenticated
using(exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a on a.school_id=r.school_id and a.teacher_person_id=r.person_id where r.school_id=school_classroom_qr.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role='Teacher' and 'Attendance'=any(r.allowed_pages) and a.is_active and a.standard_name=school_classroom_qr.standard_name));
drop policy if exists "Admins and assigned teachers insert attendance marks" on public.school_attendance_marks;
create policy "Admins and assigned teachers insert attendance marks" on public.school_attendance_marks for insert to authenticated
with check(exists(select 1 from public.school_attendance_sessions s where s.id=school_attendance_marks.session_id and s.school_id=school_attendance_marks.school_id and (exists(select 1 from public.school_tenants t where t.school_id=s.school_id and t.admin_user_id=(select auth.uid())) or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a on a.school_id=r.school_id and a.teacher_person_id=r.person_id where r.school_id=s.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role='Teacher' and r.person_id=s.teacher_person_id and 'Attendance'=any(r.allowed_pages) and a.is_active and a.standard_name=s.standard_name and a.section_name=s.section_name))));