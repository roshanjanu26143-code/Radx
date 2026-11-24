alter table public.school_bus_gps_devices
  add column if not exists model_name text,
  add column if not exists protocol_type text not null default 'http_json',
  add column if not exists integration_mode text not null default 'device_webhook',
  add column if not exists payload_format text not null default 'json',
  add column if not exists provider_device_id text,
  add column if not exists device_config jsonb not null default '{}'::jsonb;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'school_bus_gps_devices_protocol_type_check') then
    alter table public.school_bus_gps_devices
      add constraint school_bus_gps_devices_protocol_type_check
      check (protocol_type in ('http_json','vendor_cloud','gt06_tcp','tk103_tcp','custom_gateway'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'school_bus_gps_devices_integration_mode_check') then
    alter table public.school_bus_gps_devices
      add constraint school_bus_gps_devices_integration_mode_check
      check (integration_mode in ('device_webhook','vendor_cloud','tcp_gateway','custom_gateway'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'school_bus_gps_devices_payload_format_check') then
    alter table public.school_bus_gps_devices
      add constraint school_bus_gps_devices_payload_format_check
      check (payload_format in ('json','vendor_json','custom_json'));
  end if;
end $$;

create index if not exists school_bus_gps_devices_school_protocol_idx
  on public.school_bus_gps_devices (school_id, protocol_type);
