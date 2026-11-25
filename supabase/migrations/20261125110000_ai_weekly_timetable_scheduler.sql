-- Weekly AI timetable planning, resource setup, fixed events and proxy substitution.
-- Existing manual timetable rows remain valid; new metadata is nullable/defaulted.

alter table public.school_academic_subjects
  drop constraint if exists school_academic_subjects_subject_type_check;
alter table public.school_academic_subjects
  add constraint school_academic_subjects_subject_type_check
  check (subject_type in ('Core','Language','Elective','Co-curricular','Practical / Lab'));

alter table public.school_academic_timetable
  add column if not exists room_id uuid,
  add column if not exists room_type text not null default 'classroom'
    check (room_type in ('classroom','computer_lab','chemistry_lab','physics_lab','biology_lab','library','auditorium','playground','other')),
  add column if not exists is_double_period boolean not null default false,
  add column if not exists double_group_id uuid,
  add column if not exists combined_group_key text,
  add column if not exists is_locked boolean not null default true,
  add column if not exists source text not null default 'manual' check(source in ('manual','ai')),
  add column if not exists generated_run_id uuid;

create table if not exists public.school_timetable_generation_runs (
 id uuid primary key default gen_random_uuid(),
 school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
 academic_year text not null,
 status text not null default 'generated' check(status in ('generated','published','archived')),
 algorithm text not null default 'backtracking-local-search',
 soft_score numeric(8,2) not null default 0,
 hard_violations integer not null default 0 check(hard_violations=0),
 summary jsonb not null default '{}'::jsonb,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(school_id,id)
);

create table if not exists public.school_timetable_periods (
 id uuid primary key default gen_random_uuid(),
 school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
 academic_year text not null,
 period_number smallint not null check(period_number between 1 and 12),
 period_label text not null,
 start_time time not null,
 end_time time not null,
 is_break boolean not null default false,
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 check(end_time>start_time),
 unique(school_id,academic_year,period_number),
 unique(school_id,id)
);

create table if not exists public.school_timetable_rooms (
 id uuid primary key default gen_random_uuid(),
 school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
 room_code text not null,
 room_name text not null,
 room_type text not null default 'classroom'
  check(room_type in ('classroom','computer_lab','chemistry_lab','physics_lab','biology_lab','library','auditorium','playground','other')),
 capacity integer not null default 40 check(capacity>0),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(school_id,room_code),
 unique(school_id,id)
);

alter table public.school_academic_timetable
 add constraint school_academic_timetable_room_fk
 foreign key(school_id,room_id) references public.school_timetable_rooms(school_id,id) on delete restrict;

create table if not exists public.school_subject_period_requirements (
 id uuid primary key default gen_random_uuid(),
 school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
 academic_year text not null,
 standard_name text not null,
 section_name text not null,
 subject_id uuid not null,
 weekly_periods smallint not null check(weekly_periods between 1 and 48),
 double_periods smallint not null default 0 check(double_periods>=0),
 room_type text not null default 'classroom'
  check(room_type in ('classroom','computer_lab','chemistry_lab','physics_lab','biology_lab','library','auditorium','playground','other')),
 cognitive_load text not null default 'normal' check(cognitive_load in ('heavy','normal','light')),
 is_active boolean not null default true,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 combined_group_key text,
 unique(school_id,academic_year,standard_name,section_name,subject_id),
 foreign key(school_id,subject_id) references public.school_academic_subjects(school_id,id) on delete cascade
);

create table if not exists public.school_teacher_workload_limits (
 id uuid primary key default gen_random_uuid(),
 school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
 teacher_person_id text not null,
 max_daily_periods smallint not null default 6 check(max_daily_periods between 1 and 12),
 max_weekly_periods smallint not null default 30 check(max_weekly_periods between 1 and 72),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(school_id,teacher_person_id),
 foreign key(school_id,teacher_person_id) references public.school_people(school_id,person_id) on delete cascade
);

create table if not exists public.school_timetable_fixed_blocks (
 id uuid primary key default gen_random_uuid(),
 school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
 academic_year text not null,
 standard_name text,
 section_name text,
 day_of_week smallint not null check(day_of_week between 1 and 6),
 period_number smallint not null check(period_number between 1 and 12),
 block_type text not null default 'fixed_event' check(block_type in ('assembly','break','lunch','pt','library','fixed_event','visiting_faculty')),
 label text not null,
 teacher_person_id text,
 room_id uuid,
 created_at timestamptz not null default now(),
 check(section_name is null or standard_name is not null),
 foreign key(school_id,room_id) references public.school_timetable_rooms(school_id,id) on delete set null (room_id),
 foreign key(school_id,teacher_person_id) references public.school_people(school_id,person_id) on delete set null (teacher_person_id)
);

create table if not exists public.school_timetable_teacher_absences (
 id uuid primary key default gen_random_uuid(),
 school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
 teacher_person_id text not null,
 absence_date date not null,
 reason text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(school_id,teacher_person_id,absence_date),
 foreign key(school_id,teacher_person_id) references public.school_people(school_id,person_id) on delete cascade
);

create table if not exists public.school_timetable_proxy_assignments (
 id uuid primary key default gen_random_uuid(),
 school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
 original_timetable_id uuid not null,
 replacement_date date not null,
 absent_teacher_person_id text not null,
 substitute_teacher_person_id text not null,
 standard_name text not null,
 section_name text not null,
 period_number smallint not null check(period_number between 1 and 12),
 status text not null default 'assigned' check(status in ('assigned','cancelled')),
 reason text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 unique(school_id,original_timetable_id,replacement_date),
 foreign key(school_id,original_timetable_id) references public.school_academic_timetable(school_id,id) on delete cascade,
 foreign key(school_id,absent_teacher_person_id) references public.school_people(school_id,person_id) on delete restrict,
 foreign key(school_id,substitute_teacher_person_id) references public.school_people(school_id,person_id) on delete restrict
);

alter table public.school_academic_timetable add constraint school_academic_timetable_generated_run_fk foreign key(school_id,generated_run_id) references public.school_timetable_generation_runs(school_id,id) on delete set null (generated_run_id);
create index if not exists school_timetable_generation_runs_lookup_idx on public.school_timetable_generation_runs(school_id,academic_year,created_at desc);
create index if not exists school_timetable_periods_lookup_idx on public.school_timetable_periods(school_id,academic_year,is_active,period_number);
create index if not exists school_timetable_rooms_lookup_idx on public.school_timetable_rooms(school_id,is_active,room_type);
create index if not exists school_subject_period_requirements_lookup_idx on public.school_subject_period_requirements(school_id,academic_year,standard_name,section_name,is_active);
create index if not exists school_teacher_workload_lookup_idx on public.school_teacher_workload_limits(school_id,teacher_person_id);
create index if not exists school_timetable_fixed_blocks_lookup_idx on public.school_timetable_fixed_blocks(school_id,academic_year,day_of_week,period_number);
create index if not exists school_timetable_teacher_absences_lookup_idx on public.school_timetable_teacher_absences(school_id,absence_date,teacher_person_id);
create index if not exists school_timetable_proxy_lookup_idx on public.school_timetable_proxy_assignments(school_id,replacement_date,substitute_teacher_person_id,status);
create index if not exists school_academic_timetable_room_slot_idx on public.school_academic_timetable(school_id,academic_year,day_of_week,period_number,room_id);
create index if not exists school_academic_timetable_combined_idx on public.school_academic_timetable(school_id,academic_year,combined_group_key);

do $rls$
declare t text;
begin
 foreach t in array array[
  'school_timetable_generation_runs','school_timetable_periods','school_timetable_rooms','school_subject_period_requirements',
  'school_teacher_workload_limits','school_timetable_fixed_blocks',
  'school_timetable_teacher_absences','school_timetable_proxy_assignments'
 ] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('grant select,insert,update,delete on public.%I to authenticated',t);
  execute format('drop policy if exists "School timetable managers access" on public.%I',t);
  execute format('create policy "School timetable managers access" on public.%I for all to authenticated using (
   exists(select 1 from public.school_tenants st where st.school_id=%I.school_id and st.admin_user_id=(select auth.uid()))
   or exists(select 1 from public.school_user_roles ur where ur.school_id=%I.school_id and ur.user_id=(select auth.uid()) and ur.status=''active'' and ur.role<>''Teacher'' and ''Timetable''=any(ur.allowed_pages))
  ) with check (
   exists(select 1 from public.school_tenants st where st.school_id=%I.school_id and st.admin_user_id=(select auth.uid()))
   or exists(select 1 from public.school_user_roles ur where ur.school_id=%I.school_id and ur.user_id=(select auth.uid()) and ur.status=''active'' and ur.role<>''Teacher'' and ''Timetable''=any(ur.allowed_pages))
  )',t,t,t,t,t);
 end loop;
end;
$rls$;

create or replace function private.enforce_school_timetable_rules()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare
 v_subject_name text; v_valid_teacher boolean; v_conflict boolean;
 v_room_capacity integer; v_student_count integer;
 v_max_daily integer; v_max_weekly integer; v_daily_used integer; v_weekly_used integer;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.school_id||':'||new.academic_year||':'||new.day_of_week::text,0));
 select s.subject_name into v_subject_name from public.school_academic_subjects s
 where s.school_id=new.school_id and s.id=new.subject_id and s.academic_year=new.academic_year and s.standard_name=new.standard_name and s.is_active;
 if v_subject_name is null then raise exception 'Select an active subject for this standard and academic year'; end if;
 if new.teacher_person_id is not null then
  select exists(select 1 from public.school_people p join public.school_teacher_class_assignments a
   on a.school_id=p.school_id and a.teacher_person_id=p.person_id
   where p.school_id=new.school_id and p.person_id=new.teacher_person_id and p.record_type='Teacher'
    and a.is_active and a.standard_name=new.standard_name and a.section_name=new.section_name
    and (a.subject_name is null or a.subject_name=v_subject_name)) into v_valid_teacher;
  if not v_valid_teacher then raise exception 'The selected teacher is not actively allotted to this class, section and subject'; end if;
 end if;
 select exists(select 1 from public.school_academic_timetable t
  where t.school_id=new.school_id and t.academic_year=new.academic_year and t.standard_name=new.standard_name
   and t.section_name=new.section_name and t.day_of_week=new.day_of_week and t.id is distinct from new.id
   and new.start_time<t.end_time and new.end_time>t.start_time) into v_conflict;
 if v_conflict then raise exception 'This class already has a timetable period during that time'; end if;
 if exists(select 1 from public.school_timetable_fixed_blocks b
  where b.school_id=new.school_id and b.academic_year=new.academic_year
   and b.day_of_week=new.day_of_week and b.period_number=new.period_number
   and ((b.standard_name is not null and b.standard_name=new.standard_name and (b.section_name is null or b.section_name=new.section_name))
     or (b.standard_name is null and b.teacher_person_id is null and b.room_id is null)
     or (b.teacher_person_id is not null and b.teacher_person_id=new.teacher_person_id)
     or (b.room_id is not null and b.room_id=new.room_id))) then
  raise exception 'This timetable period is reserved by a fixed school event or resource block';
 end if;
 if new.teacher_person_id is not null then
  select exists(select 1 from public.school_academic_timetable t
   where t.school_id=new.school_id and t.academic_year=new.academic_year and t.teacher_person_id=new.teacher_person_id
    and t.day_of_week=new.day_of_week and t.id is distinct from new.id and new.start_time<t.end_time and new.end_time>t.start_time
    and not (new.combined_group_key is not null and t.combined_group_key=new.combined_group_key
      and t.subject_id=new.subject_id and t.start_time=new.start_time and t.end_time=new.end_time)) into v_conflict;
  if v_conflict then raise exception 'This teacher is already scheduled during that time'; end if;
  select coalesce((select l.max_daily_periods from public.school_teacher_workload_limits l
    where l.school_id=new.school_id and l.teacher_person_id=new.teacher_person_id),6) into v_max_daily;
  select coalesce((select l.max_weekly_periods from public.school_teacher_workload_limits l
    where l.school_id=new.school_id and l.teacher_person_id=new.teacher_person_id),30) into v_max_weekly;
  select count(distinct t.period_number) into v_daily_used from public.school_academic_timetable t
   where t.school_id=new.school_id and t.academic_year=new.academic_year and t.teacher_person_id=new.teacher_person_id
    and t.day_of_week=new.day_of_week and t.id is distinct from new.id;
  select count(distinct (t.day_of_week,t.period_number)) into v_weekly_used from public.school_academic_timetable t
   where t.school_id=new.school_id and t.academic_year=new.academic_year and t.teacher_person_id=new.teacher_person_id
    and t.id is distinct from new.id;
  if v_daily_used>=v_max_daily then raise exception 'Teacher daily workload limit exceeded'; end if;
  if v_weekly_used>=v_max_weekly then raise exception 'Teacher weekly workload limit exceeded'; end if;
 end if;
 if new.room_id is not null then
  select r.capacity into v_room_capacity from public.school_timetable_rooms r
   where r.school_id=new.school_id and r.id=new.room_id and r.is_active and r.room_type=new.room_type;
  if v_room_capacity is null then raise exception 'Selected room is inactive or its room type does not match this lesson'; end if;
  select count(*) into v_student_count from public.school_people p
   where p.school_id=new.school_id and p.record_type='Student'
    and p.details->>'joining_standard'=new.standard_name and coalesce(p.details->>'section','')=new.section_name;
  if v_student_count>v_room_capacity then raise exception 'Selected room capacity is below the current section strength'; end if;
  select exists(select 1 from public.school_academic_timetable t
   where t.school_id=new.school_id and t.academic_year=new.academic_year and t.room_id=new.room_id
    and t.day_of_week=new.day_of_week and t.id is distinct from new.id
    and new.start_time<t.end_time and new.end_time>t.start_time
    and not (new.combined_group_key is not null and t.combined_group_key=new.combined_group_key
      and t.subject_id=new.subject_id and t.start_time=new.start_time and t.end_time=new.end_time)) into v_conflict;
  if v_conflict then raise exception 'This room is already allocated during that time'; end if;
 end if;
 if exists(select 1 from public.school_subject_period_requirements q
  where q.school_id=new.school_id and q.academic_year=new.academic_year and q.standard_name=new.standard_name
   and q.section_name=new.section_name and q.subject_id=new.subject_id and q.is_active
   and q.room_type<>'classroom' and (new.room_id is null or q.room_type<>new.room_type)) then
  raise exception 'This subject requires its configured specialist room';
 end if;
 return new;
end;
$function$;
revoke all on function private.enforce_school_timetable_rules() from public, anon, authenticated;
drop trigger if exists enforce_school_timetable_rules on public.school_academic_timetable;
create trigger enforce_school_timetable_rules before insert or update on public.school_academic_timetable for each row execute function private.enforce_school_timetable_rules();

create or replace function public.publish_school_timetable_run(p_school_id text,p_run_id uuid)
returns void language plpgsql security invoker set search_path=''
as $function$
declare v_req record; v_count integer; v_doubles integer;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.school_tenants t where t.school_id=p_school_id and t.admin_user_id=(select auth.uid()))
 and not exists(select 1 from public.school_user_roles r where r.school_id=p_school_id and r.user_id=(select auth.uid())
  and r.status='active' and r.role<>'Teacher' and 'Timetable'=any(r.allowed_pages)) then
  raise exception 'You are not authorized to publish this timetable';
 end if;
 if not exists(select 1 from public.school_timetable_generation_runs r where r.school_id=p_school_id and r.id=p_run_id and r.status='generated') then
  raise exception 'Only a generated draft timetable can be published';
 end if;
 for v_req in select q.* from public.school_subject_period_requirements q
  join public.school_timetable_generation_runs r on r.school_id=q.school_id and r.academic_year=q.academic_year
  where r.school_id=p_school_id and r.id=p_run_id and q.is_active
 loop
  select count(*) into v_count from public.school_academic_timetable t
   where t.school_id=p_school_id and t.academic_year=v_req.academic_year
    and t.standard_name=v_req.standard_name and t.section_name=v_req.section_name and t.subject_id=v_req.subject_id;
  if v_count<>v_req.weekly_periods then
   raise exception 'Exact weekly quota mismatch for % / % / %: expected %, found %',
    v_req.standard_name,v_req.section_name,
    (select s.subject_name from public.school_academic_subjects s where s.school_id=p_school_id and s.id=v_req.subject_id),
    v_req.weekly_periods,v_count;
  end if;
  select count(distinct t.double_group_id) into v_doubles from public.school_academic_timetable t
   where t.school_id=p_school_id and t.academic_year=v_req.academic_year
    and t.standard_name=v_req.standard_name and t.section_name=v_req.section_name
    and t.subject_id=v_req.subject_id and t.is_double_period and t.double_group_id is not null;
  if v_doubles<>v_req.double_periods then
   raise exception 'Double-period quota mismatch for % %: expected %, found %',
    v_req.standard_name,v_req.section_name,v_req.double_periods,v_doubles;
  end if;
 end loop;
 update public.school_academic_timetable set is_locked=true
  where school_id=p_school_id and generated_run_id=p_run_id and source='ai';
 update public.school_timetable_generation_runs set status='published'
  where school_id=p_school_id and id=p_run_id;
end;
$function$;
revoke all on function public.publish_school_timetable_run(text,uuid) from public,anon;
grant execute on function public.publish_school_timetable_run(text,uuid) to authenticated;

create or replace function public.assign_school_timetable_proxy(
 p_school_id text,p_original_timetable_id uuid,p_replacement_date date,
 p_substitute_teacher_person_id text,p_reason text default null
) returns uuid language plpgsql security invoker set search_path=''
as $function$
declare
 v_slot public.school_academic_timetable%rowtype; v_absent text;
 v_max_daily integer; v_used integer; v_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.school_tenants t where t.school_id=p_school_id and t.admin_user_id=(select auth.uid()))
 and not exists(select 1 from public.school_user_roles r where r.school_id=p_school_id and r.user_id=(select auth.uid())
   and r.status='active' and r.role<>'Teacher' and 'Timetable'=any(r.allowed_pages)) then
  raise exception 'You are not authorized to assign proxy teachers';
 end if;
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(p_school_id||':'||p_substitute_teacher_person_id||':'||p_replacement_date::text,0));
 select * into v_slot from public.school_academic_timetable t
 where t.school_id=p_school_id and t.id=p_original_timetable_id;
 if not found then raise exception 'Timetable lesson not found'; end if;
 select a.teacher_person_id into v_absent from public.school_timetable_teacher_absences a
 where a.school_id=p_school_id and a.teacher_person_id=v_slot.teacher_person_id and a.absence_date=p_replacement_date;
 if v_absent is null then raise exception 'Mark the original teacher absent before assigning a proxy'; end if;
 if p_substitute_teacher_person_id=v_absent then raise exception 'Absent teacher cannot substitute their own lesson'; end if;
 if exists(select 1 from public.school_timetable_teacher_absences a
  where a.school_id=p_school_id and a.teacher_person_id=p_substitute_teacher_person_id and a.absence_date=p_replacement_date) then
  raise exception 'A teacher marked absent cannot be selected as a proxy';
 end if;
 if not exists(select 1 from public.school_people p where p.school_id=p_school_id and p.person_id=p_substitute_teacher_person_id and p.record_type='Teacher') then
  raise exception 'Selected proxy person is not an active teacher profile';
 end if;
 if not exists(select 1 from public.school_teacher_class_assignments a
  where a.school_id=p_school_id and a.teacher_person_id=p_substitute_teacher_person_id
   and a.standard_name=v_slot.standard_name and a.section_name=v_slot.section_name and a.is_active) then
  raise exception 'Proxy teacher must already be assigned to this standard and section';
 end if;
 if exists(select 1 from public.school_academic_timetable t
  where t.school_id=p_school_id and t.academic_year=v_slot.academic_year and t.teacher_person_id=p_substitute_teacher_person_id
   and t.day_of_week=extract(isodow from p_replacement_date)::integer and t.id<>v_slot.id
   and t.start_time<v_slot.end_time and t.end_time>v_slot.start_time) then
  raise exception 'Selected proxy teacher is already occupied in this period';
 end if;
 if exists(select 1 from public.school_timetable_proxy_assignments p
  join public.school_academic_timetable original_slot on original_slot.school_id=p.school_id and original_slot.id=p.original_timetable_id
  where p.school_id=p_school_id and p.replacement_date=p_replacement_date
   and p.substitute_teacher_person_id=p_substitute_teacher_person_id and p.status='assigned'
   and original_slot.start_time<v_slot.end_time and original_slot.end_time>v_slot.start_time) then
  raise exception 'Selected proxy teacher already has another proxy assignment in this period';
 end if;
 select coalesce((select l.max_daily_periods from public.school_teacher_workload_limits l
  where l.school_id=p_school_id and l.teacher_person_id=p_substitute_teacher_person_id),6) into v_max_daily;
 select count(distinct t.period_number) into v_used from public.school_academic_timetable t
 where t.school_id=p_school_id and t.academic_year=v_slot.academic_year
  and t.teacher_person_id=p_substitute_teacher_person_id and t.day_of_week=extract(isodow from p_replacement_date)::integer;
 v_used:=v_used+(select count(distinct p.period_number) from public.school_timetable_proxy_assignments p
  where p.school_id=p_school_id and p.replacement_date=p_replacement_date
   and p.substitute_teacher_person_id=p_substitute_teacher_person_id and p.status='assigned');
 if v_used>=v_max_daily then raise exception 'Proxy teacher daily period limit would be exceeded'; end if;
 insert into public.school_timetable_proxy_assignments(
  school_id,original_timetable_id,replacement_date,absent_teacher_person_id,substitute_teacher_person_id,
  standard_name,section_name,period_number,reason,created_by
 ) values(p_school_id,p_original_timetable_id,p_replacement_date,v_absent,p_substitute_teacher_person_id,
  v_slot.standard_name,v_slot.section_name,v_slot.period_number,nullif(btrim(p_reason),''),(select auth.uid()))
 returning id into v_id;
 return v_id;
end;
$function$;
revoke all on function public.assign_school_timetable_proxy(text,uuid,date,text,text) from public,anon;
grant execute on function public.assign_school_timetable_proxy(text,uuid,date,text,text) to authenticated;

