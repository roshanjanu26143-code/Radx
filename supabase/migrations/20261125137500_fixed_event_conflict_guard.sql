create or replace function private.enforce_school_timetable_fixed_block_rules()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_start time; v_end time; v_has_grid boolean;
begin
 select p.start_time,p.end_time into v_start,v_end
 from public.school_timetable_periods p
 where p.school_id=new.school_id and p.academic_year=new.academic_year and p.period_number=new.period_number;
 v_has_grid:=found;

 if exists(select 1 from public.school_academic_timetable t
  where t.school_id=new.school_id and t.academic_year=new.academic_year
   and t.day_of_week=new.day_of_week
   and (
    new.standard_name is null
    or (t.standard_name=new.standard_name and (new.section_name is null or t.section_name=new.section_name))
    or (new.teacher_person_id is not null and t.teacher_person_id=new.teacher_person_id)
    or (new.room_id is not null and t.room_id=new.room_id)
   )
   and (case when v_has_grid then t.start_time<v_end and t.end_time>v_start else t.period_number=new.period_number end)
 ) then
  raise exception 'This fixed event conflicts with an already scheduled class, teacher or room';
 end if;

 if exists(select 1 from public.school_timetable_fixed_blocks b
  where b.school_id=new.school_id and b.academic_year=new.academic_year and b.id is distinct from new.id
   and b.day_of_week=new.day_of_week and b.period_number=new.period_number
   and (
    new.standard_name is null or b.standard_name is null
    or (b.standard_name=new.standard_name and (b.section_name is null or new.section_name is null or b.section_name=new.section_name))
    or (new.teacher_person_id is not null and b.teacher_person_id=new.teacher_person_id)
    or (new.room_id is not null and b.room_id=new.room_id)
   )
 ) then
  raise exception 'This fixed event overlaps another reserved class, teacher or room slot';
 end if;
 return new;
end;
$function$;
revoke all on function private.enforce_school_timetable_fixed_block_rules() from public,anon,authenticated;
drop trigger if exists enforce_school_timetable_fixed_block_rules on public.school_timetable_fixed_blocks;
create trigger enforce_school_timetable_fixed_block_rules before insert or update
 on public.school_timetable_fixed_blocks for each row execute function private.enforce_school_timetable_fixed_block_rules();
