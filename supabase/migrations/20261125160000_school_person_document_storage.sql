-- Private, school-scoped student and staff document storage.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('school-person-documents','school-person-documents',false,5242880,array['application/pdf','image/jpeg','image/png'])
on conflict (id) do update set public=false,file_size_limit=5242880,allowed_mime_types=array['application/pdf','image/jpeg','image/png'];

drop policy if exists "School members upload person documents" on storage.objects;
create policy "School members upload person documents"
on storage.objects for insert to authenticated
with check (
 bucket_id='school-person-documents'
 and (storage.foldername(name))[1] is not null
 and (
  exists (select 1 from public.school_tenants t where t.school_id=(storage.foldername(name))[1] and t.admin_user_id=(select auth.uid()))
  or exists (select 1 from public.school_user_roles r where r.school_id=(storage.foldername(name))[1] and r.user_id=(select auth.uid()) and r.status='active'
    and (r.allowed_pages && array['Create Student','Create Teacher','Create Staff','Create Driver & Cleaner']::text[]))
 )
);

drop policy if exists "School members read person documents" on storage.objects;
create policy "School members read person documents"
on storage.objects for select to authenticated
using (
 bucket_id='school-person-documents'
 and (
  exists (select 1 from public.school_tenants t where t.school_id=(storage.foldername(name))[1] and t.admin_user_id=(select auth.uid()))
  or exists (select 1 from public.school_user_roles r where r.school_id=(storage.foldername(name))[1] and r.user_id=(select auth.uid()) and r.status='active'
    and (r.allowed_pages && array['Students Data','Teachers','Staff','Driver & Cleaner','Create Student','Create Teacher','Create Staff','Create Driver & Cleaner']::text[]))
 )
);

drop policy if exists "School admins remove person documents" on storage.objects;
create policy "School admins remove person documents"
on storage.objects for delete to authenticated
using (
 bucket_id='school-person-documents'
 and exists (select 1 from public.school_tenants t where t.school_id=(storage.foldername(name))[1] and t.admin_user_id=(select auth.uid()))
);
