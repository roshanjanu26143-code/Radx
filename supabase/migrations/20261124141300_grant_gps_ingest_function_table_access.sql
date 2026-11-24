grant select, insert, update on public.school_bus_gps_devices to service_role;
grant insert on public.school_bus_gps_positions to service_role;
grant usage, select on sequence public.school_bus_gps_positions_id_seq to service_role;