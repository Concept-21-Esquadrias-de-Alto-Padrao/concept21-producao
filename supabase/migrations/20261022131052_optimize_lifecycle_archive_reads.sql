-- Compute the current session's visible scope once per SQL statement.
-- Same tenant/archive predicates as contract_visible/prod_visible; all existing
-- permissive policies and mutation checks remain in place. No operational rows change.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '30s';

create function production_lifecycle_private.visible_contract_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
 with context as materialized (
  select (select auth.uid()) as user_id,
         (select public.current_company_id()) as company_id,
         (select production_lifecycle_private.is_admin()) as is_admin
 )
 select c.id from public.production_contracts c cross join context ctx
 where ctx.user_id is not null and c.company_id=ctx.company_id
 and (ctx.is_admin or not exists (
  select 1 from public.production_contract_lifecycle l
  where l.contract_id=c.id and l.archived_at is not null
 ));
$$;
create function production_lifecycle_private.visible_prod_ids()
returns setof uuid language sql stable security definer set search_path = '' as $$
 with context as materialized (
  select (select auth.uid()) as user_id,
         (select public.current_company_id()) as company_id,
         (select production_lifecycle_private.is_admin()) as is_admin
 )
 select p.id from public.production_prods p
 join public.production_contracts c on c.id=p.contract_id
 cross join context ctx
 where ctx.user_id is not null
 and p.company_id=ctx.company_id and c.company_id=ctx.company_id
 and (ctx.is_admin or (
  not exists(select 1 from public.production_contract_lifecycle l
   where l.contract_id=c.id and l.archived_at is not null)
  and not exists(select 1 from public.production_prod_lifecycle l
   where l.prod_id=p.id and l.archived_at is not null)
 ));
$$;
revoke all on function production_lifecycle_private.visible_contract_ids(),
 production_lifecycle_private.visible_prod_ids() from public,anon,authenticated;
grant execute on function production_lifecycle_private.visible_contract_ids(),
 production_lifecycle_private.visible_prod_ids() to authenticated,service_role;

alter policy lifecycle_archive_contract_read on public.production_contracts
 using (id in (select production_lifecycle_private.visible_contract_ids()));
alter policy lifecycle_archive_prod_read on public.production_prods
 using (id in (select production_lifecycle_private.visible_prod_ids()));
alter policy lifecycle_archive_contract_summary_read on public.production_contract_lifecycle
 using (contract_id in (select production_lifecycle_private.visible_contract_ids()));
alter policy lifecycle_archive_prod_summary_read on public.production_prod_lifecycle
 using (prod_id in (select production_lifecycle_private.visible_prod_ids()));
do $$ declare t text; begin
 foreach t in array array['production_prod_pieces','production_prod_piece_stages',
  'production_prod_stages','production_prod_materials','production_piece_reworks',
  'production_prod_document_checks','production_prod_selected_items',
  'production_shipping_records','production_piece_imports','production_stage_time_entries',
  'production_piece_dispatches','production_piece_dispositions'] loop
  execute format('alter policy lifecycle_archive_child_read on public.%I using
   (prod_id in (select production_lifecycle_private.visible_prod_ids()))',t);
 end loop;
end $$;
alter policy lifecycle_archive_event_read on public.production_lifecycle_events
 using (contract_id in (select production_lifecycle_private.visible_contract_ids())
  and (prod_id is null or prod_id in (select production_lifecycle_private.visible_prod_ids())));

-- Session-only checks in the new ledger's allow policies also become initPlans.
do $$ declare t text; begin
 foreach t in array array['production_prod_lifecycle','production_contract_lifecycle',
  'production_piece_dispositions','production_piece_dispatches','production_lifecycle_events'] loop
  execute format('alter policy lifecycle_read on public.%I using (
   company_id=(select public.current_company_id()) and (
    (select public.production_lifecycle_is_admin())
    or (select public.has_permission(''production.prods.view''))
    or (select public.has_permission(''production.contracts.view''))
    or (select public.has_permission(''production.pointing.view''))
    or (select public.has_permission(''production.pointing.perform''))
    or (select public.has_permission(''production.shipping.manage''))
    or (select public.has_permission(''production.dashboard.view''))
    or (select public.has_permission(''production.reports.view''))
   ))',t);
 end loop;
end $$;
commit;

