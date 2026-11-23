alter table public.school_workspace_state
  add column if not exists session_settings jsonb not null default '{}'::jsonb
  check (jsonb_typeof(session_settings) = 'object');
