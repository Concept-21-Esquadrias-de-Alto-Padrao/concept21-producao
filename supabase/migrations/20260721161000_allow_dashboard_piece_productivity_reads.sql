begin;

drop policy if exists prod_pieces_read on public.production_prod_pieces;
create policy prod_pieces_read on public.production_prod_pieces
for select
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.dashboard.view')
    or public.has_permission('production.prods.view')
    or public.has_permission('production.pointing.view')
    or public.has_permission('production.reports.view')
    or public.has_permission('production.prods.import_pieces')
  )
);

drop policy if exists prod_piece_stages_read on public.production_prod_piece_stages;
create policy prod_piece_stages_read on public.production_prod_piece_stages
for select
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.dashboard.view')
    or public.has_permission('production.prods.view')
    or public.has_permission('production.pointing.view')
    or public.has_permission('production.reports.view')
  )
);

commit;
