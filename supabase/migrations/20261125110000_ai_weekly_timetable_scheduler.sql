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
  add column if not exists combined_group_key text;

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
 foreign key(school_id,room_id) references public.school_timetable_rooms(school_id,id) on delete set null,
 foreign key(school_id,teacher_person_id) references public.school_people(school_id,person_id) on delete set null
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
  'school_timetable_periods','school_timetable_rooms','school_subject_period_requirements',
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
declare v_subject_name text; v_valid_teacher boolean; v_conflict boolean;
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
 if new.teacher_person_id is not null then
  select exists(select 1 from public.school_academic_timetable t
   where t.school_id=new.school_id and t.academic_year=new.academic_year and t.teacher_person_id=new.teacher_person_id
    and t.day_of_week=new.day_of_week and t.id is distinct from new.id and new.start_time<t.end_time and new.end_time>t.start_time
    and not (new.combined_group_key is not null and t.combined_group_key=new.combined_group_key
      and t.subject_id=new.subject_id and t.start_time=new.start_time and t.end_time=new.end_time)) into v_conflict;
  if v_conflict then raise exception 'This teacher is already scheduled during that time'; end if;
 end if;
 if new.room_id is not null then
  select exists(select 1 from public.school_academic_timetable t
   where t.school_id=new.school_id and t.academic_year=new.academic_year and t.room_id=new.room_id
    and t.day_of_week=new.day_of_week and t.id is distinct from new.id
    and new.start_time<t.end_time and new.end_time>t.start_time
    and not (new.combined_group_key is not null and t.combined_group_key=new.combined_group_key
      and t.subject_id=new.subject_id and t.start_time=new.start_time and t.end_time=new.end_time)) into v_conflict;
  if v_conflict then raise exception 'This room is already allocated during that time'; end if;
 end if;
 return new;
end;
$function$;

create or replace function public.assign_school_timetable_proxy(
 p_school_id text,p_original_timetable_id uuid,p_replacement_date date,
 p_substitute_teacher_person_id text,p_reason text default null
) returns uuid language plpgsql security invoker set search_path=''
as $function$
declare v_slot public.school_academic_timetable%rowtype; v_absent text; v_max_daily integer; v_used integer; v_id uuid;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.school_tenants t where t.school_id=p_school_id and t.admin_user_id=(select auth.uid()))
 and not exists(select 1 from public.school_user_roles r where r.school_id=p_school_id and r.user_id=(select auth.uid())
   and r.status='active' and r.role<>'Teacher' and 'Timetable'=any(r.allowed_pages)) then
  raise exception 'You are not authorized to assign proxy teachers';
 end if;
 select * into v_slot from public.school_academic_timetable t
 where t.school_id=p_school_id and t.id=p_original_timetable_id;
 if not found then raise exception 'Timetable lesson not found'; end if;
 select a.teacher_person_id into v_absent from public.school_timetable_teacher_absences a
 where a.school_id=p_school_id and a.teacher_person_id=v_slot.teacher_person_id and a.absence_date=p_replacement_date;
 if v_absent is null then raise exception 'Mark the original teacher absent before assigning a proxy'; end if;
 if p_substitute_teacher_person_id=v_absent then raise exception 'Absent teacher cannot substitute their own lesson'; end if;
 if not exists(select 1 from public.school_teacher_class_assignments a
  where a.school_id=p_school_id and a.teacher_person_id=p_substitute_teacher_person_id and a.standard_name=v_slot.standard_name
   and a.section_name=v_slot.section_name and a.is_active) then
  raise exception 'Proxy teacher must already be assigned to this standard and section';
 end if;
 if exists(select 1 from public.school_academic_timetable t
  where t.school_id=p_school_id and t.academic_year=v_slot.academic_year and t.teacher_person_id=p_substitute_teacher_person_id
   and t.day_of_week=extract(isodow from p_replacement_date)::integer and t.id<>v_slot.id
   and t.start_time<v_slot.end_time and t.end_time>v_slot.start_time) then
  raise exception 'Selected proxy teacher is already occupied in this period';
 end if;
 if exists(select 1 from public.school_timetable_proxy_assignments p
  where p.school_id=p_school_id and p.replacement_date=p_replacement_date
   and p.substitute_teacher_person_id=p_substitute_teacher_person_id and p.status='assigned'
   and p.period_number=v_slot.period_number) then
  raise exception 'Selected proxy teacher already has another proxy assignment in this period';
 end if;
 select coalesce(l.max_daily_periods,6) into v_max_daily from public.school_teacher_workload_limits l
 where l.school_id=p_school_id and l.teacher_person_id=p_substitute_teacher_person_id;
 v_max_daily:=coalesce(v_max_daily,6);
 select count(*) into v_used from public.school_academic_timetable t
 where t.school_id=p_school_id and t.academic_year=v_slot.academic_year
  and t.teacher_person_id=p_substitute_teacher_person_id and t.day_of_week=extract(isodow from p_replacement_date)::integer;
 select v_used+count(*) into v_used from public.school_timetable_proxy_assignments p
 where p.school_id=p_school_id and p.replacement_date=p_replacement_date
  and p.substitute_teacher_person_id=p_substitute_teacher_person_id and p.status='assigned';
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

