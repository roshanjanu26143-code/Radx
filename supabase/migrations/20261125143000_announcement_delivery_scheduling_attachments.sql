alter table public.school_announcements
  add column if not exists delivery_channels text[] not null default array['in_app','whatsapp','sms']::text[],
  add column if not exists attachments jsonb not null default '[]'::jsonb;
alter table public.school_announcements drop constraint if exists school_announcements_status_check;
alter table public.school_announcements add constraint school_announcements_status_check check(status in ('draft','scheduled','published','archived','expired'));
alter table public.school_announcements add constraint school_announcements_delivery_channels_check check(delivery_channels <@ array['in_app','whatsapp','sms','push']::text[] and cardinality(delivery_channels)>0);

create table if not exists public.school_announcement_deliveries(
 id uuid primary key default gen_random_uuid(),school_id text not null references public.school_tenants(school_id) on delete cascade,
 announcement_id uuid not null references public.school_announcements(id) on delete cascade,student_person_id text,recipient_name text,
 recipient_phone text not null,channel text not null check(channel in('in_app','whatsapp','sms','push')),
 status text not null default 'pending' check(status in('pending','processing','sent','failed','skipped')),
 provider_message_id text,attempts integer not null default 0 check(attempts between 0 and 10),last_error text,
 next_attempt_at timestamptz not null default now(),sent_at timestamptz,created_at timestamptz not null default now(),
 unique(announcement_id,recipient_phone,channel)
);
create index if not exists school_announcement_deliveries_queue_idx on public.school_announcement_deliveries(status,next_attempt_at,created_at) where status in('pending','processing');
create index if not exists school_announcement_deliveries_school_idx on public.school_announcement_deliveries(school_id,announcement_id);
create table if not exists public.school_parent_inbox(
 id uuid primary key default gen_random_uuid(),school_id text not null references public.school_tenants(school_id) on delete cascade,
 announcement_id uuid not null references public.school_announcements(id) on delete cascade,student_person_id text,recipient_name text,
 recipient_phone text not null,title text not null,body text not null,attachments jsonb not null default '[]'::jsonb,
 read_at timestamptz,created_at timestamptz not null default now(),unique(announcement_id,recipient_phone)
);
create index if not exists school_parent_inbox_phone_idx on public.school_parent_inbox(school_id,recipient_phone,created_at desc);
create table if not exists public.school_parent_push_subscriptions(
 id uuid primary key default gen_random_uuid(),school_id text not null references public.school_tenants(school_id) on delete cascade,
 recipient_phone text not null,subscription jsonb not null,user_agent text,created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),unique(school_id,recipient_phone)
);
alter table public.school_announcement_deliveries enable row level security;
alter table public.school_parent_inbox enable row level security;
alter table public.school_parent_push_subscriptions enable row level security;
grant select on public.school_announcement_deliveries,public.school_parent_inbox to authenticated;
revoke all on public.school_parent_push_subscriptions from anon,authenticated;
grant all on public.school_announcement_deliveries,public.school_parent_inbox,public.school_parent_push_subscriptions to service_role;

drop policy if exists "Announcement managers read delivery log" on public.school_announcement_deliveries;
create policy "Announcement managers read delivery log" on public.school_announcement_deliveries for select to authenticated using(
 private.is_school_admin(school_id) or exists(select 1 from public.school_user_roles r where r.school_id=school_announcement_deliveries.school_id
 and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Announcements'=any(r.allowed_pages)));
drop policy if exists "Announcement managers read parent inbox" on public.school_parent_inbox;
create policy "Announcement managers read parent inbox" on public.school_parent_inbox for select to authenticated using(
 private.is_school_admin(school_id) or exists(select 1 from public.school_user_roles r where r.school_id=school_parent_inbox.school_id
 and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Announcements'=any(r.allowed_pages)));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('school-announcements','school-announcements',false,10485760,array['application/pdf','image/jpeg','image/png','image/webp',
'application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict(id) do update set public=false,file_size_limit=10485760,allowed_mime_types=excluded.allowed_mime_types;
drop policy if exists "Announcement managers read files" on storage.objects;
create policy "Announcement managers read files" on storage.objects for select to authenticated using(bucket_id='school-announcements' and(
 private.is_school_admin((storage.foldername(name))[1]) or exists(select 1 from public.school_user_roles r where r.school_id=(storage.foldername(name))[1]
 and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Announcements'=any(r.allowed_pages))));
drop policy if exists "Announcement managers upload files" on storage.objects;
create policy "Announcement managers upload files" on storage.objects for insert to authenticated with check(bucket_id='school-announcements' and(
 private.is_school_admin((storage.foldername(name))[1]) or exists(select 1 from public.school_user_roles r where r.school_id=(storage.foldername(name))[1]
 and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Announcements'=any(r.allowed_pages))));
drop policy if exists "Announcement managers delete files" on storage.objects;
create policy "Announcement managers delete files" on storage.objects for delete to authenticated using(bucket_id='school-announcements' and(
 private.is_school_admin((storage.foldername(name))[1]) or exists(select 1 from public.school_user_roles r where r.school_id=(storage.foldername(name))[1]
 and r.user_id=(select auth.uid()) and r.status='active' and r.role<>'Teacher' and 'Announcements'=any(r.allowed_pages))));

create or replace function private.enqueue_school_announcement_deliveries()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.status<>'published' then return new; end if;
 if tg_op='UPDATE' and old.status='published' then return new; end if;
 insert into public.school_announcement_deliveries(school_id,announcement_id,student_person_id,recipient_name,recipient_phone,channel)
 select distinct new.school_id,new.id,p.person_id,coalesce(nullif(p.details->>'name',''),p.full_name),
 case when length(ph.digits)=10 then '+91'||ph.digits else '+'||ph.digits end,ch.channel
 from public.school_people p
 cross join lateral(values(p.details->>'father_phone'),(p.details->>'mother_phone'),(p.details->>'guardian_phone'),(p.details->>'primary_contact')) raw_phone(value)
 cross join lateral(select regexp_replace(coalesce(raw_phone.value,''),'[^0-9]','','g') digits) ph
 cross join lateral unnest(new.delivery_channels) ch(channel)
 where p.school_id=new.school_id and p.record_type='Student' and length(ph.digits) between 10 and 15
 and(new.audience_type='all' or(p.details->>'joining_standard'=new.standard_name and(new.audience_type='standard' or p.details->>'section'=new.section_name)))
 on conflict(announcement_id,recipient_phone,channel) do nothing;
 insert into public.school_parent_inbox(school_id,announcement_id,student_person_id,recipient_name,recipient_phone,title,body,attachments)
 select d.school_id,d.announcement_id,d.student_person_id,d.recipient_name,d.recipient_phone,new.title,new.body,new.attachments
 from public.school_announcement_deliveries d where d.announcement_id=new.id and d.channel='in_app'
 on conflict(announcement_id,recipient_phone) do nothing;
 update public.school_announcement_deliveries set status='sent',sent_at=now(),last_error=null
 where announcement_id=new.id and channel='in_app' and status='pending';
 return new;
end; $$;
revoke all on function private.enqueue_school_announcement_deliveries() from public,anon,authenticated;
drop trigger if exists trg_enqueue_school_announcement_deliveries on public.school_announcements;
create trigger trg_enqueue_school_announcement_deliveries after insert or update of status on public.school_announcements
for each row execute function private.enqueue_school_announcement_deliveries();

create or replace function public.process_due_school_announcements()
returns integer language plpgsql security definer set search_path='' as $$
declare changed integer:=0;
begin
 update public.school_announcements set status='expired',updated_at=now() where status='scheduled' and expires_at is not null and expires_at<=now();
 update public.school_announcements set status='published',published_at=now(),updated_at=now()
 where status='scheduled' and scheduled_for<=now() and(expires_at is null or expires_at>now());
 get diagnostics changed=row_count; return changed;
end; $$;
revoke all on function public.process_due_school_announcements() from public,anon,authenticated;
grant execute on function public.process_due_school_announcements() to service_role;

create or replace function public.claim_school_announcement_deliveries(batch_size integer default 40)
returns setof public.school_announcement_deliveries language sql security definer set search_path='' as $$
 with picked as(select id from public.school_announcement_deliveries where status='pending' and attempts<5 and next_attempt_at<=now()
 order by created_at for update skip locked limit greatest(1,least(batch_size,100)))
 update public.school_announcement_deliveries d set status='processing',attempts=d.attempts+1 from picked where d.id=picked.id returning d.*;
$$;
revoke all on function public.claim_school_announcement_deliveries(integer) from public,anon,authenticated;
grant execute on function public.claim_school_announcement_deliveries(integer) to service_role;
create or replace function public.finish_school_announcement_delivery(p_delivery_id uuid,p_status text,p_provider_message_id text default null,p_error text default null)
returns void language plpgsql security definer set search_path='' as $$
begin
 if p_status not in('sent','failed','skipped') then raise exception 'Invalid delivery result'; end if;
 update public.school_announcement_deliveries set status=case when p_status='failed' and attempts<5 then 'pending' else p_status end,
 provider_message_id=coalesce(p_provider_message_id,provider_message_id),last_error=left(p_error,1000),
 sent_at=case when p_status='sent' then now() else sent_at end,
 next_attempt_at=case when p_status='failed' and attempts<5 then now()+make_interval(secs=>least(3600,(power(2,attempts)::integer)*60)) else next_attempt_at end
 where id=p_delivery_id and status='processing';
end; $$;
revoke all on function public.finish_school_announcement_delivery(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.finish_school_announcement_delivery(uuid,text,text,text) to service_role;

create extension if not exists pg_cron;
create extension if not exists pg_net;
do $$ begin
 if not exists(select 1 from cron.job where jobname='radx-publish-due-announcements') then
  perform cron.schedule('radx-publish-due-announcements','* * * * *','select public.process_due_school_announcements();');
 end if;
 if not exists(select 1 from cron.job where jobname='radx-dispatch-announcement-deliveries') then
  perform cron.schedule('radx-dispatch-announcement-deliveries','* * * * *',
   $job$select net.http_post(url:='https://rofbsjdsxqwbccnoyvyp.supabase.co/functions/v1/dispatch-announcement-deliveries',
   headers:='{"Content-Type":"application/json"}'::jsonb,body:='{"source":"cron"}'::jsonb,timeout_milliseconds:=10000);$job$);
 end if;
end $$;

drop policy if exists "No client access to parent push subscriptions" on public.school_parent_push_subscriptions;
create policy "No client access to parent push subscriptions" on public.school_parent_push_subscriptions for all to anon,authenticated using(false) with check(false);
