create table if not exists public.school_transport_routes (
 id uuid primary key default gen_random_uuid(), school_id text not null references public.school_tenants(school_id) on delete cascade,
 route_name text not null check(length(btrim(route_name))>0), start_point text not null check(length(btrim(start_point))>0),
 end_point text not null check(length(btrim(end_point))>0), is_active boolean not null default true, created_by uuid default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(school_id,id), unique(school_id,route_name)
);
create table if not exists public.school_transport_stops (
 id uuid primary key default gen_random_uuid(), school_id text not null, route_id uuid not null,
 stop_name text not null check(length(btrim(stop_name))>0), stop_order integer not null check(stop_order>0),
 pickup_time time, drop_time time, created_at timestamptz not null default now(),
 unique(school_id,id), unique(school_id,route_id,stop_order),
 foreign key(school_id,route_id) references public.school_transport_routes(school_id,id) on delete cascade
);
create table if not exists public.school_transport_buses (
 id uuid primary key default gen_random_uuid(), school_id text not null, route_id uuid not null,
 registration_number text not null check(length(btrim(registration_number))>0), capacity integer not null default 40 check(capacity between 1 and 100),
 driver_person_id text, cleaner_person_id text, status text not null default 'active' check(status in ('active','maintenance','inactive')),
 notes text, created_by uuid default auth.uid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(school_id,id), unique(school_id,registration_number),
 foreign key(school_id,route_id) references public.school_transport_routes(school_id,id) on delete restrict,
 foreign key(school_id,driver_person_id) references public.school_people(school_id,person_id) on delete restrict,
 foreign key(school_id,cleaner_person_id) references public.school_people(school_id,person_id) on delete restrict
);
create table if not exists public.school_transport_allotments (
 id uuid primary key default gen_random_uuid(), school_id text not null, student_person_id text not null, route_id uuid not null, bus_id uuid not null,
 pickup_stop_id uuid, monthly_fee numeric(10,2) not null default 0 check(monthly_fee>=0),
 status text not null default 'active' check(status in ('active','paused','withdrawn')),
 start_date date not null default current_date, end_date date, notes text, created_by uuid default auth.uid(),
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
 unique(school_id,student_person_id),
 foreign key(school_id,student_person_id) references public.school_people(school_id,person_id) on delete cascade,
 foreign key(school_id,route_id) references public.school_transport_routes(school_id,id) on delete restrict,
 foreign key(school_id,bus_id) references public.school_transport_buses(school_id,id) on delete restrict,
 foreign key(school_id,pickup_stop_id) references public.school_transport_stops(school_id,id) on delete restrict
);
create index if not exists school_transport_stops_route_idx on public.school_transport_stops(school_id,route_id,stop_order);
create index if not exists school_transport_buses_route_idx on public.school_transport_buses(school_id,route_id);
create index if not exists school_transport_allotments_bus_idx on public.school_transport_allotments(school_id,bus_id,status);
create index if not exists school_transport_allotments_route_idx on public.school_transport_allotments(school_id,route_id,status);
alter table public.school_transport_routes enable row level security;
alter table public.school_transport_stops enable row level security;
alter table public.school_transport_buses enable row level security;
alter table public.school_transport_allotments enable row level security;
grant select,insert,update,delete on public.school_transport_routes,public.school_transport_stops,public.school_transport_buses,public.school_transport_allotments to authenticated;
create policy "School users access transport routes" on public.school_transport_routes for all to authenticated
using (exists(select 1 from public.school_tenants t where t.school_id=school_transport_routes.school_id and t.admin_user_id=(select auth.uid())) or exists(select 1 from public.school_user_roles r where r.school_id=school_transport_routes.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.allowed_pages && array['Routes','Buses','Allotment']::text[]))
with check (exists(select 1 from public.school_tenants t where t.school_id=school_transport_routes.school_id and t.admin_user_id=(select auth.uid())) or exists(select 1 from public.school_user_roles r where r.school_id=school_transport_routes.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.allowed_pages && array['Routes','Buses','Allotment']::text[]));
create policy "School users access transport stops" on public.school_transport_stops for all to authenticated
using (exists(select 1 from public.school_tenants t where t.school_id=school_transport_stops.school_id and t.admin_user_id=(select auth.uid())) or exists(select 1 from public.school_user_roles r where r.school_id=school_transport_stops.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.allowed_pages && array['Routes','Buses','Allotment']::text[]))
with check (exists(select 1 from public.school_tenants t where t.school_id=school_transport_stops.school_id and t.admin_user_id=(select auth.uid())) or exists(select 1 from public.school_user_roles r where r.school_id=school_transport_stops.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.allowed_pages && array['Routes','Buses','Allotment']::text[]));
create policy "School users access transport buses" on public.school_transport_buses for all to authenticated
using (exists(select 1 from public.school_tenants t where t.school_id=school_transport_buses.school_id and t.admin_user_id=(select auth.uid())) or exists(select 1 from public.school_user_roles r where r.school_id=school_transport_buses.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.allowed_pages && array['Routes','Buses','Allotment']::text[]))
with check (exists(select 1 from public.school_tenants t where t.school_id=school_transport_buses.school_id and t.admin_user_id=(select auth.uid())) or exists(select 1 from public.school_user_roles r where r.school_id=school_transport_buses.school_id and r.user_id=(select auth.uid()) and r.status='active' and r.allowed_pages && array['Routes','Buses','Allotment']::text[]));
create policy "School users access transport allotments" on public.school_transport_allotments for all to authenticated
using (exists(select 1 from public.school_tenants t where t.school_id=school_transport_allotments.school_id and t.admin_user_id=(select auth.uid())) or exists(select 1 from public.school_user_roles r where r.school_id=school_transport_allotments.school_id and r.user_id=(select auth.uid()) and r.status='active' and 'Allotment'=any(r.allowed_pages)))
with check (exists(select 1 from public.school_tenants t where t.school_id=school_transport_allotments.school_id and t.admin_user_id=(select auth.uid())) or exists(select 1 from public.school_user_roles r where r.school_id=school_transport_allotments.school_id and r.user_id=(select auth.uid()) and r.status='active' and 'Allotment'=any(r.allowed_pages)));
create policy "Transport users read student records for allotment" on public.school_people for select to authenticated
using(record_type='Student' and exists(select 1 from public.school_user_roles r where r.school_id=school_people.school_id and r.user_id=(select auth.uid()) and r.status='active' and 'Allotment'=any(r.allowed_pages)));