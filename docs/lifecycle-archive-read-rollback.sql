-- Restore only policy definitions; no operational rows or role assignments change.
begin;
set local lock_timeout='5s';
alter policy lifecycle_archive_contract_summary_read on public.production_contract_lifecycle using (production_lifecycle_private.contract_visible(contract_id));
alter policy lifecycle_read on public.production_contract_lifecycle using (((company_id = current_company_id()) AND (production_lifecycle_is_admin() OR has_permission('production.prods.view'::text) OR has_permission('production.contracts.view'::text) OR has_permission('production.pointing.view'::text) OR has_permission('production.pointing.perform'::text) OR has_permission('production.shipping.manage'::text) OR has_permission('production.dashboard.view'::text) OR has_permission('production.reports.view'::text))));
alter policy lifecycle_archive_contract_read on public.production_contracts using (production_lifecycle_private.contract_visible(id));
alter policy lifecycle_archive_event_read on public.production_lifecycle_events using ((production_lifecycle_private.contract_visible(contract_id) AND ((prod_id IS NULL) OR production_lifecycle_private.prod_visible(prod_id))));
alter policy lifecycle_read on public.production_lifecycle_events using (((company_id = current_company_id()) AND (production_lifecycle_is_admin() OR has_permission('production.prods.view'::text) OR has_permission('production.contracts.view'::text) OR has_permission('production.pointing.view'::text) OR has_permission('production.pointing.perform'::text) OR has_permission('production.shipping.manage'::text) OR has_permission('production.dashboard.view'::text) OR has_permission('production.reports.view'::text))));
alter policy lifecycle_archive_child_read on public.production_piece_dispatches using (production_lifecycle_private.prod_visible(prod_id));
alter policy lifecycle_read on public.production_piece_dispatches using (((company_id = current_company_id()) AND (production_lifecycle_is_admin() OR has_permission('production.prods.view'::text) OR has_permission('production.contracts.view'::text) OR has_permission('production.pointing.view'::text) OR has_permission('production.pointing.perform'::text) OR has_permission('production.shipping.manage'::text) OR has_permission('production.dashboard.view'::text) OR has_permission('production.reports.view'::text))));
alter policy lifecycle_archive_child_read on public.production_piece_dispositions using (production_lifecycle_private.prod_visible(prod_id));
alter policy lifecycle_read on public.production_piece_dispositions using (((company_id = current_company_id()) AND (production_lifecycle_is_admin() OR has_permission('production.prods.view'::text) OR has_permission('production.contracts.view'::text) OR has_permission('production.pointing.view'::text) OR has_permission('production.pointing.perform'::text) OR has_permission('production.shipping.manage'::text) OR has_permission('production.dashboard.view'::text) OR has_permission('production.reports.view'::text))));
alter policy lifecycle_archive_child_read on public.production_piece_imports using (production_lifecycle_private.prod_visible(prod_id));
alter policy lifecycle_archive_child_read on public.production_piece_reworks using (production_lifecycle_private.prod_visible(prod_id));
alter policy lifecycle_archive_child_read on public.production_prod_document_checks using (production_lifecycle_private.prod_visible(prod_id));
alter policy lifecycle_archive_prod_summary_read on public.production_prod_lifecycle using (production_lifecycle_private.prod_visible(prod_id));
alter policy lifecycle_read on public.production_prod_lifecycle using (((company_id = current_company_id()) AND (production_lifecycle_is_admin() OR has_permission('production.prods.view'::text) OR has_permission('production.contracts.view'::text) OR has_permission('production.pointing.view'::text) OR has_permission('production.pointing.perform'::text) OR has_permission('production.shipping.manage'::text) OR has_permission('production.dashboard.view'::text) OR has_permission('production.reports.view'::text))));
alter policy lifecycle_archive_child_read on public.production_prod_materials using (production_lifecycle_private.prod_visible(prod_id));
alter policy lifecycle_archive_child_read on public.production_prod_piece_stages using (production_lifecycle_private.prod_visible(prod_id));
alter policy lifecycle_archive_child_read on public.production_prod_pieces using (production_lifecycle_private.prod_visible(prod_id));
alter policy lifecycle_archive_child_read on public.production_prod_selected_items using (production_lifecycle_private.prod_visible(prod_id));
alter policy lifecycle_archive_child_read on public.production_prod_stages using (production_lifecycle_private.prod_visible(prod_id));
alter policy lifecycle_archive_prod_read on public.production_prods using (production_lifecycle_private.prod_visible(id));
alter policy lifecycle_archive_child_read on public.production_shipping_records using (production_lifecycle_private.prod_visible(prod_id));
alter policy lifecycle_archive_child_read on public.production_stage_time_entries using (production_lifecycle_private.prod_visible(prod_id));
revoke execute on function production_lifecycle_private.visible_contract_ids(), production_lifecycle_private.visible_prod_ids() from authenticated,service_role;
commit;

