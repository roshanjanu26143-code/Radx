create table if not exists public.school_teacher_attendance_credentials (
 school_id text not null,
 teacher_person_id text not null,
 password_salt text not null,
 password_hash text not null,
 failed_attempts integer not null default 0 check (failed_attempts between 0 and 5),
 locked_until timestamptz,
 updated_at timestamptz not null default now(),
 primary key (school_id,teacher_person_id),
 foreign key (school_id) references public.school_tenants(school_id) on update cascade on delete cascade,
 foreign key (school_id,teacher_person_id) references public.school_people(school_id,person_id) on update cascade on delete cascade
);
alter table public.school_teacher_attendance_credentials enable row level security;
revoke all on public.school_teacher_attendance_credentials from anon,authenticated;
grant all on public.school_teacher_attendance_credentials to service_role;

alter table public.school_teacher_attendance alter column checked_in_by drop not null;
alter table public.school_attendance_sessions alter column submitted_by drop not null;

create or replace function public.submit_school_attendance_qr(
 p_school_id text,p_attendance_date date,p_session_code text,p_standard_name text,
 p_section_name text,p_teacher_person_id text,p_marks jsonb,
 p_location_lat double precision default null,p_location_lng double precision default null,
 p_location_accuracy_m double precision default null
) returns uuid
language plpgsql security invoker set search_path=''
as $function$
declare v_session_id uuid; v_mark_count integer; v_student_count integer;
begin
 if p_session_code not in ('MORNING','AFTERNOON') then raise exception 'Invalid attendance session'; end if;
 if not exists (
  select 1 from public.school_teacher_attendance t
  join public.school_teacher_class_assignments a
   on a.school_id=t.school_id and a.teacher_person_id=t.teacher_person_id
   and a.standard_name=t.checked_in_for_standard and a.section_name=t.checked_in_for_section
  where t.school_id=p_school_id and t.attendance_date=p_attendance_date
   and t.session_code=p_session_code and t.teacher_person_id=p_teacher_person_id
   and t.checked_in_for_standard=p_standard_name and t.checked_in_for_section=p_section_name
   and t.attendance_status='PRESENT' and a.is_active
 ) then raise exception 'Teacher check-in is required before submitting student attendance'; end if;
 if not exists (
  select 1 from public.school_people p where p.school_id=p_school_id
   and p.person_id=p_teacher_person_id and p.record_type='Teacher'
 ) then raise exception 'Teacher record not found'; end if;
 if p_marks is null or jsonb_typeof(p_marks)<>'array' or jsonb_array_length(p_marks)=0 then raise exception 'Attendance marks are required'; end if;
 select count(*) into v_mark_count from jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text);
 if v_mark_count<>jsonb_array_length(p_marks) then raise exception 'Invalid attendance payload'; end if;
 if exists(select 1 from jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text)
  where m.student_person_id is null or m.attendance_status not in ('PRESENT','ABSENT')) then raise exception 'Invalid student attendance status'; end if;
 select count(*) into v_student_count
 from public.school_people p
 join jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text)
  on m.student_person_id=p.person_id
 where p.school_id=p_school_id and p.record_type='Student'
  and p.details->>'joining_standard'=p_standard_name
  and p.details->>'section'=p_section_name;
 if v_student_count<>v_mark_count then raise exception 'One or more students do not belong to this standard and section'; end if;
 insert into public.school_attendance_sessions(
  school_id,attendance_date,session_code,standard_name,section_name,teacher_person_id,submitted_by,
  location_lat,location_lng,location_accuracy_m
 ) values (
  p_school_id,p_attendance_date,p_session_code,p_standard_name,p_section_name,p_teacher_person_id,null,
  p_location_lat,p_location_lng,p_location_accuracy_m
 ) returning id into v_session_id;
 insert into public.school_attendance_marks(school_id,session_id,student_person_id,attendance_status)
 select p_school_id,v_session_id,m.student_person_id,m.attendance_status
 from jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text);
 return v_session_id;
end;
$function$;
revoke all on function public.submit_school_attendance_qr(text,date,text,text,text,text,jsonb,double precision,double precision,double precision) from public,anon,authenticated;
grant execute on function public.submit_school_attendance_qr(text,date,text,text,text,text,jsonb,double precision,double precision,double precision) to service_role;
