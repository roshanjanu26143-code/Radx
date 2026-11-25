-- Keep the database permission check aligned with the Performance page.
-- Standard Coordinators / Performance users may import marks; teachers remain
-- limited to their assigned class, section, subject and the Marks Entry page.
create or replace function public.save_school_exam_marks(p_school_id text, p_exam_schedule_id uuid, p_marks jsonb)
returns integer
language plpgsql
set search_path to ''
as $function$
declare
 v_exam public.school_exam_schedules%rowtype;
 v_total integer;
 v_valid integer;
 v_saved integer;
 v_authorized boolean;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 if p_marks is null or jsonb_typeof(p_marks)<>'array' or jsonb_array_length(p_marks)=0 then
  raise exception 'Enter marks for at least one student';
 end if;
 select * into v_exam from public.school_exam_schedules e where e.school_id=p_school_id and e.id=p_exam_schedule_id;
 if not found then raise exception 'Exam schedule not found'; end if;
 if v_exam.is_published then raise exception 'This exam is published. Unpublish it before changing marks.'; end if;
 select exists(
  select 1 from public.school_tenants t where t.school_id=p_school_id and t.admin_user_id=(select auth.uid())
 ) or exists(
  select 1 from public.school_user_roles r
  where r.school_id=p_school_id and r.user_id=(select auth.uid())
   and r.status='active' and r.role<>'Teacher'
   and ('Marks Entry'=any(r.allowed_pages) or 'Performance'=any(r.allowed_pages))
 ) or exists(
  select 1 from public.school_user_roles r
  join public.school_teacher_class_assignments a on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active
  where r.school_id=p_school_id and r.user_id=(select auth.uid())
   and r.status='active' and r.role='Teacher' and 'Marks Entry'=any(r.allowed_pages)
   and a.standard_name=v_exam.standard_name and a.section_name=v_exam.section_name
   and (a.subject_name is null or a.subject_name=v_exam.subject_name)
 ) into v_authorized;
 if not v_authorized then raise exception 'You are not authorized to enter marks for this class and subject'; end if;
 select count(*) into v_total from jsonb_to_recordset(p_marks) as x(student_person_id text,marks_obtained numeric,remarks text);
 if v_total=0 then raise exception 'No valid marks were provided'; end if;
 if exists(
  select 1 from jsonb_to_recordset(p_marks) as x(student_person_id text,marks_obtained numeric,remarks text)
  where x.student_person_id is null or x.marks_obtained is null or x.marks_obtained<0 or x.marks_obtained>v_exam.max_marks
 ) then raise exception 'Marks must be between 0 and %',v_exam.max_marks; end if;
 if (select count(distinct x.student_person_id) from jsonb_to_recordset(p_marks) as x(student_person_id text,marks_obtained numeric,remarks text))<>v_total then
  raise exception 'Duplicate student entries were found in the marks submission';
 end if;
 select count(*) into v_valid
 from jsonb_to_recordset(p_marks) as x(student_person_id text,marks_obtained numeric,remarks text)
 join public.school_people s on s.school_id=p_school_id and s.person_id=x.student_person_id
  and s.record_type='Student' and s.details->>'joining_standard'=v_exam.standard_name
  and coalesce(s.details->>'section','')=v_exam.section_name;
 if v_valid<>v_total then raise exception 'One or more students do not belong to this exam class and section'; end if;
 insert into public.school_exam_marks(school_id,exam_schedule_id,student_person_id,marks_obtained,remarks,entered_by,updated_at)
 select p_school_id,p_exam_schedule_id,x.student_person_id,x.marks_obtained,nullif(btrim(x.remarks),''),
  (select auth.uid()),pg_catalog.now()
 from jsonb_to_recordset(p_marks) as x(student_person_id text,marks_obtained numeric,remarks text)
 on conflict(school_id,exam_schedule_id,student_person_id)
 do update set marks_obtained=excluded.marks_obtained,remarks=excluded.remarks,entered_by=(select auth.uid()),updated_at=pg_catalog.now();
 get diagnostics v_saved=row_count;
 return v_saved;
end;
$function$;
