drop function if exists public.get_school_section_strengths(text);

create table if not exists public.school_section_strengths (
 school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
 standard_name text not null,
 section_name text not null default '',
 student_count integer not null default 0 check(student_count>=0),
 updated_at timestamptz not null default now(),
 primary key(school_id,standard_name,section_name)
);
alter table public.school_section_strengths enable row level security;
grant select on public.school_section_strengths to authenticated;
revoke insert,update,delete on public.school_section_strengths from authenticated,anon;
drop policy if exists "Timetable managers read section strengths" on public.school_section_strengths;
create policy "Timetable managers read section strengths" on public.school_section_strengths
 for select to authenticated using (
  exists(select 1 from public.school_tenants t where t.school_id=school_section_strengths.school_id and t.admin_user_id=(select auth.uid()))
  or exists(select 1 from public.school_user_roles r where r.school_id=school_section_strengths.school_id
   and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Timetable'=any(r.allowed_pages))
 );

create index if not exists school_section_strengths_lookup_idx
 on public.school_section_strengths(school_id,standard_name,section_name);

create or replace function private.sync_school_section_strength()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_old_standard text; v_old_section text; v_new_standard text; v_new_section text;
begin
 if tg_op in ('UPDATE','DELETE') and old.record_type='Student' then
  v_old_standard:=nullif(old.details->>'joining_standard','');
  v_old_section:=coalesce(old.details->>'section','');
  if v_old_standard is not null then
   update public.school_section_strengths set student_count=student_count-1,updated_at=now()
    where school_id=old.school_id and standard_name=v_old_standard and section_name=v_old_section and student_count>1;
   delete from public.school_section_strengths
    where school_id=old.school_id and standard_name=v_old_standard and section_name=v_old_section and student_count<=1;
  end if;
 end if;
 if tg_op in ('INSERT','UPDATE') and new.record_type='Student' then
  v_new_standard:=nullif(new.details->>'joining_standard','');
  v_new_section:=coalesce(new.details->>'section','');
  if v_new_standard is not null then
   insert into public.school_section_strengths(school_id,standard_name,section_name,student_count,updated_at)
   values(new.school_id,v_new_standard,v_new_section,1,now())
   on conflict(school_id,standard_name,section_name)
   do update set student_count=public.school_section_strengths.student_count+1,updated_at=now();
  end if;
 end if;
 if tg_op='DELETE' then return old; end if;
 return new;
end;
$function$;
revoke all on function private.sync_school_section_strength() from public,anon,authenticated;

drop trigger if exists sync_school_section_strength on public.school_people;
create trigger sync_school_section_strength after insert or update or delete
 on public.school_people for each row execute function private.sync_school_section_strength();

truncate table public.school_section_strengths;
insert into public.school_section_strengths(school_id,standard_name,section_name,student_count)
select school_id,details->>'joining_standard',coalesce(details->>'section',''),count(*)::integer
from public.school_people
where record_type='Student' and nullif(details->>'joining_standard','') is not null
group by school_id,details->>'joining_standard',coalesce(details->>'section','');
