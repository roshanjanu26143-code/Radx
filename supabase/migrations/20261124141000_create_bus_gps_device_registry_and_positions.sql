create table if not exists public.school_bus_gps_devices (
 id uuid primary key default gen_random_uuid(), school_id text not null, bus_id uuid not null,
 provider_name text not null, device_imei text not null check(length(regexp_replace(device_imei,'[^0-9]','','g')) between 10 and 20),
 sim_number text, device_label text, status text not null default 'pending' check(status in ('pending','active','inactive')),
 last_seen_at timestamptz, created_by uuid not null default auth.uid(), created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(), unique(school_id,id), unique(school_id,bus_id), unique(school_id,device_imei),
 foreign key(school_id,bus_id) references public.school_transport_buses(school_id,id) on delete cascade
);
create table if not exists public.school_bus_gps_positions (
 id bigint generated always as identity primary key, school_id text not null, bus_id uuid not null, device_id uuid not null,
 latitude numeric(10,7) not null check(latitude between -90 and 90), longitude numeric(10,7) not null check(longitude between -180 and 180),
 speed_kph numeric(7,2) check(speed_kph is null or speed_kph between 0 and 300),
 heading smallint check(heading is null or heading between 0 and 359), recorded_at timestamptz not null,
 received_at timestamptz not null default now(), source text not null default 'device' check(source in ('device','manual_test')),
 unique(school_id,id),
 foreign key(school_id,bus_id) references public.school_transport_buses(school_id,id) on delete cascade,
 foreign key(school_id,device_id) references public.school_bus_gps_devices(school_id,id) on delete cascade
);
create index if not exists school_bus_gps_positions_latest_idx on public.school_bus_gps_positions(school_id,bus_id,recorded_at desc);
alter table public.school_bus_gps_devices enable row level security;
alter table public.school_bus_gps_positions enable row level security;
grant select,insert,update,delete on public.school_bus_gps_devices to authenticated;
grant select on public.school_bus_gps_positions to authenticated;
grant usage,select on sequence public.school_bus_gps_positions_id_seq to authenticated;
create policy "School users read GPS devices" on public.school_bus_gps_devices for select to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_bus_gps_devices.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=school_bus_gps_devices.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.allowed_pages && array['GPS - Bus','Buses']::text[])
);
create policy "School admins and GPS managers manage devices" on public.school_bus_gps_devices for all to authenticated
using (exists(select 1 from public.school_tenants t where t.school_id=school_bus_gps_devices.school_id and t.admin_user_id=(select auth.uid())) or exists(select 1 from public.school_user_roles r where r.school_id=school_bus_gps_devices.school_id and r.user_id=(select auth.uid()) and r.status='active' and 'GPS - Bus'=any(r.allowed_pages)))
with check (exists(select 1 from public.school_tenants t where t.school_id=school_bus_gps_devices.school_id and t.admin_user_id=(select auth.uid())) or exists(select 1 from public.school_user_roles r where r.school_id=school_bus_gps_devices.school_id and r.user_id=(select auth.uid()) and r.status='active' and 'GPS - Bus'=any(r.allowed_pages)));
create policy "School users read GPS positions" on public.school_bus_gps_positions for select to authenticated using (
 exists(select 1 from public.school_tenants t where t.school_id=school_bus_gps_positions.school_id and t.admin_user_id=(select auth.uid()))
 or exists(select 1 from public.school_user_roles r where r.school_id=school_bus_gps_positions.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.allowed_pages && array['GPS - Bus','Buses','Allotment']::text[])
);