-- Import every subject in one class CSV as a single database transaction.
-- Each subject delegates to the existing authorization, enrollment and marks checks.
create or replace function public.save_school_exam_marks_batch(p_school_id text,p_subject_marks jsonb)
returns integer
language plpgsql
set search_path to ''
as $function$
declare
 v_item record;
 v_total integer := 0;
 v_saved integer;
 v_count integer;
begin
 if (select auth.uid()) is null then raise exception 'Authentication required'; end if;
 if p_subject_marks is null or jsonb_typeof(p_subject_marks)<>'array' or jsonb_array_length(p_subject_marks)=0 then
  raise exception 'No subject mark groups were provided';
 end if;
 select count(*) into v_count
 from jsonb_to_recordset(p_subject_marks) as x(exam_schedule_id uuid,marks jsonb);
 if v_count=0 or v_count<>(select count(distinct x.exam_schedule_id) from jsonb_to_recordset(p_subject_marks) as x(exam_schedule_id uuid,marks jsonb)) then
  raise exception 'Duplicate or missing subject exam schedule in the marks upload';
 end if;
 for v_item in
  select x.exam_schedule_id,x.marks
  from jsonb_to_recordset(p_subject_marks) as x(exam_schedule_id uuid,marks jsonb)
 loop
  if v_item.exam_schedule_id is null or v_item.marks is null or jsonb_typeof(v_item.marks)<>'array' or jsonb_array_length(v_item.marks)=0 then
   raise exception 'Every selected subject must contain marks for its students';
  end if;
  v_saved := public.save_school_exam_marks(p_school_id,v_item.exam_schedule_id,v_item.marks);
  v_total := v_total + v_saved;
 end loop;
 return v_total;
end;
$function$;
revoke all on function public.save_school_exam_marks_batch(text,jsonb) from public;
revoke all on function public.save_school_exam_marks_batch(text,jsonb) from anon;
grant execute on function public.save_school_exam_marks_batch(text,jsonb) to authenticated;
