alter table public.school_tenants
  add column if not exists address_line_1 text,
  add column if not exists address_line_2 text,
  add column if not exists pincode text,
  add column if not exists city_town text,
  add column if not exists state text,
  add column if not exists school_started_year integer,
  add column if not exists student_strength integer,
  add column if not exists bus_count integer,
  add column if not exists staff_count integer,
  add column if not exists teacher_count integer,
  add column if not exists plan_code text,
  add column if not exists plan_status text not null default 'setup_pending',
  add column if not exists plan_selected_at timestamptz,
  add column if not exists trial_started_at timestamptz,
  add column if not exists trial_ends_at timestamptz;
alter table public.school_tenants
  drop constraint if exists school_tenants_plan_code_check,
  add constraint school_tenants_plan_code_check check (plan_code is null or plan_code in ('BASIC', 'PRO', 'PREMIUM', 'CUSTOM')),
  drop constraint if exists school_tenants_plan_status_check,
  add constraint school_tenants_plan_status_check check (plan_status in ('setup_pending', 'trial', 'pending_payment', 'expired', 'active')),
  drop constraint if exists school_tenants_counts_nonnegative_check,
  add constraint school_tenants_counts_nonnegative_check check ((student_strength is null or student_strength >= 0) and (bus_count is null or bus_count >= 0) and (staff_count is null or staff_count >= 0) and (teacher_count is null or teacher_count >= 0));
create index if not exists school_tenants_plan_status_idx on public.school_tenants (plan_status, trial_ends_at);
