create table if not exists public.school_academic_submissions (
 id uuid primary key default gen_random_uuid(),
 school_id text not null references public.school_tenants(school_id) on delete cascade,
 submission_type text not null check (submission_type in ('attendance_report','student_performance')),
 academic_year text not null,
 exam_name text,
 standard_name text not null,
 section_name text not null default '',
 status text not null default 'submitted' check (status in ('submitted','under_review','approved','returned')),
 submitted_by uuid not null default auth.uid() references auth.users(id),
 submitted_at timestamptz not null default now(),
 reviewed_by uuid references auth.users(id),
 reviewed_at timestamptz,
 review_note text,
 file_name text,
 record_count integer not null default 0 check (record_count >= 0),
 source_session_ids uuid[] not null default '{}',
 report_period text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists school_academic_submissions_scope_idx on public.school_academic_submissions (school_id, submission_type, academic_year, standard_name, section_name, submitted_at desc);
create index if not exists school_academic_submissions_submitted_by_idx on public.school_academic_submissions (submitted_by);
create index if not exists school_academic_submissions_reviewed_by_idx on public.school_academic_submissions (reviewed_by);
create unique index if not exists school_academic_submissions_period_unique on public.school_academic_submissions (school_id, submission_type, academic_year, report_period, standard_name, section_name, coalesce(exam_name,''));
alter table public.school_academic_submissions enable row level security;
drop policy if exists "Academic users read scoped submissions" on public.school_academic_submissions;
create policy "Academic users read scoped submissions" on public.school_academic_submissions for select to authenticated using (
 exists (select 1 from public.school_tenants t where t.school_id = school_academic_submissions.school_id and t.admin_user_id = (select auth.uid()))
 or exists (select 1 from public.school_user_roles r where r.school_id = school_academic_submissions.school_id and r.user_id = (select auth.uid()) and r.status = 'active' and r.allowed_pages && array['Attendance Reports','Performance','Marks Entry','Exam Schedules']::text[])
);
drop policy if exists "Academic coordinators submit reports" on public.school_academic_submissions;
create policy "Academic coordinators submit reports" on public.school_academic_submissions for insert to authenticated with check (
 submitted_by = (select auth.uid()) and status = 'submitted' and reviewed_by is null and reviewed_at is null
 and (exists (select 1 from public.school_tenants t where t.school_id = school_academic_submissions.school_id and t.admin_user_id = (select auth.uid()))
 or exists (select 1 from public.school_user_roles r where r.school_id = school_academic_submissions.school_id and r.user_id = (select auth.uid()) and r.status = 'active' and r.allowed_pages && case when submission_type = 'attendance_report' then array['Attendance Reports']::text[] else array['Performance','Marks Entry']::text[] end))
);
drop policy if exists "Academic staff review submissions" on public.school_academic_submissions;
create policy "Academic staff review submissions" on public.school_academic_submissions for update to authenticated using (
 exists (select 1 from public.school_tenants t where t.school_id = school_academic_submissions.school_id and t.admin_user_id = (select auth.uid()))
 or exists (select 1 from public.school_user_roles r where r.school_id = school_academic_submissions.school_id and r.user_id = (select auth.uid()) and r.status = 'active' and r.allowed_pages && case when submission_type = 'attendance_report' then array['Attendance Reports']::text[] else array['Performance','Marks Entry']::text[] end)
) with check (
 status in ('submitted','under_review','approved','returned')
 and (reviewed_by is null or reviewed_by = (select auth.uid()))
 and (reviewed_at is null or reviewed_by = (select auth.uid()))
);
grant select, insert, update on public.school_academic_submissions to authenticated;
