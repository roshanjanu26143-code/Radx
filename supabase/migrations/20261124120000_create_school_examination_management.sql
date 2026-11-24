create table if not exists public.school_exam_schedules (
 id uuid primary key default gen_random_uuid(),
 school_id text not null,
 academic_year text not null,
 exam_name text not null,
 standard_name text not null,
 section_name text not null,
 subject_name text not null,
 exam_date date not null,
 start_time time,
 end_time time,
 max_marks numeric(8,2) not null check(max_marks>0),
 pass_marks numeric(8,2) not null default 0 check(pass_marks>=0 and pass_marks<=max_marks),
 instructions text,
 is_published boolean not null default false,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint school_exam_schedules_school_id_id_unique unique(school_id,id),
 constraint school_exam_schedule_subject_unique unique(school_id,academic_year,exam_name,standard_name,section_name,subject_name),
 check(end_time is null or start_time is null or end_time>start_time)
);
create index if not exists school_exam_schedule_lookup_idx on public.school_exam_schedules(school_id,academic_year,standard_name,section_name,exam_date);

create table if not exists public.school_exam_marks (
 id uuid primary key default gen_random_uuid(),
 school_id text not null,
 exam_schedule_id uuid not null,
 student_person_id text not null,
 marks_obtained numeric(8,2) not null check(marks_obtained>=0),
 remarks text,
 entered_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint school_exam_marks_one_per_student unique(school_id,exam_schedule_id,student_person_id),
 constraint school_exam_marks_exam_fk foreign key(school_id,exam_schedule_id)
  references public.school_exam_schedules(school_id,id) on delete cascade,
 constraint school_exam_marks_student_fk foreign key(school_id,student_person_id)
  references public.school_people(school_id,person_id) on delete restrict
);
create index if not exists school_exam_marks_exam_idx on public.school_exam_marks(school_id,exam_schedule_id);
create index if not exists school_exam_marks_student_idx on public.school_exam_marks(school_id,student_person_id);

alter table public.school_exam_schedules enable row level security;
alter table public.school_exam_marks enable row level security;
grant select,insert,update,delete on public.school_exam_schedules to authenticated;
grant select,insert,update on public.school_exam_marks to authenticated;

create policy "School users read exam schedules"
on public.school_exam_schedules for select to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_exam_schedules.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=school_exam_schedules.school_id and r.user_id=(select auth.uid()) and r.status='active'
  and (r.allowed_pages && array['Exam Schedules','Student Results','Performance','Marks Entry']::text[]))
);
create policy "Admins and assigned teachers create exam schedules"
on public.school_exam_schedules for insert to authenticated with check (
 exists(select 1 from public.school_tenants t where t.school_id=school_exam_schedules.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a
  on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active
  where r.school_id=school_exam_schedules.school_id and r.user_id=(select auth.uid()) and r.status='active'
   and r.allowed_pages && array['Exam Schedules','Marks Entry']::text[]
   and a.standard_name=school_exam_schedules.standard_name and a.section_name=school_exam_schedules.section_name
   and (a.subject_name is null or a.subject_name=school_exam_schedules.subject_name))
);
create policy "Admins and assigned teachers update exam schedules"
on public.school_exam_schedules for update to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_exam_schedules.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a
  on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active
  where r.school_id=school_exam_schedules.school_id and r.user_id=(select auth.uid()) and r.status='active'
   and r.allowed_pages && array['Exam Schedules','Marks Entry']::text[]
   and a.standard_name=school_exam_schedules.standard_name and a.section_name=school_exam_schedules.section_name
   and (a.subject_name is null or a.subject_name=school_exam_schedules.subject_name))
) with check (
 exists(select 1 from public.school_tenants t where t.school_id=school_exam_schedules.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a
  on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active
  where r.school_id=school_exam_schedules.school_id and r.user_id=(select auth.uid()) and r.status='active'
   and r.allowed_pages && array['Exam Schedules','Marks Entry']::text[]
   and a.standard_name=school_exam_schedules.standard_name and a.section_name=school_exam_schedules.section_name
   and (a.subject_name is null or a.subject_name=school_exam_schedules.subject_name))
);
create policy "Admins delete exam schedules"
on public.school_exam_schedules for delete to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_exam_schedules.school_id and t.admin_user_id=(select auth.uid()))
);

create policy "School users read exam marks"
on public.school_exam_marks for select to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_exam_marks.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=school_exam_marks.school_id and r.user_id=(select auth.uid()) and r.status='active'
  and r.allowed_pages && array['Student Results','Performance','Marks Entry','Exam Schedules']::text[])
);
create policy "Admins and assigned teachers enter exam marks"
on public.school_exam_marks for insert to authenticated with check (
 entered_by=(select auth.uid()) and exists(
  select 1 from public.school_exam_schedules e
  where e.school_id=school_exam_marks.school_id and e.id=school_exam_marks.exam_schedule_id
   and exists(select 1 from public.school_people s where s.school_id=e.school_id and s.person_id=school_exam_marks.student_person_id
    and s.record_type='Student' and s.details->>'joining_standard'=e.standard_name and coalesce(s.details->>'section','')=e.section_name)
   and (exists(select 1 from public.school_tenants t where t.school_id=e.school_id and t.admin_user_id=(select auth.uid()))
    or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a
      on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active
      where r.school_id=e.school_id and r.user_id=(select auth.uid()) and r.status='active'
       and r.allowed_pages && array['Marks Entry']::text[]
       and a.standard_name=e.standard_name and a.section_name=e.section_name
       and (a.subject_name is null or a.subject_name=e.subject_name)))
   and school_exam_marks.marks_obtained<=e.max_marks
 )
);
create policy "Admins and assigned teachers update exam marks"
on public.school_exam_marks for update to authenticated using (
 exists(select 1 from public.school_exam_schedules e where e.school_id=school_exam_marks.school_id and e.id=school_exam_marks.exam_schedule_id
  and (exists(select 1 from public.school_tenants t where t.school_id=e.school_id and t.admin_user_id=(select auth.uid()))
   or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a
    on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active
    where r.school_id=e.school_id and r.user_id=(select auth.uid()) and r.status='active'
     and r.allowed_pages && array['Marks Entry']::text[] and a.standard_name=e.standard_name and a.section_name=e.section_name
     and (a.subject_name is null or a.subject_name=e.subject_name))))
) with check (
 exists(select 1 from public.school_exam_schedules e where e.school_id=school_exam_marks.school_id and e.id=school_exam_marks.exam_schedule_id
  and school_exam_marks.marks_obtained<=e.max_marks
  and (exists(select 1 from public.school_tenants t where t.school_id=e.school_id and t.admin_user_id=(select auth.uid()))
   or exists(select 1 from public.school_user_roles r join public.school_teacher_class_assignments a
    on a.school_id=r.school_id and a.teacher_person_id=r.person_id and a.is_active
    where r.school_id=e.school_id and r.user_id=(select auth.uid()) and r.status='active'
     and r.allowed_pages && array['Marks Entry']::text[] and a.standard_name=e.standard_name and a.section_name=e.section_name
     and (a.subject_name is null or a.subject_name=e.subject_name))))
);
