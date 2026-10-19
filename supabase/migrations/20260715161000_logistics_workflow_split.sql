begin;

create table if not exists public.logistics_recipients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  address text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.logistics_drivers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.logistics_vehicles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  plate text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, plate)
);

create table if not exists public.extra_service_catalog (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text not null,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.freight_demands (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prod_id uuid not null unique references public.production_prods(id) on delete cascade,
  contract_id uuid not null references public.production_contracts(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  planned_date date,
  status text not null default 'previsto' check (
    status in ('previsto', 'em_planejamento', 'incluido_em_rota', 'concluido', 'nao_realizado', 'cancelado')
  ),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.extra_service_requests
  add column if not exists recipient_id uuid references public.logistics_recipients(id) on delete set null,
  add column if not exists service_catalog_id uuid references public.extra_service_catalog(id) on delete set null;

alter table public.freights
  add column if not exists driver_id uuid references public.logistics_drivers(id) on delete set null,
  add column if not exists vehicle_id uuid references public.logistics_vehicles(id) on delete set null;

alter table public.freight_stops
  add column if not exists freight_demand_id uuid references public.freight_demands(id) on delete set null;

alter table public.extra_service_requests
  drop constraint if exists extra_service_requests_status_check;

alter table public.extra_service_requests
  add constraint extra_service_requests_status_check check (
    status in (
      'previsto',
      'em_planejamento',
      'solicitado',
      'aguardando_inclusao_rota',
      'incluido_em_rota',
      'em_andamento',
      'concluido',
      'nao_realizado',
      'cancelado'
    )
  );

alter table public.logistics_recipients enable row level security;
alter table public.logistics_drivers enable row level security;
alter table public.logistics_vehicles enable row level security;
alter table public.extra_service_catalog enable row level security;
alter table public.freight_demands enable row level security;

drop policy if exists logistics_recipients_manage on public.logistics_recipients;
create policy logistics_recipients_manage on public.logistics_recipients
for all to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.settings.manage_logistics')))
with check (company_id = public.current_company_id());

drop policy if exists logistics_recipients_read_active on public.logistics_recipients;
create policy logistics_recipients_read_active on public.logistics_recipients
for select to authenticated
using (
  company_id = public.current_company_id()
  and active
  and (
    public.is_master()
    or public.has_permission('production.settings.manage_logistics')
    or public.has_permission('production.extra_services.view')
    or public.has_permission('production.extra_services.create')
    or public.has_permission('production.routes.view')
    or public.has_permission('production.routes.create')
  )
);

drop policy if exists logistics_drivers_manage on public.logistics_drivers;
create policy logistics_drivers_manage on public.logistics_drivers
for all to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.settings.manage_logistics')))
with check (company_id = public.current_company_id());

drop policy if exists logistics_drivers_read_active on public.logistics_drivers;
create policy logistics_drivers_read_active on public.logistics_drivers
for select to authenticated
using (
  company_id = public.current_company_id()
  and active
  and (
    public.is_master()
    or public.has_permission('production.settings.manage_logistics')
    or public.has_permission('production.routes.view')
    or public.has_permission('production.routes.create')
  )
);

drop policy if exists logistics_vehicles_manage on public.logistics_vehicles;
create policy logistics_vehicles_manage on public.logistics_vehicles
for all to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.settings.manage_logistics')))
with check (company_id = public.current_company_id());

drop policy if exists logistics_vehicles_read_active on public.logistics_vehicles;
create policy logistics_vehicles_read_active on public.logistics_vehicles
for select to authenticated
using (
  company_id = public.current_company_id()
  and active
  and (
    public.is_master()
    or public.has_permission('production.settings.manage_logistics')
    or public.has_permission('production.routes.view')
    or public.has_permission('production.routes.create')
  )
);

drop policy if exists extra_service_catalog_manage on public.extra_service_catalog;
create policy extra_service_catalog_manage on public.extra_service_catalog
for all to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.settings.manage_logistics')))
with check (company_id = public.current_company_id());

drop policy if exists extra_service_catalog_read_active on public.extra_service_catalog;
create policy extra_service_catalog_read_active on public.extra_service_catalog
for select to authenticated
using (
  company_id = public.current_company_id()
  and active
  and (
    public.is_master()
    or public.has_permission('production.settings.manage_logistics')
    or public.has_permission('production.extra_services.view')
    or public.has_permission('production.extra_services.create')
    or public.has_permission('production.routes.view')
    or public.has_permission('production.routes.create')
  )
);

drop policy if exists freight_demands_read on public.freight_demands;
create policy freight_demands_read on public.freight_demands
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.freights.view')
    or public.has_permission('production.routes.view')
    or public.has_permission('production.routes.create')
  )
);

drop policy if exists freight_demands_manage on public.freight_demands;
create policy freight_demands_manage on public.freight_demands
for all to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.freights.edit')
    or public.has_permission('production.routes.create')
    or public.has_permission('production.routes.edit')
  )
)
with check (company_id = public.current_company_id());

drop policy if exists freights_read on public.freights;
create policy freights_read on public.freights
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.freights.view')
    or public.has_permission('production.routes.view')
  )
);

drop policy if exists freights_insert on public.freights;
create policy freights_insert on public.freights
for insert to authenticated
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.freights.create')
    or public.has_permission('production.routes.create')
  )
);

drop policy if exists freights_update on public.freights;
create policy freights_update on public.freights
for update to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.freights.edit')
    or public.has_permission('production.freights.manage_values')
    or public.has_permission('production.routes.edit')
  )
)
with check (company_id = public.current_company_id());

drop policy if exists freight_stops_manage on public.freight_stops;
create policy freight_stops_manage on public.freight_stops
for all to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.freights.manage_route')
    or public.has_permission('production.routes.create')
    or public.has_permission('production.routes.edit')
  )
)
with check (company_id = public.current_company_id());

drop policy if exists freight_stop_prods_manage on public.freight_stop_prods;
create policy freight_stop_prods_manage on public.freight_stop_prods
for all to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.freights.manage_route')
    or public.has_permission('production.routes.create')
    or public.has_permission('production.routes.edit')
  )
)
with check (company_id = public.current_company_id());

drop policy if exists extra_services_update on public.extra_service_requests;
create policy extra_services_update on public.extra_service_requests
for update to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.extra_services.edit')
    or public.has_permission('production.extra_services.cancel')
    or public.has_permission('production.routes.create')
    or public.has_permission('production.routes.edit')
  )
)
with check (company_id = public.current_company_id());

drop trigger if exists logistics_recipients_set_updated_at on public.logistics_recipients;
create trigger logistics_recipients_set_updated_at
before update on public.logistics_recipients
for each row execute function public.set_updated_at();

drop trigger if exists logistics_drivers_set_updated_at on public.logistics_drivers;
create trigger logistics_drivers_set_updated_at
before update on public.logistics_drivers
for each row execute function public.set_updated_at();

drop trigger if exists logistics_vehicles_set_updated_at on public.logistics_vehicles;
create trigger logistics_vehicles_set_updated_at
before update on public.logistics_vehicles
for each row execute function public.set_updated_at();

drop trigger if exists extra_service_catalog_set_updated_at on public.extra_service_catalog;
create trigger extra_service_catalog_set_updated_at
before update on public.extra_service_catalog
for each row execute function public.set_updated_at();

drop trigger if exists freight_demands_set_updated_at on public.freight_demands;
create trigger freight_demands_set_updated_at
before update on public.freight_demands
for each row execute function public.set_updated_at();

create or replace function public.create_freight_demand_for_prod()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_contract public.production_contracts%rowtype;
begin
  select *
    into target_contract
  from public.production_contracts
  where id = new.contract_id
    and company_id = new.company_id;

  if target_contract.id is null then
    return new;
  end if;

  insert into public.freight_demands (
    company_id,
    prod_id,
    contract_id,
    client_id,
    planned_date,
    status,
    created_by
  )
  values (
    new.company_id,
    new.id,
    target_contract.id,
    target_contract.client_id,
    null,
    'previsto',
    new.created_by
  )
  on conflict (prod_id) do nothing;

  return new;
end;
$$;

drop trigger if exists production_prods_create_freight_demand on public.production_prods;
create trigger production_prods_create_freight_demand
after insert on public.production_prods
for each row execute function public.create_freight_demand_for_prod();

insert into public.permissions (key, description)
values
  ('production.settings.manage_logistics', 'Gerenciar cadastros logísticos'),
  ('production.routes.create', 'Criar rotas'),
  ('production.routes.view', 'Visualizar rotas'),
  ('production.routes.edit', 'Editar rotas')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions (company_id, role_id, permission_id)
select r.company_id, r.id, p.id
from public.roles r
cross join public.permissions p
where r.is_master_role
  and p.key in (
    'production.settings.manage_logistics',
    'production.routes.create',
    'production.routes.view',
    'production.routes.edit'
  )
on conflict do nothing;

insert into public.freight_demands (company_id, prod_id, contract_id, client_id, planned_date, status, created_by)
select p.company_id, p.id, p.contract_id, c.client_id, null, 'previsto', p.created_by
from public.production_prods p
join public.production_contracts c on c.id = p.contract_id and c.company_id = p.company_id
on conflict (prod_id) do nothing;

commit;
