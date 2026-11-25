create or replace function public.get_school_section_strengths(p_school_id text)
returns table(standard_name text,section_name text,student_count bigint)
language plpgsql security definer set search_path=''
as $function$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if not exists(select 1 from public.school_tenants t where t.school_id=p_school_id and t.admin_user_id=(select auth.uid()))
 and not exists(select 1 from public.school_user_roles r where r.school_id=p_school_id and r.user_id=(select auth.uid())
  and r.status='active' and r.role<>'Teacher' and 'Timetable'=any(r.allowed_pages)) then
  raise exception 'You are not authorized to view section strength summaries';
 end if;
 return query
 select p.details->>'joining_standard',coalesce(p.details->>'section',''),count(*)
 from public.school_people p
 where p.school_id=p_school_id and p.record_type='Student'
  and nullif(p.details->>'joining_standard','') is not null
 group by p.details->>'joining_standard',coalesce(p.details->>'section','');
end;
$function$;
revoke all on function public.get_school_section_strengths(text) from public,anon;
grant execute on function public.get_school_section_strengths(text) to authenticated;
