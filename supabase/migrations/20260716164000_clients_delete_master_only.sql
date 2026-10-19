begin;

drop policy if exists clients_delete on public.clients;

create policy clients_delete on public.clients
for delete to authenticated
using (company_id = public.current_company_id() and public.is_master());

delete from public.role_permissions rp
using public.permissions p
where rp.permission_id = p.id
  and p.key = 'production.clients.delete';

delete from public.permissions
where key = 'production.clients.delete';

commit;
