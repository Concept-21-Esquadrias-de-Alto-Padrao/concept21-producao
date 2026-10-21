-- Read-only preflight. Run in the explicitly selected target; do not db push.
-- These checks identify known prerequisites, not full schema equivalence.
select 'archive_table' as prerequisite,
       to_regclass('public.production_expedition_archives') is not null as ready
union all
select 'archive_rpc',
       to_regprocedure('public.set_expedition_archive(uuid,uuid,uuid[],boolean,text)') is not null
union all
select 'archive_guard', exists (
  select 1 from pg_trigger
  where tgrelid=to_regclass('public.production_prod_piece_stages')
    and tgname='protect_archived_expedition_stage' and tgenabled in ('O','A')
)
union all
select 'freight_creation_disabled', exists (
  select 1 from pg_trigger
  where tgrelid=to_regclass('public.production_prods')
    and tgname='production_prods_create_freight_demand' and tgenabled='D'
)
union all
select 'transport_policies', (
  select count(*)=11 from pg_policies
  where schemaname='public' and policyname='transport_module_isolated'
    and permissive='RESTRICTIVE'
)
union all
select 'lifecycle_not_yet_installed',
       to_regclass('public.production_prod_lifecycle') is null;
