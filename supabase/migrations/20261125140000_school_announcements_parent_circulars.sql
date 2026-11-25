create table if not exists public.school_announcements (
 id uuid primary key default gen_random_uuid(),
 school_id text not null references public.school_tenants(school_id) on delete cascade,
 title text not null check (char_length(title) between 1 and 180),
 body text not null check (char_length(body) between 1 and 10000),
 content_type text not null default 'message' check (content_type in ('message','circular')),
 audience_type text not null default 'all' check (audience_type in ('all','standard','section')),
 standard_name text,
 section_name text,
 status text not null default 'draft' check (status in ('draft','scheduled','published','archived')),
 scheduled_for timestamptz,
 expires_at timestamptz,
 created_by uuid default auth.uid() references auth.users(id) on delete set null,
 published_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint school_announcements_audience_check check (
  (audience_type='all' and standard_name is null and section_name is null)
  or (audience_type='standard' and standard_name is not null and section_name is null)
  or (audience_type='section' and standard_name is not null and section_name is not null)
 ),
 constraint school_announcements_schedule_check check (
  (status <> 'scheduled' or (scheduled_for is not null and expires_at is not null and expires_at > scheduled_for))
 )
);
create index if not exists school_announcements_school_created_idx on public.school_announcements(school_id, created_at desc);
create index if not exists school_announcements_scheduled_idx on public.school_announcements(school_id, scheduled_for) where status='scheduled';
alter table public.school_announcements enable row level security;
grant select, insert, update, delete on public.school_announcements to authenticated;
drop policy if exists "Authorized users read school announcements" on public.school_announcements;
create policy "Authorized users read school announcements" on public.school_announcements for select to authenticated using (
 private.is_school_admin(school_id)
 or exists(select 1 from public.school_user_roles r where r.school_id=school_announcements.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Announcements'=any(r.allowed_pages))
);
drop policy if exists "Authorized users create school announcements" on public.school_announcements;
create policy "Authorized users create school announcements" on public.school_announcements for insert to authenticated with check (
 private.is_school_admin(school_id)
 or exists(select 1 from public.school_user_roles r where r.school_id=school_announcements.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Announcements'=any(r.allowed_pages))
);
drop policy if exists "Authorized users update school announcements" on public.school_announcements;
create policy "Authorized users update school announcements" on public.school_announcements for update to authenticated using (
 private.is_school_admin(school_id)
 or exists(select 1 from public.school_user_roles r where r.school_id=school_announcements.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Announcements'=any(r.allowed_pages))
) with check (
 private.is_school_admin(school_id)
 or exists(select 1 from public.school_user_roles r where r.school_id=school_announcements.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Announcements'=any(r.allowed_pages))
);
drop policy if exists "Authorized users delete school announcements" on public.school_announcements;
create policy "Authorized users delete school announcements" on public.school_announcements for delete to authenticated using (
 private.is_school_admin(school_id)
 or exists(select 1 from public.school_user_roles r where r.school_id=school_announcements.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Announcements'=any(r.allowed_pages))
);