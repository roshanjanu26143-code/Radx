create or replace function public.validate_school_academic_timetable()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
 v_subject_name text;
 v_subject_standard text;
 v_subject_year text;
begin
 select s.subject_name,s.standard_name,s.academic_year
 into v_subject_name,v_subject_standard,v_subject_year
 from public.school_academic_subjects s
 where s.school_id=new.school_id and s.id=new.subject_id and s.is_active;

 if not found then
  raise exception 'Select an active subject from this school and academic year';
 end if;
 if v_subject_standard<>new.standard_name or v_subject_year<>new.academic_year then
  raise exception 'The selected subject does not belong to this standard and academic year';
 end if;

 if new.teacher_person_id is not null and not exists (
  select 1 from public.school_teacher_class_assignments a
  where a.school_id=new.school_id and a.teacher_person_id=new.teacher_person_id
   and a.standard_name=new.standard_name and a.section_name=new.section_name and a.is_active
   and (a.subject_name is null or a.subject_name=v_subject_name)
 ) then
  raise exception 'Teacher is not allotted to this class, section and subject';
 end if;

 if exists (
  select 1 from public.school_academic_timetable t
  where t.school_id=new.school_id and t.academic_year=new.academic_year
   and t.day_of_week=new.day_of_week and t.id is distinct from new.id
   and t.standard_name=new.standard_name and t.section_name=new.section_name
   and t.start_time<new.end_time and t.end_time>new.start_time
 ) then
  raise exception 'This class already has an overlapping period at that time';
 end if;

 if new.teacher_person_id is not null and exists (
  select 1 from public.school_academic_timetable t
  where t.school_id=new.school_id and t.academic_year=new.academic_year
   and t.day_of_week=new.day_of_week and t.id is distinct from new.id
   and t.teacher_person_id=new.teacher_person_id
   and t.start_time<new.end_time and t.end_time>new.start_time
 ) then
  raise exception 'This teacher already has another class during that time';
 end if;
 return new;
end;
$function$;

drop trigger if exists validate_school_academic_timetable on public.school_academic_timetable;
create trigger validate_school_academic_timetable
before insert or update on public.school_academic_timetable
for each row execute function public.validate_school_academic_timetable();
