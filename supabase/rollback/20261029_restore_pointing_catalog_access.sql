-- Emergency rollback of 20261029202814_restrict_pointing_catalog_access.sql.
-- This restores the former broad permissions; use only if the pointing queue
-- cannot be recovered by fixing the application. It changes no business data.
begin;

drop policy if exists clients_read on public.clients;
create policy clients_read on public.clients
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.is_master()
      or public.has_permission('production.clients.view')
      or public.has_permission('production.prods.view')
      or public.has_permission('production.pointing.view')
    )
  );

drop policy if exists contracts_read on public.production_contracts;
create policy contracts_read on public.production_contracts
  for select to authenticated
  using (
    company_id = public.current_company_id()
    and (
      public.is_master()
      or public.has_permission('production.contracts.view')
      or public.has_permission('production.prods.view')
      or public.has_permission('production.pointing.view')
    )
  );

create policy lifecycle_archive_contract_read on public.production_contracts
  for select to authenticated
  using (id in (select production_lifecycle_private.visible_contract_ids()));

commit;
