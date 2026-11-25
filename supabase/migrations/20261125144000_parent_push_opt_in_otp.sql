create table if not exists public.school_parent_push_otps(
 id uuid primary key default gen_random_uuid(),school_id text not null references public.school_tenants(school_id) on delete cascade,
 recipient_phone text not null,otp_hash text not null,attempts integer not null default 0 check(attempts between 0 and 6),
 expires_at timestamptz not null,created_at timestamptz not null default now()
);
create index if not exists school_parent_push_otps_lookup_idx on public.school_parent_push_otps(school_id,recipient_phone,created_at desc);
alter table public.school_parent_push_otps enable row level security;
revoke all on public.school_parent_push_otps from anon,authenticated;
grant all on public.school_parent_push_otps to service_role;
drop policy if exists "No client access to parent push OTPs" on public.school_parent_push_otps;
create policy "No client access to parent push OTPs" on public.school_parent_push_otps for all to anon,authenticated using(false) with check(false);
