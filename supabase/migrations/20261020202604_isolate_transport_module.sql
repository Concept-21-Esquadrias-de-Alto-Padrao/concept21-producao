-- Production no longer operates transport. Keep tables, functions, records,
-- grants and existing policies for a future, explicitly authorized integration.
-- Apply only with the matching application release and an approved rollout.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

alter table public.production_prods
  disable trigger production_prods_create_freight_demand;

-- initialize_prod_defaults already includes only active stages. Existing PROD
-- stage rows remain intact; no completion, historical date or time is changed.
update public.production_stages
set active = false
where active and (
  required_permission ~ '^production\.(freights|routes|transport|extra_services)\.'
  or required_permission = 'production.settings.manage_logistics'
  or lower(btrim(name)) in ('frete', 'fretes', 'transporte')
);

-- UI/server guards do not protect the direct Data API. Restrictive policies
-- intersect with the existing policies, leaving their definitions and grants
-- untouched. Privileged service-role access remains reserved for integrations.
do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'freights', 'freight_demands', 'freight_stops', 'freight_stop_prods',
    'freight_route_helpers', 'logistics_recipients', 'logistics_drivers',
    'logistics_vehicles', 'logistics_settings', 'extra_service_catalog',
    'extra_service_requests'
  ] loop
    if not exists (
      select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relname = table_name and c.relrowsecurity
    ) then
      raise exception 'Expected RLS-enabled legacy table public.%', table_name;
    end if;
    if not exists (
      select 1 from pg_policies p where p.schemaname = 'public'
        and p.tablename = table_name and p.policyname = 'transport_module_isolated'
    ) then
      execute format(
        'create policy transport_module_isolated on public.%I as restrictive for all to anon, authenticated using (false) with check (false)',
        table_name
      );
    end if;
  end loop;
end;
$$;
commit;
