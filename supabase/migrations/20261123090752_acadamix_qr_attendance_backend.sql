-- Applied to Supabase project rofbsjdsxqwbccnoyvyp.
create table if not exists public.school_classroom_qr (
 id uuid primary key default gen_random_uuid(), school_id text not null references public.school_tenants(school_id) on delete cascade,
 standard_name text not null check(length(btrim(standard_name))>0), qr_token uuid not null default gen_random_uuid(),
 is_active boolean not null default true, created_at timestamptz not null default now(),
 unique(school_id,standard_name), unique(qr_token)
);
create table if not exists public.school_attendance_sessions (
 id uuid primary key default gen_random_uuid(), school_id text not null references public.school_tenants(school_id) on delete cascade,
 attendance_date date not null, session_code text not null check(session_code in ('MORNING','AFTERNOON')),
 standard_name text not null, section_name text not null, teacher_person_id text not null,
 submitted_by uuid not null default auth.uid(), location_lat double precision, location_lng double precision,
 location_accuracy_m double precision, submitted_at timestamptz not null default now(),
 unique(school_id,attendance_date,session_code,standard_name,section_name), unique(id,school_id),
 foreign key(school_id,teacher_person_id) references public.school_people(school_id,person_id)
);
create table if not exists public.school_attendance_marks (
 id uuid primary key default gen_random_uuid(), school_id text not null, session_id uuid not null,
 student_person_id text not null, attendance_status text not null check(attendance_status in ('PRESENT','ABSENT')),
 created_at timestamptz not null default now(), unique(session_id,student_person_id),
 foreign key(session_id,school_id) references public.school_attendance_sessions(id,school_id) on delete cascade,
 foreign key(school_id,student_person_id) references public.school_people(school_id,person_id)
);
create index if not exists school_attendance_sessions_school_date_idx on public.school_attendance_sessions(school_id,attendance_date desc);
create index if not exists school_attendance_marks_school_student_idx on public.school_attendance_marks(school_id,student_person_id);
alter table public.school_classroom_qr enable row level security;
alter table public.school_attendance_sessions enable row level security;
alter table public.school_attendance_marks enable row level security;
create policy "School admins manage classroom QR" on public.school_classroom_qr for all to authenticated
using(exists(select 1 from public.school_tenants t where t.school_id=school_classroom_qr.school_id and t.admin_user_id=(select auth.uid())))
with check(exists(select 1 from public.school_tenants t where t.school_id=school_classroom_qr.school_id and t.admin_user_id=(select auth.uid())));
create policy "School admins read attendance sessions" on public.school_attendance_sessions for select to authenticated
using(exists(select 1 from public.school_tenants t where t.school_id=school_attendance_sessions.school_id and t.admin_user_id=(select auth.uid())));
create policy "School admins insert attendance sessions" on public.school_attendance_sessions for insert to authenticated
with check(submitted_by=(select auth.uid()) and exists(select 1 from public.school_tenants t where t.school_id=school_attendance_sessions.school_id and t.admin_user_id=(select auth.uid())));
create policy "School admins read attendance marks" on public.school_attendance_marks for select to authenticated
using(exists(select 1 from public.school_tenants t where t.school_id=school_attendance_marks.school_id and t.admin_user_id=(select auth.uid())));
create policy "School admins insert attendance marks" on public.school_attendance_marks for insert to authenticated
with check(exists(select 1 from public.school_tenants t where t.school_id=school_attendance_marks.school_id and t.admin_user_id=(select auth.uid())));
create or replace function public.submit_school_attendance(
 p_school_id text,p_attendance_date date,p_session_code text,p_standard_name text,p_section_name text,p_teacher_person_id text,
 p_marks jsonb,p_location_lat double precision default null,p_location_lng double precision default null,p_location_accuracy_m double precision default null
) returns uuid language plpgsql set search_path='' as $$
declare v_session_id uuid; v_mark_count integer; v_student_count integer;
begin
 if auth.uid() is null or not exists(select 1 from public.school_tenants t where t.school_id=p_school_id and t.admin_user_id=auth.uid()) then raise exception 'Not authorized for this school'; end if;
 if p_session_code not in ('MORNING','AFTERNOON') then raise exception 'Invalid attendance session'; end if;
 if jsonb_typeof(p_marks)<>'array' or jsonb_array_length(p_marks)=0 then raise exception 'Attendance marks are required'; end if;
 if not exists(select 1 from public.school_people p where p.school_id=p_school_id and p.person_id=p_teacher_person_id and p.record_type='Teacher') then raise exception 'Teacher record not found for this school'; end if;
 select count(*) into v_mark_count from jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text);
 if v_mark_count<>jsonb_array_length(p_marks) then raise exception 'Invalid attendance payload'; end if;
 if exists(select 1 from jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text) where m.student_person_id is null or m.attendance_status not in ('PRESENT','ABSENT')) then raise exception 'Invalid student attendance status'; end if;
 select count(*) into v_student_count from public.school_people p join jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text) on m.student_person_id=p.person_id
 where p.school_id=p_school_id and p.record_type='Student' and p.details->>'joining_standard'=p_standard_name and p.details->>'section'=p_section_name;
 if v_student_count<>v_mark_count then raise exception 'One or more students do not belong to this standard and section'; end if;
 insert into public.school_attendance_sessions(school_id,attendance_date,session_code,standard_name,section_name,teacher_person_id,submitted_by,location_lat,location_lng,location_accuracy_m)
 values(p_school_id,p_attendance_date,p_session_code,p_standard_name,p_section_name,p_teacher_person_id,auth.uid(),p_location_lat,p_location_lng,p_location_accuracy_m) returning id into v_session_id;
 insert into public.school_attendance_marks(school_id,session_id,student_person_id,attendance_status)
 select p_school_id,v_session_id,m.student_person_id,m.attendance_status from jsonb_to_recordset(p_marks) as m(student_person_id text,attendance_status text);
 return v_session_id;
end; $$;
revoke all on function public.submit_school_attendance(text,date,text,text,text,text,jsonb,double precision,double precision,double precision) from public;
grant execute on function public.submit_school_attendance(text,date,text,text,text,text,jsonb,double precision,double precision,double precision) to authenticated;
grant select,insert,update,delete on public.school_classroom_qr to authenticated;
grant select,insert on public.school_attendance_sessions to authenticated;
grant select,insert on public.school_attendance_marks to authenticated;
