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

