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
     or (b.standard_name is null)
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
  if exists(select 1 from public.school_academic_timetable t
   where t.school_id=p_school_id and t.academic_year=v_req.academic_year
    and t.standard_name=v_req.standard_name and t.section_name=v_req.section_name
    and t.subject_id=v_req.subject_id and (t.teacher_person_id is null or t.room_id is null or t.room_type<>v_req.room_type)) then
   raise exception 'Every published lesson must have a qualified teacher and a matching registered room';
  end if;
  select count(distinct t.double_group_id) into v_doubles from public.school_academic_timetable t
   where t.school_id=p_school_id and t.academic_year=v_req.academic_year
    and t.standard_name=v_req.standard_name and t.section_name=v_req.section_name
    and t.subject_id=v_req.subject_id and t.is_double_period and t.double_group_id is not null;
  if v_doubles<>v_req.double_periods then
   raise exception 'Double-period quota mismatch for % %: expected %, found %',
    v_req.standard_name,v_req.section_name,v_req.double_periods,v_doubles;
  end if;
  if exists(
   select 1 from public.school_academic_timetable first_period
   where first_period.school_id=p_school_id and first_period.academic_year=v_req.academic_year
    and first_period.standard_name=v_req.standard_name and first_period.section_name=v_req.section_name
    and first_period.subject_id=v_req.subject_id and first_period.is_double_period
    and (first_period.double_group_id is null or
     (select count(*) from public.school_academic_timetable pair_period
      where pair_period.school_id=first_period.school_id and pair_period.double_group_id=first_period.double_group_id)<>2
     or not exists(select 1 from public.school_academic_timetable second_period
      where second_period.school_id=first_period.school_id and second_period.double_group_id=first_period.double_group_id
       and second_period.id<>first_period.id and second_period.day_of_week=first_period.day_of_week
       and second_period.period_number=first_period.period_number+1
       and second_period.start_time=first_period.end_time
       and second_period.standard_name=first_period.standard_name and second_period.section_name=first_period.section_name
       and second_period.subject_id=first_period.subject_id
       and second_period.teacher_person_id=first_period.teacher_person_id
       and second_period.room_id=first_period.room_id
       and not second_period.is_double_period))
  ) then
   raise exception 'A double lesson must be exactly two adjacent periods with the same teacher and room';
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
 select p.id into v_id from public.school_timetable_proxy_assignments p
  where p.school_id=p_school_id and p.original_timetable_id=p_original_timetable_id
   and p.replacement_date=p_replacement_date and p.status='cancelled' for update;
 if v_id is not null then
  update public.school_timetable_proxy_assignments set
   absent_teacher_person_id=v_absent,substitute_teacher_person_id=p_substitute_teacher_person_id,
   standard_name=v_slot.standard_name,section_name=v_slot.section_name,period_number=v_slot.period_number,
   status='assigned',reason=nullif(btrim(p_reason),''),created_by=(select auth.uid()),created_at=now()
  where school_id=p_school_id and id=v_id;
 else
  insert into public.school_timetable_proxy_assignments(
   school_id,original_timetable_id,replacement_date,absent_teacher_person_id,substitute_teacher_person_id,
   standard_name,section_name,period_number,reason,created_by
  ) values(p_school_id,p_original_timetable_id,p_replacement_date,v_absent,p_substitute_teacher_person_id,
   v_slot.standard_name,v_slot.section_name,v_slot.period_number,nullif(btrim(p_reason),''),(select auth.uid()))
  returning id into v_id;
 end if;
 return v_id;
end;
$function$;
revoke all on function public.assign_school_timetable_proxy(text,uuid,date,text,text) from public,anon;
grant execute on function public.assign_school_timetable_proxy(text,uuid,date,text,text) to authenticated;

