drop policy if exists prods_delete on public.production_prods;

create policy prods_delete on public.production_prods
for delete to authenticated
using (company_id = public.current_company_id() and public.is_master());

drop policy if exists freights_delete on public.freights;

create policy freights_delete on public.freights
for delete to authenticated
using (company_id = public.current_company_id() and public.is_master());

drop policy if exists prod_stages_update on public.production_prod_stages;

create policy prod_stages_update on public.production_prod_stages
for update to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.prods.update_stage')
    or exists (
      select 1
      from public.production_stages stage
      where stage.id = production_prod_stages.stage_id
        and stage.company_id = production_prod_stages.company_id
        and stage.required_permission is not null
        and public.has_permission(stage.required_permission)
    )
  )
)
with check (company_id = public.current_company_id());

delete from public.role_permissions rp
using public.permissions p
where rp.permission_id = p.id
  and p.key = 'production.prods.delete';

delete from public.permissions
where key = 'production.prods.delete';
