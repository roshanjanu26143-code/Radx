drop policy if exists "Academic users read workspace structure" on public.school_workspace_state;
drop policy if exists "Teachers read own assignments for timetable" on public.school_teacher_class_assignments;
drop policy if exists "Academic managers read teacher profiles for standard setup" on public.school_people;
drop policy if exists "Academic users read students for results" on public.school_people;
drop policy if exists "Authorized users enter exam marks" on public.school_exam_marks;
drop policy if exists "Authorized users update exam marks" on public.school_exam_marks;

create policy "Academic users read workspace structure"
on public.school_workspace_state for select to authenticated
using (exists (select 1 from public.school_user_roles r where r.school_id=school_workspace_state.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.allowed_pages && array['Standard','Subjects','Timetable','Attendance','Attendance Reports','Exam Schedules','Marks Entry','Student Results','Performance']::text[]));

create policy "Teachers read own assignments for timetable"
on public.school_teacher_class_assignments for select to authenticated
using (exists (select 1 from public.school_user_roles r where r.school_id=school_teacher_class_assignments.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role='Teacher' and r.person_id=school_teacher_class_assignments.teacher_person_id and 'Timetable'=any(r.allowed_pages)));

create policy "Academic managers read teacher profiles for standard setup"
on public.school_people for select to authenticated
using (record_type='Teacher' and exists (select 1 from public.school_user_roles r where r.school_id=school_people.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and r.allowed_pages && array['Standard','Timetable']::text[]));

create policy "Academic users read students for results"
on public.school_people for select to authenticated
using (record_type='Student' and exists (select 1 from public.school_user_roles r where r.school_id=school_people.school_id and r.user_id=(select auth.uid()) and r.status='active' and ((r.role<>'Teacher' and r.allowed_pages && array['Standard','Student Results','Performance']::text[]) or (r.role='Teacher' and r.allowed_pages && array['Student Results','Performance']::text[] and exists (select 1 from public.school_teacher_class_assignments a where a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active and a.standard_name=school_people.details->>'joining_standard' and a.section_name=coalesce(school_people.details->>'section',''))))));

create or replace function private.enforce_school_timetable_rules()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_subject_name text; v_valid_teacher boolean; v_conflict boolean;
begin
 perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(new.school_id||':'||new.academic_year||':'||new.day_of_week::text,0));
 select s.subject_name into v_subject_name from public.school_academic_subjects s where s.school_id=new.school_id and s.id=new.subject_id and s.academic_year=new.academic_year and s.standard_name=new.standard_name and s.is_active;
 if v_subject_name is null then raise exception 'Select an active subject for this standard and academic year'; end if;
 if new.teacher_person_id is not null then
  select exists(select 1 from public.school_people p join public.school_teacher_class_assignments a on a.school_id=p.school_id and a.teacher_person_id=p.person_id where p.school_id=new.school_id and p.person_id=new.teacher_person_id and p.record_type='Teacher' and a.is_active and a.standard_name=new.standard_name and a.section_name=new.section_name and (a.subject_name is null or a.subject_name=v_subject_name)) into v_valid_teacher;
  if not v_valid_teacher then raise exception 'The selected teacher is not actively allotted to this class, section and subject'; end if;
 end if;
 select exists(select 1 from public.school_academic_timetable t where t.school_id=new.school_id and t.academic_year=new.academic_year and t.standard_name=new.standard_name and t.section_name=new.section_name and t.day_of_week=new.day_of_week and t.id is distinct from new.id and new.start_time<t.end_time and new.end_time>t.start_time) into v_conflict;
 if v_conflict then raise exception 'This class already has a timetable period during that time'; end if;
 if new.teacher_person_id is not null then
  select exists(select 1 from public.school_academic_timetable t where t.school_id=new.school_id and t.academic_year=new.academic_year and t.teacher_person_id=new.teacher_person_id and t.day_of_week=new.day_of_week and t.id is distinct from new.id and new.start_time<t.end_time and new.end_time>t.start_time) into v_conflict;
  if v_conflict then raise exception 'This teacher is already scheduled during that time'; end if;
 end if;
 return new;
end;
$function$;
revoke all on function private.enforce_school_timetable_rules() from public, anon, authenticated;
drop trigger if exists enforce_school_timetable_rules on public.school_academic_timetable;
create trigger enforce_school_timetable_rules before insert or update on public.school_academic_timetable for each row execute function private.enforce_school_timetable_rules();

drop policy if exists "Admins and assigned teachers enter exam marks" on public.school_exam_marks;
create policy "Authorized users enter exam marks" on public.school_exam_marks for insert to authenticated
with check (entered_by=(select auth.uid()) and exists (
 select 1 from public.school_exam_schedules e join public.school_people s on s.school_id=e.school_id and s.person_id=school_exam_marks.student_person_id and s.record_type='Student' and s.details->>'joining_standard'=e.standard_name and coalesce(s.details->>'section','')=e.section_name
 where e.school_id=school_exam_marks.school_id and e.id=school_exam_marks.exam_schedule_id and school_exam_marks.marks_obtained between 0 and e.max_marks
 and (exists(select 1 from public.school_tenants t where t.school_id=e.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=e.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Marks Entry'=any(r.allowed_pages))
 or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active where r.school_id=e.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role='Teacher' and 'Marks Entry'=any(r.allowed_pages) and a.standard_name=e.standard_name and a.section_name=e.section_name and (a.subject_name is null or a.subject_name=e.subject_name)))
));

drop policy if exists "Admins and assigned teachers update exam marks" on public.school_exam_marks;
create policy "Authorized users update exam marks" on public.school_exam_marks for update to authenticated
using (exists(select 1 from public.school_exam_schedules e where e.school_id=school_exam_marks.school_id and e.id=school_exam_marks.exam_schedule_id and
 (exists(select 1 from public.school_tenants t where t.school_id=e.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=e.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Marks Entry'=any(r.allowed_pages))
 or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active where r.school_id=e.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role='Teacher' and 'Marks Entry'=any(r.allowed_pages) and a.standard_name=e.standard_name and a.section_name=e.section_name and (a.subject_name is null or a.subject_name=e.subject_name))))
with check (entered_by=(select auth.uid()) and exists(select 1 from public.school_exam_schedules e join public.school_people s on s.school_id=e.school_id and s.person_id=school_exam_marks.student_person_id and s.record_type='Student' and s.details->>'joining_standard'=e.standard_name and coalesce(s.details->>'section','')=e.section_name where e.school_id=school_exam_marks.school_id and e.id=school_exam_marks.exam_schedule_id and school_exam_marks.marks_obtained between 0 and e.max_marks and
 (exists(select 1 from public.school_tenants t where t.school_id=e.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=e.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Marks Entry'=any(r.allowed_pages))
 or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active where r.school_id=e.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role='Teacher' and 'Marks Entry'=any(r.allowed_pages) and a.standard_name=e.standard_name and a.section_name=e.section_name and (a.subject_name is null or a.subject_name=e.subject_name)))));

create or replace function public.save_school_exam_marks(p_school_id text,p_exam_schedule_id uuid,p_marks jsonb)
returns integer language plpgsql set search_path=''
as $function$
declare v_exam public.school_exam_schedules%rowtype; v_total integer; v_valid integer; v_saved integer; v_authorized boolean;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 if p_marks is null or jsonb_typeof(p_marks)<>'array' or jsonb_array_length(p_marks)=0 then raise exception 'Enter marks for at least one student'; end if;
 select * into v_exam from public.school_exam_schedules e where e.school_id=p_school_id and e.id=p_exam_schedule_id;
 if not found then raise exception 'Exam schedule not found'; end if;
 if v_exam.is_published then raise exception 'This exam is published. Unpublish it before changing marks.'; end if;
 select exists(select 1 from public.school_tenants t where t.school_id=p_school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=p_school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Marks Entry'=any(r.allowed_pages))
 or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active where r.school_id=p_school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role='Teacher' and 'Marks Entry'=any(r.allowed_pages) and a.standard_name=v_exam.standard_name and a.section_name=v_exam.section_name and (a.subject_name is null or a.subject_name=v_exam.subject_name)) into v_authorized;
 if not v_authorized then raise exception 'You are not authorized to enter marks for this class and subject'; end if;
 select count(*) into v_total from jsonb_to_recordset(p_marks) as x(student_person_id text,marks_obtained numeric,remarks text);
 if v_total=0 then raise exception 'No valid marks were provided'; end if;
 if exists(select 1 from jsonb_to_recordset(p_marks) as x(student_person_id text,marks_obtained numeric,remarks text) where x.student_person_id is null or x.marks_obtained is null or x.marks_obtained<0 or x.marks_obtained>v_exam.max_marks) then raise exception 'Marks must be between 0 and %',v_exam.max_marks; end if;
 if (select count(distinct x.student_person_id) from jsonb_to_recordset(p_marks) as x(student_person_id text,marks_obtained numeric,remarks text))<>v_total then raise exception 'Duplicate student entries were found in the marks submission'; end if;
 select count(*) into v_valid from jsonb_to_recordset(p_marks) as x(student_person_id text,marks_obtained numeric,remarks text) join public.school_people s on s.school_id=p_school_id and s.person_id=x.student_person_id and s.record_type='Student' and s.details->>'joining_standard'=v_exam.standard_name and coalesce(s.details->>'section','')=v_exam.section_name;
 if v_valid<>v_total then raise exception 'One or more students do not belong to this exam class and section'; end if;
 insert into public.school_exam_marks(school_id,exam_schedule_id,student_person_id,marks_obtained,remarks,entered_by,updated_at)
 select p_school_id,p_exam_schedule_id,x.student_person_id,x.marks_obtained,nullif(btrim(x.remarks),''),(select auth.uid()),pg_catalog.now() from jsonb_to_recordset(p_marks) as x(student_person_id text,marks_obtained numeric,remarks text)
 on conflict(school_id,exam_schedule_id,student_person_id) do update set marks_obtained=excluded.marks_obtained,remarks=excluded.remarks,entered_by=(select auth.uid()),updated_at=pg_catalog.now();
 get diagnostics v_saved=row_count;
 return v_saved;
end;
$function$;
revoke all on function public.save_school_exam_marks(text,uuid,jsonb) from public, anon;
grant execute on function public.save_school_exam_marks(text,uuid,jsonb) to authenticated;
