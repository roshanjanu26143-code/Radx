create table if not exists public.school_academic_subjects (
 id uuid primary key default gen_random_uuid(),
 school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
 academic_year text not null,
 standard_name text not null check(length(btrim(standard_name))>0),
 subject_code text,
 subject_name text not null check(length(btrim(subject_name))>0),
 subject_type text not null default 'Core' check(subject_type in ('Core','Language','Elective','Co-curricular')),
 is_active boolean not null default true,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint school_academic_subjects_school_id_id_unique unique(school_id,id),
 constraint school_academic_subjects_unique unique(school_id,academic_year,standard_name,subject_name)
);
create index if not exists school_academic_subjects_lookup_idx on public.school_academic_subjects(school_id,academic_year,standard_name,is_active);
alter table public.school_academic_subjects enable row level security;
grant select,insert,update,delete on public.school_academic_subjects to authenticated;
create policy "School users read academic subjects" on public.school_academic_subjects for select to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_subjects.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=school_academic_subjects.school_id and r.user_id=(select auth.uid()) and r.status='active'
  and r.allowed_pages && array['Standard','Subjects','Timetable','Exam Schedules','Marks Entry','Student Results','Performance']::text[])
);
create policy "School admins manage academic subjects" on public.school_academic_subjects for all to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_subjects.school_id and t.admin_user_id=(select auth.uid()))
) with check (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_subjects.school_id and t.admin_user_id=(select auth.uid()))
);

create table if not exists public.school_academic_timetable (
 id uuid primary key default gen_random_uuid(),
 school_id text not null references public.school_tenants(school_id) on update cascade on delete cascade,
 academic_year text not null,
 standard_name text not null,
 section_name text not null,
 day_of_week smallint not null check(day_of_week between 1 and 6),
 period_number smallint not null check(period_number between 1 and 12),
 start_time time not null,
 end_time time not null,
 subject_id uuid not null,
 teacher_person_id text,
 room_label text,
 created_by uuid references auth.users(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint school_academic_timetable_school_id_id_unique unique(school_id,id),
 constraint school_academic_timetable_time_check check(end_time>start_time),
 constraint school_academic_timetable_period_unique unique(school_id,academic_year,standard_name,section_name,day_of_week,period_number),
 constraint school_academic_timetable_subject_fk foreign key(school_id,subject_id)
  references public.school_academic_subjects(school_id,id) on delete restrict,
 constraint school_academic_timetable_teacher_fk foreign key(school_id,teacher_person_id)
  references public.school_people(school_id,person_id) on delete restrict
);
create index if not exists school_academic_timetable_lookup_idx on public.school_academic_timetable(school_id,academic_year,standard_name,section_name,day_of_week,period_number);
create index if not exists school_academic_timetable_teacher_idx on public.school_academic_timetable(school_id,teacher_person_id,day_of_week);
alter table public.school_academic_timetable enable row level security;
grant select,insert,update,delete on public.school_academic_timetable to authenticated;
create policy "School users read assigned academic timetable" on public.school_academic_timetable for select to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_timetable.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=school_academic_timetable.school_id and r.user_id=(select auth.uid()) and r.status='active'
  and ('Timetable'=any(r.allowed_pages) or 'Standard'=any(r.allowed_pages) or 'Exam Schedules'=any(r.allowed_pages))
  and (r.role<>'Teacher' or r.person_id=school_academic_timetable.teacher_person_id
   or exists(select 1 from public.school_teacher_class_assignments a where a.school_id=school_academic_timetable.school_id and a.teacher_person_id=r.person_id and a.is_active
    and a.standard_name=school_academic_timetable.standard_name and a.section_name=school_academic_timetable.section_name
    and (a.subject_name is null or exists(select 1 from public.school_academic_subjects s where s.school_id=a.school_id and s.id=school_academic_timetable.subject_id and s.subject_name=a.subject_name)))))
);
create policy "School admins manage academic timetable" on public.school_academic_timetable for all to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_timetable.school_id and t.admin_user_id=(select auth.uid()))
) with check (
 exists(select 1 from public.school_tenants t where t.school_id=school_academic_timetable.school_id and t.admin_user_id=(select auth.uid()))
);
