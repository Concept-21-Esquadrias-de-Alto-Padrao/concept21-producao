begin;

alter table public.logistics_vehicles
  add column if not exists vehicle_kind text not null default 'veiculo';

alter table public.logistics_vehicles
  drop constraint if exists logistics_vehicles_vehicle_kind_check;

alter table public.logistics_vehicles
  add constraint logistics_vehicles_vehicle_kind_check
  check (vehicle_kind in ('veiculo', 'carretinha'));

update public.logistics_vehicles
set vehicle_kind = 'veiculo'
where vehicle_kind is null;

alter table public.freights
  add column if not exists trailer_vehicle_id uuid references public.logistics_vehicles(id) on delete set null,
  add column if not exists trailer text,
  add column if not exists trailer_plate text,
  add column if not exists trailer_wear_cost numeric(12, 2) not null default 0 check (trailer_wear_cost >= 0),
  add column if not exists trailer_wear_cost_snapshot numeric(12, 2) not null default 0 check (trailer_wear_cost_snapshot >= 0);

create table if not exists public.production_indirect_activity_reasons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  label text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists production_indirect_activity_reasons_unique_label_idx
  on public.production_indirect_activity_reasons(company_id, lower(label));

create index if not exists production_indirect_activity_reasons_company_idx
  on public.production_indirect_activity_reasons(company_id, active, sort_order, label);

drop trigger if exists production_indirect_activity_reasons_set_updated_at
  on public.production_indirect_activity_reasons;
create trigger production_indirect_activity_reasons_set_updated_at
before update on public.production_indirect_activity_reasons
for each row execute function public.set_updated_at();

create table if not exists public.production_indirect_activity_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  operator_id uuid not null references public.production_operators(id) on delete restrict,
  reason_id uuid references public.production_indirect_activity_reasons(id) on delete set null,
  session_profile_id uuid references public.profiles(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  status text not null default 'em_andamento' check (status in ('em_andamento', 'concluida', 'cancelada')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  total_seconds integer not null default 0 check (total_seconds >= 0),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists production_indirect_activity_sessions_company_operator_idx
  on public.production_indirect_activity_sessions(company_id, operator_id, started_at desc);

create index if not exists production_indirect_activity_sessions_company_started_idx
  on public.production_indirect_activity_sessions(company_id, started_at desc);

create unique index if not exists production_indirect_activity_sessions_active_operator_idx
  on public.production_indirect_activity_sessions(company_id, operator_id)
  where status = 'em_andamento';

insert into public.permissions (key, description)
values
  ('production.pointing.manage_reasons', 'Gerenciar motivos de pausa, pendência e atividades indiretas de apontamento')
on conflict (key) do update
set description = excluded.description;

insert into public.role_permissions (company_id, role_id, permission_id)
select role.company_id, role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.is_master_role = true
  and permission.key = 'production.pointing.manage_reasons'
on conflict do nothing;

drop trigger if exists production_indirect_activity_sessions_set_updated_at
  on public.production_indirect_activity_sessions;
create trigger production_indirect_activity_sessions_set_updated_at
before update on public.production_indirect_activity_sessions
for each row execute function public.set_updated_at();

alter table public.production_indirect_activity_reasons enable row level security;
alter table public.production_indirect_activity_sessions enable row level security;

drop policy if exists production_indirect_activity_reasons_read
  on public.production_indirect_activity_reasons;
create policy production_indirect_activity_reasons_read on public.production_indirect_activity_reasons
for select
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.view')
    or public.has_permission('production.pointing.perform')
    or public.has_permission('production.pointing.manage_reasons')
    or public.has_permission('production.reports.view')
  )
);

drop policy if exists production_indirect_activity_reasons_insert
  on public.production_indirect_activity_reasons;
create policy production_indirect_activity_reasons_insert on public.production_indirect_activity_reasons
for insert
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.manage_reasons')
  )
);

drop policy if exists production_indirect_activity_reasons_update
  on public.production_indirect_activity_reasons;
create policy production_indirect_activity_reasons_update on public.production_indirect_activity_reasons
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

drop policy if exists production_indirect_activity_sessions_read
  on public.production_indirect_activity_sessions;
create policy production_indirect_activity_sessions_read on public.production_indirect_activity_sessions
for select
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.dashboard.view')
    or public.has_permission('production.pointing.view')
    or public.has_permission('production.pointing.perform')
    or public.has_permission('production.reports.view')
  )
);

drop policy if exists production_indirect_activity_sessions_insert
  on public.production_indirect_activity_sessions;
create policy production_indirect_activity_sessions_insert on public.production_indirect_activity_sessions
for insert
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.perform')
  )
);

drop policy if exists production_indirect_activity_sessions_update
  on public.production_indirect_activity_sessions;
create policy production_indirect_activity_sessions_update on public.production_indirect_activity_sessions
for update
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.perform')
  )
)
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.perform')
  )
);

insert into public.production_indirect_activity_reasons (
  company_id,
  label,
  description,
  sort_order
)
select company.id, reason.label, reason.description, reason.sort_order
from public.companies company
cross join (
  values
    ('Organização do setor', 'Organização e preparação do posto de trabalho.', 10),
    ('Limpeza', 'Limpeza operacional do setor ou equipamento.', 20),
    ('Separação de materiais', 'Separação de materiais fora de uma peça específica.', 30),
    ('Apoio a outro setor', 'Apoio operacional fora da etapa principal do operador.', 40),
    ('Manutenção de equipamento', 'Apoio, ajuste ou acompanhamento de manutenção.', 50),
    ('Reunião ou treinamento', 'Reunião, orientação ou treinamento interno.', 60),
    ('Atividade administrativa', 'Atividade administrativa necessária durante a jornada.', 70),
    ('Aguardando orientação', 'Tempo registrado aguardando direcionamento da liderança.', 80)
) as reason(label, description, sort_order)
on conflict do nothing;

commit;
