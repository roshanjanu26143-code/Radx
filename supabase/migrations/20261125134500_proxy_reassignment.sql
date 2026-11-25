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

