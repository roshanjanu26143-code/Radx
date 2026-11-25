create or replace function public.save_school_timetable_run(
 p_school_id text,p_academic_year text,p_lessons jsonb,p_summary jsonb default '{}'::jsonb
) returns uuid language plpgsql security invoker set search_path=''
as $function$
declare v_run_id uuid; v_item jsonb;
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.school_tenants t where t.school_id=p_school_id and t.admin_user_id=(select auth.uid()))
 and not exists(select 1 from public.school_user_roles r where r.school_id=p_school_id and r.user_id=(select auth.uid())
  and r.status='active' and r.role<>'Teacher' and 'Timetable'=any(r.allowed_pages)) then
  raise exception 'You are not authorized to generate a timetable';
 end if;
 if jsonb_typeof(p_lessons)<>'array' or jsonb_array_length(p_lessons)=0 then
  raise exception 'A timetable plan must contain at least one lesson';
 end if;
 insert into public.school_timetable_generation_runs(school_id,academic_year,status,algorithm,soft_score,hard_violations,summary,created_by)
 values(p_school_id,p_academic_year,'generated','MRV-backtracking-local-search',
  greatest(0,100-coalesce((p_summary->>'soft_penalty')::numeric,0)),0,coalesce(p_summary,'{}'::jsonb),(select auth.uid()))
 returning id into v_run_id;

 update public.school_timetable_generation_runs r set status='archived'
 where r.school_id=p_school_id and r.academic_year=p_academic_year and r.status='generated'
  and r.id<>v_run_id and not exists(select 1 from public.school_academic_timetable t
   where t.school_id=r.school_id and t.generated_run_id=r.id and t.is_locked);
 delete from public.school_academic_timetable t
 where t.school_id=p_school_id and t.academic_year=p_academic_year and t.source='ai'
  and t.is_locked=false;

 for v_item in select value from jsonb_array_elements(p_lessons)
 loop
  insert into public.school_academic_timetable(
   school_id,academic_year,standard_name,section_name,day_of_week,period_number,start_time,end_time,
   subject_id,teacher_person_id,room_id,room_type,room_label,is_double_period,double_group_id,
   combined_group_key,is_locked,source,generated_run_id,created_by
  ) values(
   p_school_id,p_academic_year,v_item->>'standard_name',v_item->>'section_name',
   (v_item->>'day_of_week')::smallint,(v_item->>'period_number')::smallint,
   (v_item->>'start_time')::time,(v_item->>'end_time')::time,
   (v_item->>'subject_id')::uuid,nullif(v_item->>'teacher_person_id',''),
   nullif(v_item->>'room_id','')::uuid,coalesce(v_item->>'room_type','classroom'),
   nullif(v_item->>'room_label',''),coalesce((v_item->>'is_double_period')::boolean,false),
   nullif(v_item->>'double_group_id','')::uuid,nullif(v_item->>'combined_group_key',''),
   false,'ai',v_run_id,(select auth.uid())
  );
 end loop;
 return v_run_id;
end;
$function$;
revoke all on function public.save_school_timetable_run(text,text,jsonb,jsonb) from public,anon;
grant execute on function public.save_school_timetable_run(text,text,jsonb,jsonb) to authenticated;
