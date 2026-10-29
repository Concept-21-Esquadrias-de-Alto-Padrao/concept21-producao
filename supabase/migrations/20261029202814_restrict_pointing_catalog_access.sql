-- Pointing-only users receive limited context through the authenticated server
-- data layer. They must not read the full client or contract tables via the API.
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
    )
  );

-- This legacy permissive policy allowed every signed-in user to read all
-- unarchived contracts, regardless of their role. OR-combined policies would
-- otherwise undo the restriction above.
drop policy if exists lifecycle_archive_contract_read on public.production_contracts;

commit;
