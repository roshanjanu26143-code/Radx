create table if not exists public.school_teacher_attendance (
 id uuid primary key default gen_random_uuid(),
 school_id text not null,
 attendance_date date not null,
 session_code text not null check (session_code in ('MORNING','AFTERNOON')),
 teacher_person_id text not null,
 checked_in_for_standard text not null,
 checked_in_for_section text not null,
 attendance_status text not null default 'PRESENT' check (attendance_status='PRESENT'),
 checked_in_by uuid not null,
 checked_in_at timestamptz not null default now(),
 constraint school_teacher_attendance_once unique (school_id,attendance_date,session_code,teacher_person_id),
 constraint school_teacher_attendance_school_fk foreign key (school_id) references public.school_tenants(school_id) on update cascade on delete cascade,
 constraint school_teacher_attendance_person_fk foreign key (school_id,teacher_person_id) references public.school_people(school_id,person_id) on update cascade on delete restrict
);
create index if not exists school_teacher_attendance_report_idx
 on public.school_teacher_attendance (school_id,attendance_date desc,session_code);
create index if not exists school_teacher_attendance_person_idx
 on public.school_teacher_attendance (school_id,teacher_person_id);

alter table public.school_teacher_attendance enable row level security;
grant select, insert on public.school_teacher_attendance to authenticated;
drop policy if exists "Teachers read own attendance checkins" on public.school_teacher_attendance;
drop policy if exists "School admins read teacher attendance checkins" on public.school_teacher_attendance;
drop policy if exists "Teachers and admins read teacher attendance checkins" on public.school_teacher_attendance;
create policy "Teachers and admins read teacher attendance checkins"
 on public.school_teacher_attendance for select to authenticated
 using (
  exists (
   select 1 from public.school_user_roles r
   where r.school_id=school_teacher_attendance.school_id
    and r.user_id=(select auth.uid()) and r.person_id=school_teacher_attendance.teacher_person_id
    and r.role='Teacher' and r.status='active'
  )
  or exists (
   select 1 from public.school_tenants t
   where t.school_id=school_teacher_attendance.school_id
    and t.admin_user_id=(select auth.uid())
  )
 );
drop policy if exists "Assigned teachers check in once per session" on public.school_teacher_attendance;
create policy "Assigned teachers check in once per session"
 on public.school_teacher_attendance for insert to authenticated
 with check (
  checked_in_by=(select auth.uid())
  and exists (
   select 1 from public.school_user_roles r
   join public.school_teacher_class_assignments a
    on a.school_id=r.school_id and a.teacher_person_id=r.person_id
   where r.school_id=school_teacher_attendance.school_id
    and r.user_id=(select auth.uid())
    and r.role='Teacher' and r.status='active'
    and r.person_id=school_teacher_attendance.teacher_person_id
    and 'Attendance'=any(r.allowed_pages)
    and a.is_active
    and a.standard_name=school_teacher_attendance.checked_in_for_standard
    and a.section_name=school_teacher_attendance.checked_in_for_section
  )
 );

create or replace function public.check_in_school_teacher_attendance(
 p_school_id text,p_attendance_date date,p_session_code text,
 p_standard_name text,p_section_name text,p_teacher_person_id text
) returns uuid
language plpgsql security invoker set search_path=''
as $function$
declare v_id uuid;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 if p_session_code not in ('MORNING','AFTERNOON') then raise exception 'Invalid attendance session'; end if;
 if not exists (
  select 1 from public.school_user_roles r
  join public.school_teacher_class_assignments a
   on a.school_id=r.school_id and a.teacher_person_id=r.person_id
  join public.school_people p
   on p.school_id=r.school_id and p.person_id=r.person_id and p.record_type='Teacher'
  where r.school_id=p_school_id and r.user_id=(select auth.uid())
   and r.status='active' and r.role='Teacher' and r.person_id=p_teacher_person_id
   and 'Attendance'=any(r.allowed_pages) and a.is_active
   and a.standard_name=p_standard_name and a.section_name=p_section_name
 ) then raise exception 'Only an active teacher assigned to this class and section can check in'; end if;
 insert into public.school_teacher_attendance(
  school_id,attendance_date,session_code,teacher_person_id,
  checked_in_for_standard,checked_in_for_section,checked_in_by
 ) values (
  p_school_id,p_attendance_date,p_session_code,p_teacher_person_id,
  p_standard_name,p_section_name,(select auth.uid())
 ) on conflict (school_id,attendance_date,session_code,teacher_person_id) do nothing;
 select id into v_id from public.school_teacher_attendance
 where school_id=p_school_id and attendance_date=p_attendance_date
  and session_code=p_session_code and teacher_person_id=p_teacher_person_id;
 return v_id;
end;
$function$;
revoke all on function public.check_in_school_teacher_attendance(text,date,text,text,text,text) from public;
grant execute on function public.check_in_school_teacher_attendance(text,date,text,text,text,text) to authenticated;

create or replace function public.submit_school_attendance(
 p_school_id text,p_attendance_date date,p_session_code text,p_standard_name text,
 p_section_name text,p_teacher_person_id text,p_marks jsonb,
 p_location_lat double precision default null,p_location_lng double precision default null,
 p_location_accuracy_m double precision default null
) returns uuid
language plpgsql security invoker set search_path=''
as $function$
declare v_session_id uuid; v_mark_count integer; v_student_count integer; v_is_assigned boolean;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 select exists(
  select 1 from public.school_user_roles r
  join public.school_teacher_class_assignments a on a.school_id=r.school_id and a.teacher_person_id=r.person_id
  where r.school_id=p_school_id and r.user_id=(select auth.uid())
   and r.status='active' and r.role='Teacher' and r.person_id=p_teacher_person_id
   and 'Attendance'=any(r.allowed_pages) and a.is_active
   and a.standard_name=p_standard_name and a.section_name=p_section_name
 ) into v_is_assigned;
 if not v_is_assigned then raise exception 'Only an active teacher assigned to this class and section can submit attendance'; end if;
 if p_session_code not in ('MORNING','AFTERNOON') then raise exception 'Invalid attendance session'; end if;
 if not exists (
  select 1 from public.school_teacher_attendance t
  where t.school_id=p_school_id and t.attendance_date=p_attendance_date
   and t.session_code=p_session_code and t.teacher_person_id=p_teacher_person_id
   and t.checked_in_by=(select auth.uid()) and t.attendance_status='PRESENT'
 ) then raise exception 'Teacher check-in is required before submitting student attendance'; end if;
 if p_marks is null or jsonb_typeof(p_marks)<>'array' or jsonb_array_length(p_marks)=0 then raise exception 'Attendance marks are required'; end if;
 if not exists(select 1 from public.school_people p where p.school_id=p_school_id and p.person_id=p_teacher_person_id and p.record_type='Teacher') then raise exception 'Teacher record not found for this school'; end if;
 select count(*) into v_mark_count from jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text);
 if v_mark_count<>jsonb_array_length(p_marks) then raise exception 'Invalid attendance payload'; end if;
 if exists(select 1 from jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text) where m.student_person_id is null or m.attendance_status not in ('PRESENT','ABSENT')) then raise exception 'Invalid student attendance status'; end if;
 select count(*) into v_student_count
 from public.school_people p join jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text) on m.student_person_id=p.person_id
 where p.school_id=p_school_id and p.record_type='Student'
  and p.details->>'joining_standard'=p_standard_name and p.details->>'section'=p_section_name;
 if v_student_count<>v_mark_count then raise exception 'One or more students do not belong to this standard and section'; end if;
 insert into public.school_attendance_sessions(
  school_id,attendance_date,session_code,standard_name,section_name,teacher_person_id,submitted_by,
  location_lat,location_lng,location_accuracy_m
 ) values (
  p_school_id,p_attendance_date,p_session_code,p_standard_name,p_section_name,p_teacher_person_id,(select auth.uid()),
  p_location_lat,p_location_lng,p_location_accuracy_m
 ) returning id into v_session_id;
 insert into public.school_attendance_marks(school_id,session_id,student_person_id,attendance_status)
 select p_school_id,v_session_id,m.student_person_id,m.attendance_status
 from jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text);
 return v_session_id;
end;
$function$;
revoke all on function public.submit_school_attendance(text,date,text,text,text,text,jsonb,double precision,double precision,double precision) from public;
grant execute on function public.submit_school_attendance(text,date,text,text,text,text,jsonb,double precision,double precision,double precision) to authenticated;
