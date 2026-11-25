create or replace function private.enforce_school_timetable_period_grid()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_conflict boolean;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.school_id||':'||new.academic_year||':period-grid',0));
 if new.end_time<=new.start_time then raise exception 'Period end time must be after its start time'; end if;
 select exists(select 1 from public.school_timetable_periods p
  where p.school_id=new.school_id and p.academic_year=new.academic_year
   and p.id is distinct from new.id and new.start_time<p.end_time and new.end_time>p.start_time) into v_conflict;
 if v_conflict then raise exception 'Time-grid periods cannot overlap; adjust the start or end time'; end if;
 return new;
end;
$function$;
revoke all on function private.enforce_school_timetable_period_grid() from public,anon,authenticated;
drop trigger if exists enforce_school_timetable_period_grid on public.school_timetable_periods;
create trigger enforce_school_timetable_period_grid before insert or update on public.school_timetable_periods
for each row execute function private.enforce_school_timetable_period_grid();
