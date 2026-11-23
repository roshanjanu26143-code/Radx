alter table public.school_user_roles add column if not exists person_id text;
create index if not exists school_user_roles_person_idx on public.school_user_roles(school_id,person_id);
create table if not exists public.school_teacher_class_assignments (
 id uuid primary key default gen_random_uuid(), school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
 teacher_person_id text not null, standard_name text not null check(length(btrim(standard_name))>0),
 section_name text not null check(length(btrim(section_name))>0), subject_name text, is_active boolean not null default true,
 created_by uuid not null default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 constraint school_teacher_assignment_teacher_fk foreign key(school_id,teacher_person_id) references public.school_people(school_id,person_id) on update cascade on delete cascade,
 constraint school_teacher_assignment_unique unique(school_id,teacher_person_id,standard_name,section_name,subject_name)
);
create index if not exists school_teacher_assignment_class_idx on public.school_teacher_class_assignments(school_id,standard_name,section_name,is_active);
alter table public.school_teacher_class_assignments enable row level security;
grant select,insert,update,delete on public.school_teacher_class_assignments to authenticated;
create policy "Admins manage teacher class assignments" on public.school_teacher_class_assignments for all to authenticated
using(exists(select 1 from public.school_tenants t where t.school_id=school_teacher_class_assignments.school_id and t.admin_user_id=(select auth.uid())))
with check(exists(select 1 from public.school_tenants t where t.school_id=school_teacher_class_assignments.school_id and t.admin_user_id=(select auth.uid())));
create policy "Teachers read their own class assignments" on public.school_teacher_class_assignments for select to authenticated
using(exists(select 1 from public.school_user_roles r where r.school_id=school_teacher_class_assignments.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role='Teacher' and r.person_id=school_teacher_class_assignments.teacher_person_id and 'Attendance'=any(r.allowed_pages)));
drop policy if exists "Assigned school users can read people" on public.school_people;
create policy "Assigned school users can read people" on public.school_people for select to authenticated
using(exists(select 1 from public.school_user_roles r where r.school_id=school_people.school_id and r.user_id=(select auth.uid()) and r.status='active' and (
(school_people.record_type='Student' and ('Students Data'=any(r.allowed_pages) or exists(select 1 from public.school_teacher_class_assignments a where a.school_id=school_people.school_id and a.is_active and a.teacher_person_id=r.person_id and a.standard_name=school_people.details->>'joining_standard' and a.section_name=school_people.details->>'section' and 'Attendance'=any(r.allowed_pages))))
or (school_people.record_type='Teacher' and ('Teachers'=any(r.allowed_pages) or r.person_id=school_people.person_id))
or (school_people.record_type='Staff' and 'Staff'=any(r.allowed_pages))
or (school_people.record_type='Driver & Cleaner' and 'Driver & Cleaner'=any(r.allowed_pages))
or (school_people.record_type='Student' and 'Parent Book'=any(r.allowed_pages))
)));
drop policy if exists "Assigned teachers can read attendance sessions" on public.school_attendance_sessions;
create policy "Assigned teachers can read attendance sessions" on public.school_attendance_sessions for select to authenticated
using(exists(select 1 from public.school_user_roles r where r.school_id=school_attendance_sessions.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.person_id=school_attendance_sessions.teacher_person_id and 'Attendance'=any(r.allowed_pages)));
drop policy if exists "Assigned teachers can read attendance marks" on public.school_attendance_marks;
create policy "Assigned teachers can read attendance marks" on public.school_attendance_marks for select to authenticated
using(exists(select 1 from public.school_user_roles r join public.school_attendance_sessions s on s.school_id=r.school_id and s.id=school_attendance_marks.session_id where r.school_id=school_attendance_marks.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.person_id=s.teacher_person_id and 'Attendance'=any(r.allowed_pages)));
drop policy if exists "School admins insert attendance sessions" on public.school_attendance_sessions;
create policy "Admins and assigned teachers insert attendance sessions" on public.school_attendance_sessions for insert to authenticated
with check(submitted_by=(select auth.uid()) and (exists(select 1 from public.school_tenants t where t.school_id=school_attendance_sessions.school_id and t.admin_user_id=(select auth.uid())) or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a on a.school_id=r.school_id and a.teacher_person_id=r.person_id where r.school_id=school_attendance_sessions.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role='Teacher' and 'Attendance'=any(r.allowed_pages) and a.is_active and a.standard_name=school_attendance_sessions.standard_name and a.section_name=school_attendance_sessions.section_name and r.person_id=school_attendance_sessions.teacher_person_id)));
drop policy if exists "School admins insert attendance marks" on public.school_attendance_marks;
create policy "Admins and assigned teachers insert attendance marks" on public.school_attendance_marks for insert to authenticated
with check(exists(select 1 from public.school_attendance_sessions s where s.id=school_attendance_marks.session_id and s.school_id=school_attendance_marks.school_id and (exists(select 1 from public.school_tenants t where t.school_id=s.school_id and t.admin_user_id=(select auth.uid())) or exists(select 1 from public.school_user_roles r where r.school_id=s.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role='Teacher' and r.person_id=s.teacher_person_id and 'Attendance'=any(r.allowed_pages)))));
create or replace function public.submit_school_attendance(p_school_id text,p_attendance_date date,p_session_code text,p_standard_name text,p_section_name text,p_teacher_person_id text,p_marks jsonb,p_location_lat double precision default null,p_location_lng double precision default null,p_location_accuracy_m double precision default null)
returns uuid language plpgsql set search_path='' as $function$
declare v_session_id uuid;v_mark_count integer;v_student_count integer;v_is_admin boolean;v_is_assigned boolean;
begin
 if auth.uid() is null then raise exception 'Authentication required';end if;
 select exists(select 1 from public.school_tenants t where t.school_id=p_school_id and t.admin_user_id=(select auth.uid())) into v_is_admin;
 select exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a on a.school_id=r.school_id and a.teacher_person_id=r.person_id where r.school_id=p_school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role='Teacher' and r.person_id=p_teacher_person_id and 'Attendance'=any(r.allowed_pages) and a.is_active and a.standard_name=p_standard_name and a.section_name=p_section_name) into v_is_assigned;
 if not v_is_admin and not v_is_assigned then raise exception 'You are not assigned to this class and section';end if;
 if p_session_code not in ('MORNING','AFTERNOON') then raise exception 'Invalid attendance session';end if;
 if jsonb_typeof(p_marks)<>'array' or jsonb_array_length(p_marks)=0 then raise exception 'Attendance marks are required';end if;
 if not exists(select 1 from public.school_people p where p.school_id=p_school_id and p.person_id=p_teacher_person_id and p.record_type='Teacher') then raise exception 'Teacher record not found for this school';end if;
 select count(*) into v_mark_count from jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text);
 if v_mark_count<>jsonb_array_length(p_marks) then raise exception 'Invalid attendance payload';end if;
 if exists(select 1 from jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text) where m.student_person_id is null or m.attendance_status not in ('PRESENT','ABSENT')) then raise exception 'Invalid student attendance status';end if;
 select count(*) into v_student_count from public.school_people p join jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text) on m.student_person_id=p.person_id where p.school_id=p_school_id and p.record_type='Student' and p.details->>'joining_standard'=p_standard_name and p.details->>'section'=p_section_name;
 if v_student_count<>v_mark_count then raise exception 'One or more students do not belong to this standard and section';end if;
 insert into public.school_attendance_sessions(school_id,attendance_date,session_code,standard_name,section_name,teacher_person_id,submitted_by,location_lat,location_lng,location_accuracy_m) values(p_school_id,p_attendance_date,p_session_code,p_standard_name,p_section_name,p_teacher_person_id,(select auth.uid()),p_location_lat,p_location_lng,p_location_accuracy_m) returning id into v_session_id;
 insert into public.school_attendance_marks(school_id,session_id,student_person_id,attendance_status) select p_school_id,v_session_id,m.student_person_id,m.attendance_status from jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text);
 return v_session_id;
end;$function$;