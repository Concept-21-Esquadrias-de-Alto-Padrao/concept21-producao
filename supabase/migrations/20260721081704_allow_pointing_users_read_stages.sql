begin;

drop policy if exists stage_read_for_prod_users on public.production_stages;

create policy stage_read_for_prod_users on public.production_stages
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.prods.view')
    or public.has_permission('production.pointing.view')
    or public.has_permission('production.pointing.perform')
    or public.has_permission('production.pointing.rollback')
    or public.has_permission('production.pointing.manage_operators')
  )
);

commit;
