begin;

alter table public.production_stage_time_entries
  drop constraint if exists production_stage_time_entries_action_check;

alter table public.production_stage_time_entries
  add constraint production_stage_time_entries_action_check
  check (action in ('iniciar', 'pausar', 'retomar', 'concluir', 'pendencia', 'retornar'));

drop policy if exists production_stage_time_entries_insert on public.production_stage_time_entries;
create policy production_stage_time_entries_insert on public.production_stage_time_entries
for insert
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.perform')
    or public.has_permission('production.pointing.rollback')
  )
);

insert into public.permissions (key, description)
values
  ('production.pointing.rollback', 'Corrigir retorno de etapas de apontamento')
on conflict (key) do update
set description = excluded.description;

insert into public.role_permissions (company_id, role_id, permission_id)
select role.company_id, role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.is_master_role = true
  and permission.key = 'production.pointing.rollback'
on conflict do nothing;

commit;
