begin;

create table if not exists public.production_pointing_reasons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('pausa', 'pendencia')),
  label text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists production_pointing_reasons_unique_label_idx
  on public.production_pointing_reasons(company_id, kind, lower(label));

create index if not exists production_pointing_reasons_company_kind_idx
  on public.production_pointing_reasons(company_id, kind, active, sort_order, label);

drop trigger if exists production_pointing_reasons_set_updated_at
  on public.production_pointing_reasons;
create trigger production_pointing_reasons_set_updated_at
before update on public.production_pointing_reasons
for each row execute function public.set_updated_at();

alter table public.production_stage_time_entries
  add column if not exists pointing_reason_id uuid
  references public.production_pointing_reasons(id) on delete set null;

alter table public.production_pointing_sessions
  add column if not exists pointing_reason_id uuid
  references public.production_pointing_reasons(id) on delete set null;

create index if not exists production_stage_time_entries_pointing_reason_idx
  on public.production_stage_time_entries(company_id, pointing_reason_id);

create index if not exists production_pointing_sessions_pointing_reason_idx
  on public.production_pointing_sessions(company_id, pointing_reason_id);

alter table public.production_pointing_reasons enable row level security;

drop policy if exists production_pointing_reasons_read on public.production_pointing_reasons;
create policy production_pointing_reasons_read on public.production_pointing_reasons
for select
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.view')
    or public.has_permission('production.pointing.perform')
    or public.has_permission('production.pointing.manage_operators')
    or public.has_permission('production.pointing.manage_reasons')
    or public.has_permission('production.reports.view')
  )
);

drop policy if exists production_pointing_reasons_insert on public.production_pointing_reasons;
create policy production_pointing_reasons_insert on public.production_pointing_reasons
for insert
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.manage_reasons')
  )
);

drop policy if exists production_pointing_reasons_update on public.production_pointing_reasons;
create policy production_pointing_reasons_update on public.production_pointing_reasons
for update
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.manage_reasons')
  )
)
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.manage_reasons')
  )
);

insert into public.permissions (key, description)
values
  ('production.pointing.manage_reasons', 'Gerenciar motivos de pausa e pendência de apontamento')
on conflict (key) do update
set description = excluded.description;

insert into public.role_permissions (company_id, role_id, permission_id)
select role.company_id, role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.is_master_role = true
  and permission.key = 'production.pointing.manage_reasons'
on conflict do nothing;

insert into public.production_pointing_reasons (
  company_id,
  kind,
  label,
  description,
  sort_order
)
select company.id, reason.kind, reason.label, reason.description, reason.sort_order
from public.companies company
cross join (
  values
    ('pausa', 'Intervalo', 'Parada de rotina do operador.', 10),
    ('pausa', 'Aguardando material', 'Produção parada aguardando material ou componente.', 20),
    ('pausa', 'Aguardando orientação', 'Produção parada aguardando definição da liderança.', 30),
    ('pausa', 'Manutenção de equipamento', 'Parada por ajuste ou manutenção de máquina/equipamento.', 40),
    ('pendencia', 'Material danificado', 'Peça ou material identificado com avaria.', 10),
    ('pendencia', 'Medida divergente', 'Dimensão divergente do projeto/lista técnica.', 20),
    ('pendencia', 'Peça faltando', 'Peça, componente ou acessório não localizado.', 30),
    ('pendencia', 'Retrabalho necessário', 'Peça precisa de correção antes de avançar.', 40),
    ('pendencia', 'Aguardando conferência', 'Pendência aguardando análise/conferência responsável.', 50)
) as reason(kind, label, description, sort_order)
on conflict do nothing;

commit;
