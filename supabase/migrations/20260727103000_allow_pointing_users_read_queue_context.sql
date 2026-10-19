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

drop policy if exists prods_read on public.production_prods;
create policy prods_read on public.production_prods
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.prods.view')
    or public.has_permission('production.pointing.view')
  )
);

commit;
