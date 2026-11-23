alter table public.school_user_roles add column if not exists created_by_email text;
create or replace function public.write_school_role_audit_log()
returns trigger language plpgsql security invoker set search_path = '' as $$
declare target_school_id text; target_user_id uuid; target_email text; target_actor uuid; target_actor_email text; audit_action text;
begin
  if tg_op = 'DELETE' then target_school_id:=old.school_id; target_user_id:=old.user_id; target_email:=old.email; target_actor:=old.created_by; target_actor_email:=old.created_by_email; audit_action:='role_user.deleted';
  elsif tg_op = 'UPDATE' then target_school_id:=new.school_id; target_user_id:=new.user_id; target_email:=new.email; target_actor:=new.created_by; target_actor_email:=new.created_by_email; audit_action:='role_user.updated';
  else target_school_id:=new.school_id; target_user_id:=new.user_id; target_email:=new.email; target_actor:=new.created_by; target_actor_email:=new.created_by_email; audit_action:='role_user.created'; end if;
  insert into public.school_audit_logs(school_id,actor_user_id,actor_email,action,entity_type,entity_id,details)
  values(target_school_id,target_actor,target_actor_email,audit_action,'school_user_role',target_user_id::text,
    jsonb_build_object('email',target_email,'role',case when tg_op='DELETE' then old.role else new.role end));
  if tg_op='DELETE' then return old; else return new; end if;
end; $$;