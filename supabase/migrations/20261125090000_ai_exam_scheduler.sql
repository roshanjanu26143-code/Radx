-- AI Exam Scheduler: room registry, plan versions, room/invigilator allocations.
alter table public.school_exam_schedules add column if not exists duration_minutes integer not null default 180 check (duration_minutes between 15 and 600);
alter table public.school_exam_schedules add column if not exists is_ai_locked boolean not null default false;

create table if not exists public.school_exam_rooms (
  id uuid primary key default gen_random_uuid(),
  school_id text not null,
  room_name text not null,
  room_type text not null default 'classroom' check (room_type in ('classroom','lab','computer_lab')),
  capacity integer not null check (capacity > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (school_id, room_name)
);
create table if not exists public.school_exam_plan_runs (
  id uuid primary key default gen_random_uuid(),
  school_id text not null,
  academic_year text not null,
  exam_name text not null,
  status text not null default 'draft' check (status in ('draft','published','archived')),
  solver text not null default 'DSATUR + capacity-aware room packing',
  score jsonb not null default '{}'::jsonb,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  published_at timestamptz
);
create table if not exists public.school_exam_plan_allocations (
  id uuid primary key default gen_random_uuid(),
  school_id text not null,
  plan_run_id uuid not null references public.school_exam_plan_runs(id) on delete cascade,
  exam_schedule_id uuid not null references public.school_exam_schedules(id) on delete cascade,
  exam_date date not null,
  start_time time not null,
  end_time time not null,
  room_id uuid not null references public.school_exam_rooms(id),
  invigilator_person_id text not null,
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);
create index if not exists school_exam_rooms_school_active_idx on public.school_exam_rooms(school_id,is_active);
create index if not exists school_exam_plan_runs_school_year_idx on public.school_exam_plan_runs(school_id,academic_year,exam_name,created_at desc);
create index if not exists school_exam_plan_allocations_run_idx on public.school_exam_plan_allocations(school_id,plan_run_id);
create index if not exists school_exam_plan_allocations_slot_idx on public.school_exam_plan_allocations(school_id,exam_date,start_time,end_time);
alter table public.school_exam_rooms enable row level security;
alter table public.school_exam_plan_runs enable row level security;
alter table public.school_exam_plan_allocations enable row level security;
grant select,insert,update,delete on public.school_exam_rooms to authenticated;
grant select,insert,update,delete on public.school_exam_plan_runs to authenticated;
grant select,insert,update,delete on public.school_exam_plan_allocations to authenticated;

drop policy if exists "Exam managers manage exam rooms" on public.school_exam_rooms;
drop policy if exists "Exam managers read exam rooms" on public.school_exam_rooms;
create policy "Exam managers manage exam rooms" on public.school_exam_rooms for all to authenticated
using (private.can_manage_exam_schedule(school_exam_rooms.school_id))
with check (private.can_manage_exam_schedule(school_exam_rooms.school_id));

drop policy if exists "Exam managers manage exam plan runs" on public.school_exam_plan_runs;
drop policy if exists "Exam managers read exam plan runs" on public.school_exam_plan_runs;
create policy "Exam managers manage exam plan runs" on public.school_exam_plan_runs for all to authenticated
using (private.can_manage_exam_schedule(school_exam_plan_runs.school_id) and status = 'draft')
with check (private.can_manage_exam_schedule(school_exam_plan_runs.school_id));
create policy "Exam managers read exam plan runs" on public.school_exam_plan_runs for select to authenticated
using (private.can_manage_exam_schedule(school_exam_plan_runs.school_id));

drop policy if exists "Exam managers manage draft allocations" on public.school_exam_plan_allocations;
drop policy if exists "Exam managers read allocations" on public.school_exam_plan_allocations;
create policy "Exam managers manage draft allocations" on public.school_exam_plan_allocations for all to authenticated
using (private.can_manage_exam_schedule(school_exam_plan_allocations.school_id) and exists (
  select 1 from public.school_exam_plan_runs r
  where r.id = school_exam_plan_allocations.plan_run_id
    and r.school_id = school_exam_plan_allocations.school_id and r.status = 'draft'
))
with check (private.can_manage_exam_schedule(school_exam_plan_allocations.school_id) and exists (
  select 1 from public.school_exam_plan_runs r
  where r.id = school_exam_plan_allocations.plan_run_id
    and r.school_id = school_exam_plan_allocations.school_id and r.status = 'draft'
));
create policy "Exam managers read allocations" on public.school_exam_plan_allocations for select to authenticated
using (private.can_manage_exam_schedule(school_exam_plan_allocations.school_id));

create or replace function public.save_school_ai_exam_plan(
  p_school_id text,p_academic_year text,p_exam_name text,p_allocations jsonb,p_score jsonb default '{}'::jsonb
) returns uuid
language plpgsql security invoker set search_path = public, private
as $$
declare
  v_run_id uuid;
  v_expected integer;
  v_allocated integer;
begin
  if not private.can_manage_exam_schedule(p_school_id) then
    raise exception 'You do not have permission to generate exam schedules for this school.';
  end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations) = 0 then
    raise exception 'No exam allocations were supplied.';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_allocations) x
    left join public.school_exam_schedules e on e.id=(x->>'exam_schedule_id')::uuid
    where e.id is null or e.school_id<>p_school_id or e.academic_year<>p_academic_year or e.exam_name<>p_exam_name
  ) then raise exception 'An exam allocation belongs to another school or examination.'; end if;

  insert into public.school_exam_plan_runs(school_id,academic_year,exam_name,score,created_by)
  values(p_school_id,p_academic_year,p_exam_name,coalesce(p_score,'{}'::jsonb),auth.uid())
  returning id into v_run_id;

  insert into public.school_exam_plan_allocations(school_id,plan_run_id,exam_schedule_id,exam_date,start_time,end_time,room_id,invigilator_person_id)
  select p_school_id,v_run_id,(x->>'exam_schedule_id')::uuid,(x->>'exam_date')::date,
    (x->>'start_time')::time,(x->>'end_time')::time,(x->>'room_id')::uuid,x->>'invigilator_person_id'
  from jsonb_array_elements(p_allocations) x;

  if exists (
    select 1 from public.school_exam_plan_allocations a
    join public.school_exam_schedules e on e.id=a.exam_schedule_id and e.school_id=a.school_id
    where a.plan_run_id=v_run_id and (e.is_ai_locked or e.is_published)
      and (a.exam_date<>e.exam_date or a.start_time<>e.start_time or a.end_time<>e.end_time)
  ) then raise exception 'A manually locked exam slot cannot be changed by the AI scheduler.'; end if;

  select count(*) into v_expected from public.school_exam_schedules e
  where e.school_id=p_school_id and e.academic_year=p_academic_year and e.exam_name=p_exam_name;
  select count(distinct exam_schedule_id) into v_allocated from public.school_exam_plan_allocations a where a.plan_run_id=v_run_id;
  if v_expected=0 or v_allocated<>v_expected then
    raise exception 'Every subject exam in this examination must receive a room allocation.';
  end if;

  if exists (
    select 1 from public.school_exam_plan_allocations a
    left join public.school_exam_rooms r on r.id=a.room_id and r.school_id=a.school_id
    where a.plan_run_id=v_run_id and (r.id is null or not r.is_active)
  ) then raise exception 'A selected room is missing, belongs to another school, or is inactive.'; end if;

  if exists (
    select 1 from public.school_exam_plan_allocations a
    join public.school_exam_schedules e on e.id=a.exam_schedule_id and e.school_id=a.school_id
    join public.school_exam_rooms r on r.id=a.room_id and r.school_id=a.school_id
    where a.plan_run_id=v_run_id and (
        (select lower(coalesce(s.subject_type,'')) from public.school_academic_subjects s
         where s.school_id=e.school_id and s.academic_year=e.academic_year
           and s.standard_name=e.standard_name and s.subject_name=e.subject_name limit 1) like '%lab%'
        or
        (select lower(coalesce(s.subject_type,'')) from public.school_academic_subjects s
         where s.school_id=e.school_id and s.academic_year=e.academic_year
           and s.standard_name=e.standard_name and s.subject_name=e.subject_name limit 1) like '%practical%'
      ) and r.room_type not in ('lab','computer_lab')
  ) then raise exception 'A selected room is inactive or does not match the subject room type.'; end if;

  if exists (
    select 1 from public.school_exam_plan_allocations a
    join public.school_exam_plan_allocations b on b.plan_run_id=a.plan_run_id and b.id>a.id
      and b.room_id=a.room_id and b.exam_date=a.exam_date and a.start_time<b.end_time and a.end_time>b.start_time
    where a.plan_run_id=v_run_id
  ) then raise exception 'Room double-booking detected. No plan was saved.'; end if;

  if exists (
    select 1 from public.school_exam_plan_allocations a
    join public.school_exam_plan_allocations b on b.plan_run_id=a.plan_run_id and b.id>a.id
      and b.invigilator_person_id=a.invigilator_person_id and b.exam_date=a.exam_date
      and a.start_time<b.end_time and a.end_time>b.start_time
    where a.plan_run_id=v_run_id
  ) then raise exception 'Invigilator double-booking detected. No plan was saved.'; end if;

  if exists (
    select 1 from public.school_exam_plan_allocations a
    join public.school_exam_schedules e on e.id=a.exam_schedule_id and e.school_id=a.school_id
    join public.school_exam_plan_allocations b on b.plan_run_id=a.plan_run_id and b.id>a.id
    join public.school_exam_schedules other on other.id=b.exam_schedule_id and other.school_id=b.school_id
    where a.plan_run_id=v_run_id and e.standard_name=other.standard_name and e.section_name=other.section_name
      and a.exam_date=b.exam_date and a.start_time<b.end_time and a.end_time>b.start_time
  ) then raise exception 'Student timetable clash detected for the same class and section.'; end if;

  if exists (
    select 1 from public.school_exam_schedules e
    where e.school_id=p_school_id and e.academic_year=p_academic_year and e.exam_name=p_exam_name
      and (select coalesce(sum(r.capacity),0) from public.school_exam_plan_allocations a
           join public.school_exam_rooms r on r.id=a.room_id and r.school_id=a.school_id
           where a.plan_run_id=v_run_id and a.exam_schedule_id=e.id) < (
        select count(*) from public.school_people p where p.school_id=e.school_id and p.record_type='Student'
          and p.details->>'joining_standard'=e.standard_name and coalesce(p.details->>'section','')=e.section_name
      )
  ) then raise exception 'Room capacity is insufficient for at least one class and section.'; end if;

  if exists (
    select 1 from public.school_exam_plan_allocations a
    where a.plan_run_id=v_run_id and not exists (
      select 1 from public.school_people p where p.school_id=a.school_id
        and p.person_id=a.invigilator_person_id and p.record_type='Teacher'
    )
  ) then raise exception 'An invigilator is not a teacher profile in this school.'; end if;
  return v_run_id;
end;
$$;
revoke all on function public.save_school_ai_exam_plan(text,text,text,jsonb,jsonb) from public,anon;
grant execute on function public.save_school_ai_exam_plan(text,text,text,jsonb,jsonb) to authenticated;

create or replace function public.publish_school_ai_exam_plan(p_school_id text,p_plan_run_id uuid)
returns void language plpgsql security invoker set search_path = public, private
as $$
begin
  if not private.can_manage_exam_schedule(p_school_id) then
    raise exception 'You do not have permission to publish this exam plan.';
  end if;
  if not exists(select 1 from public.school_exam_plan_runs where id=p_plan_run_id and school_id=p_school_id and status='draft') then
    raise exception 'Draft exam plan not found.';
  end if;
  update public.school_exam_schedules e
  set exam_date=a.exam_date,start_time=a.start_time,end_time=a.end_time,updated_at=now()
  from (
    select distinct on (exam_schedule_id) exam_schedule_id,exam_date,start_time,end_time
    from public.school_exam_plan_allocations
    where school_id=p_school_id and plan_run_id=p_plan_run_id
    order by exam_schedule_id,created_at,id
  ) a
  where e.id=a.exam_schedule_id and e.school_id=p_school_id;
  update public.school_exam_plan_runs set status='published',published_at=now()
  where id=p_plan_run_id and school_id=p_school_id and status='draft';
end;
$$;
revoke all on function public.publish_school_ai_exam_plan(text,uuid) from public,anon;
grant execute on function public.publish_school_ai_exam_plan(text,uuid) to authenticated;
