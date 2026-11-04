-- Homologation pilot: local DB enforcement for already-issued JWTs.
-- An explicit subject row is required for each linked pilot account. Other
-- accounts keep their current module permissions until onboarded.
begin;

create schema if not exists corporate_gate_private;
revoke all on schema corporate_gate_private from public, anon, authenticated;
grant usage on schema corporate_gate_private to authenticated;

create table public.corporate_gate_subjects (
  auth_user_id uuid primary key,
  allowed boolean not null,
  portal_link_id uuid not null,
  updated_at timestamptz not null default now()
);
alter table public.corporate_gate_subjects enable row level security;
revoke all on public.corporate_gate_subjects from public, anon, authenticated;
grant select, insert, update on public.corporate_gate_subjects to service_role;

create function corporate_gate_private.is_allowed()
returns boolean language sql stable security definer
set search_path = ''
as $$
  select coalesce(
    (select s.allowed from public.corporate_gate_subjects s
      where s.auth_user_id = (select auth.uid())),
    true
  )
$$;
revoke all on function corporate_gate_private.is_allowed() from public, anon, authenticated;
grant execute on function corporate_gate_private.is_allowed() to authenticated;

-- RESTRICTIVE policies compose with each table's existing module RBAC.
-- This never grants a permission, and a revoked pilot subject fails even
-- when its access token is still valid. Include Storage's RLS tables.
do $$
declare target record;
begin
  for target in
    select n.nspname, c.relname
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where c.relkind in ('r','p')
      and c.relrowsecurity
      and (n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects'))
      and not (n.nspname = 'public' and c.relname = 'corporate_gate_subjects')
  loop
    execute format(
      'create policy corporate_link_required on %I.%I as restrictive for all to authenticated using ((select corporate_gate_private.is_allowed())) with check ((select corporate_gate_private.is_allowed()))',
      target.nspname, target.relname
    );
  end loop;
end $$;

commit;
