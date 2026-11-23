drop policy if exists "School admins can write audit logs" on public.school_audit_logs;
create policy "School admins can write audit logs" on public.school_audit_logs
for insert to authenticated
with check (exists (select 1 from public.school_tenants t where t.school_id=school_audit_logs.school_id and t.admin_user_id=(select auth.uid())));
grant insert on public.school_audit_logs to authenticated;
