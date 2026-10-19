begin;

alter table public.logistics_drivers
  add column if not exists hourly_cost numeric(12, 2) not null default 0 check (hourly_cost >= 0),
  add column if not exists can_drive boolean not null default true,
  add column if not exists can_help boolean not null default false;

alter table public.logistics_vehicles
  add column if not exists ownership_type text not null default 'terceiro' check (ownership_type in ('proprio', 'terceiro')),
  add column if not exists fuel_consumption_km_l numeric(12, 2) not null default 0 check (fuel_consumption_km_l >= 0),
  add column if not exists fuel_price_per_liter numeric(12, 2) not null default 0 check (fuel_price_per_liter >= 0),
  add column if not exists wear_cost_per_km numeric(12, 2) not null default 0 check (wear_cost_per_km >= 0);

alter table public.freights
  add column if not exists execution_type text not null default 'terceirizado' check (execution_type in ('terceirizado', 'veiculo_proprio')),
  add column if not exists distance_km numeric(12, 2) not null default 0 check (distance_km >= 0),
  add column if not exists estimated_hours numeric(12, 2) not null default 0 check (estimated_hours >= 0),
  add column if not exists helper_hours numeric(12, 2) not null default 0 check (helper_hours >= 0),
  add column if not exists fuel_cost numeric(12, 2) not null default 0 check (fuel_cost >= 0),
  add column if not exists driver_labor_cost numeric(12, 2) not null default 0 check (driver_labor_cost >= 0),
  add column if not exists helper_labor_cost numeric(12, 2) not null default 0 check (helper_labor_cost >= 0),
  add column if not exists vehicle_wear_cost numeric(12, 2) not null default 0 check (vehicle_wear_cost >= 0),
  add column if not exists internal_total_cost numeric(12, 2) not null default 0 check (internal_total_cost >= 0),
  add column if not exists driver_hourly_cost_snapshot numeric(12, 2) not null default 0 check (driver_hourly_cost_snapshot >= 0),
  add column if not exists vehicle_consumption_snapshot numeric(12, 2) not null default 0 check (vehicle_consumption_snapshot >= 0),
  add column if not exists fuel_price_snapshot numeric(12, 2) not null default 0 check (fuel_price_snapshot >= 0),
  add column if not exists wear_cost_snapshot numeric(12, 2) not null default 0 check (wear_cost_snapshot >= 0);

create table if not exists public.freight_route_helpers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  freight_id uuid not null references public.freights(id) on delete cascade,
  helper_id uuid references public.logistics_drivers(id) on delete set null,
  helper_name text not null,
  hourly_cost_snapshot numeric(12, 2) not null default 0 check (hourly_cost_snapshot >= 0),
  hours numeric(12, 2) not null default 0 check (hours >= 0),
  total_cost numeric(12, 2) not null default 0 check (total_cost >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, freight_id, helper_id)
);

create index if not exists freight_route_helpers_freight_idx
  on public.freight_route_helpers(freight_id);

alter table public.freight_route_helpers enable row level security;

drop policy if exists freight_route_helpers_read on public.freight_route_helpers;
create policy freight_route_helpers_read on public.freight_route_helpers
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.routes.view')
    or public.has_permission('production.routes.create')
    or public.has_permission('production.routes.edit')
  )
);

drop policy if exists freight_route_helpers_manage on public.freight_route_helpers;
create policy freight_route_helpers_manage on public.freight_route_helpers
for all to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.routes.create')
    or public.has_permission('production.routes.edit')
  )
)
with check (company_id = public.current_company_id());

drop trigger if exists freight_route_helpers_set_updated_at on public.freight_route_helpers;
create trigger freight_route_helpers_set_updated_at
before update on public.freight_route_helpers
for each row execute function public.set_updated_at();

insert into public.permissions (key, description)
values
  ('production.transport.view', 'Visualizar transporte'),
  ('production.transport.manage_costs', 'Gerenciar custos de transporte próprio')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (company_id, role_id, permission_id)
select r.company_id, r.id, p.id
from public.roles r
cross join public.permissions p
where r.is_master_role
  and p.key in (
    'production.transport.view',
    'production.transport.manage_costs'
  )
on conflict do nothing;

commit;
