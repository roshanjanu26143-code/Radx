create table if not exists public.school_push_vapid_keys(
 key_id text primary key check(key_id='radx-global'),public_key text not null,private_key text not null,created_at timestamptz not null default now()
);
alter table public.school_push_vapid_keys enable row level security;
revoke all on public.school_push_vapid_keys from anon,authenticated;
grant all on public.school_push_vapid_keys to service_role;