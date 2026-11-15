-- Central access is additive; business records and native RBAC remain unchanged.
create schema platform_identity_private;
revoke all on schema platform_identity_private from public,anon,authenticated;
grant usage on schema platform_identity_private to service_role;
create table public.platform_account_bindings(auth_user_id uuid primary key references auth.users(id),portal_auth_user_id uuid not null unique,portal_link_id uuid not null unique,allowed boolean not null default true,updated_at timestamptz not null default now());
create table public.platform_identity_config(key text primary key check(key='central_login'),enabled boolean not null default false,setup_expires_at timestamptz not null default(now()+interval '30 minutes'),setup_claimed_at timestamptz);
create table platform_identity_private.leases(session_id uuid primary key references auth.sessions(id) on delete cascade,auth_user_id uuid not null references auth.users(id),valid_until timestamptz not null);
alter table public.platform_account_bindings enable row level security;
alter table public.platform_identity_config enable row level security;
alter table platform_identity_private.leases enable row level security;
revoke all on public.platform_account_bindings,public.platform_identity_config,platform_identity_private.leases from public,anon,authenticated;
grant all on public.platform_account_bindings,public.platform_identity_config,platform_identity_private.leases to service_role;
insert into public.platform_identity_config(key) values('central_login');

create function platform_identity_private.native_session_valid(p_user uuid,p_subject uuid,p_session uuid) returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.platform_account_bindings b join auth.users a on a.id=b.auth_user_id
 join auth.sessions s on s.user_id=a.id and s.id=p_session
 join public.profiles p on p.user_id=a.id and p.status='active'
 where b.auth_user_id=p_user and b.portal_auth_user_id=p_subject and b.allowed
 and a.email_confirmed_at is not null and (a.banned_until is null or a.banned_until<now())
 and (s.not_after is null or s.not_after>now())
 and exists(select 1 from auth.identities i where i.user_id=a.id and i.provider='custom:concept21-portal' and i.provider_id=p_subject::text)
 and (select count(distinct i.provider_id) from auth.identities i where i.user_id=a.id and i.provider='custom:concept21-portal')=1
 and exists(select 1 from auth.mfa_amr_claims am where am.session_id=s.id and am.authentication_method='oauth'))
$$;
create function platform_identity_private.access_allowed() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select exists(select 1 from public.platform_identity_config c where c.key='central_login' and not c.enabled)
 or exists(select 1 from public.platform_identity_config c,public.platform_account_bindings b,platform_identity_private.leases l
 where c.key='central_login' and c.enabled and b.auth_user_id=auth.uid() and l.auth_user_id=b.auth_user_id
 and l.session_id=(auth.jwt()->>'session_id')::uuid and l.valid_until>now()
 and (auth.jwt()->>'client_id') is null and platform_identity_private.native_session_valid(b.auth_user_id,b.portal_auth_user_id,l.session_id))
$$;
create function platform_identity_private.lease(p_auth_user_id uuid,p_portal_subject uuid,p_session_id uuid) returns boolean
language plpgsql security definer set search_path=pg_catalog,public as $$begin
 if not exists(select 1 from public.platform_identity_config where key='central_login' and enabled)
 or not platform_identity_private.native_session_valid(p_auth_user_id,p_portal_subject,p_session_id) then return false;end if;
 insert into platform_identity_private.leases(session_id,auth_user_id,valid_until)
 values(p_session_id,p_auth_user_id,clock_timestamp()+interval '30 seconds')
 on conflict(session_id) do update set valid_until=excluded.valid_until;return true;end$$;
create function public.platform_identity_lease(p_auth_user_id uuid,p_portal_subject uuid,p_session_id uuid) returns boolean
language sql security invoker set search_path=pg_catalog,public as $$select platform_identity_private.lease(p_auth_user_id,p_portal_subject,p_session_id)$$;
create function public.platform_identity_can_access() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$select platform_identity_private.access_allowed()$$;
create or replace function public.current_auth_email_confirmed() returns boolean
language sql stable security definer set search_path=pg_catalog,public as $$
 select platform_identity_private.access_allowed() and exists(select 1 from auth.users u where u.id=auth.uid() and coalesce(u.email_confirmed_at,u.confirmed_at) is not null)
$$;
create function platform_identity_private.guard_write() returns trigger
language plpgsql security definer set search_path=pg_catalog,public as $$begin
 if not(coalesce(auth.jwt()->>'role'='service_role',false)
 or ((auth.jwt()->>'role') is null and session_user in ('postgres','supabase_admin'))
 or platform_identity_private.access_allowed()) then raise exception 'Acesso pelo Portal indisponível.' using errcode='42501';end if;
 return null;end$$;
-- Restrictive policies also cover policies that do not use the RBAC helpers.
-- Statement triggers protect SECURITY DEFINER writes as well as REST operations.
do $tables$ declare t text;begin
 for t in select tablename from pg_tables where schemaname='public' and tablename not in ('platform_account_bindings','platform_identity_config') loop
  execute format('create policy platform_identity_gate on public.%I as restrictive for all to authenticated using ((select public.platform_identity_can_access())) with check ((select public.platform_identity_can_access()))',t);
  execute format('create trigger platform_identity_write before insert or update or delete on public.%I for each statement execute function platform_identity_private.guard_write()',t);
 end loop;end$tables$;
revoke all on all functions in schema platform_identity_private from public,anon,authenticated;
grant execute on all functions in schema platform_identity_private to service_role;
revoke all on function public.platform_identity_lease(uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.platform_identity_lease(uuid,uuid,uuid) to service_role;
revoke all on function public.platform_identity_can_access() from public;
grant execute on function public.platform_identity_can_access() to anon,authenticated,service_role;
notify pgrst,'reload schema';
