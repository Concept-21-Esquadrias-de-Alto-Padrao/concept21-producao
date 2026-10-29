-- Restrict the two production views to the invoking user's RLS context.
-- No table rows, pieces or pointings are modified.
begin;

alter view public.production_prod_overview set (security_invoker = true);
alter view public.dashboard_production_summary set (security_invoker = true);

revoke all privileges on table
  public.production_prod_overview,
  public.dashboard_production_summary
from anon, public;

grant select on table
  public.production_prod_overview,
  public.dashboard_production_summary
to authenticated, service_role;

commit;
