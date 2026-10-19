create extension if not exists pgcrypto;

create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid unique references auth.users(id) on delete cascade,
  name text not null,
  email text not null,
  title text,
  department_id uuid references public.departments(id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive')),
  avatar_url text,
  is_master boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, email)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  is_master_role boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text not null,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (role_id, permission_id)
);

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (profile_id, role_id)
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  trade_name text,
  document text,
  phone text,
  email text,
  notes text,
  active boolean not null default true,
  external_source text,
  external_id text,
  integration_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.production_contracts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contract_number text not null,
  client_id uuid not null references public.clients(id) on delete restrict,
  work_name text not null,
  full_address text not null,
  city text not null,
  state text not null,
  zip_code text,
  site_contact text,
  site_contact_phone text,
  general_delivery_forecast date,
  notes text,
  status text not null default 'ativo',
  active boolean not null default true,
  external_source text,
  external_id text,
  integration_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, contract_number)
);

create table public.production_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  description text,
  sort_order integer not null check (sort_order > 0),
  active boolean not null default true,
  icon text,
  required_permission text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, sort_order),
  unique (company_id, name)
);

create table public.production_prods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  contract_id uuid not null references public.production_contracts(id) on delete cascade,
  prod_number integer not null check (prod_number > 0),
  description text,
  owner_profile_id uuid references public.profiles(id) on delete set null,
  priority text not null default 'normal' check (priority in ('baixa', 'normal', 'alta', 'urgente')),
  planned_start_date date,
  planned_end_date date,
  delivery_forecast date,
  actual_start_date date,
  actual_end_date date,
  current_stage_id uuid references public.production_stages(id) on delete set null,
  status text not null default 'planejamento' check (
    status in (
      'planejamento',
      'aguardando_materiais',
      'aguardando_listas',
      'pronta_para_producao',
      'em_producao',
      'pausada',
      'embalagem',
      'expedicao',
      'aguardando_frete',
      'concluida',
      'cancelada'
    )
  ),
  notes text,
  external_source text,
  external_id text,
  integration_metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, contract_id, prod_number)
);

create table public.production_prod_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prod_id uuid not null references public.production_prods(id) on delete cascade,
  stage_id uuid not null references public.production_stages(id) on delete restrict,
  status text not null default 'nao_iniciada' check (
    status in (
      'nao_iniciada',
      'aguardando',
      'em_andamento',
      'concluida',
      'concluida_parcialmente',
      'pausada',
      'com_pendencia',
      'nao_aplicavel'
    )
  ),
  owner_profile_id uuid references public.profiles(id) on delete set null,
  planned_date date,
  started_at timestamptz,
  completed_at timestamptz,
  notes text,
  blockers text,
  last_updated_by uuid references auth.users(id) on delete set null,
  last_updated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, prod_id, stage_id)
);

create table public.production_material_groups (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]+$'),
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, key)
);

create table public.production_prod_materials (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prod_id uuid not null references public.production_prods(id) on delete cascade,
  material_group text not null,
  forecast_status text not null default 'nao_informado' check (
    forecast_status in (
      'nao_informado',
      'em_levantamento',
      'previsto',
      'parcialmente_previsto',
      'sem_previsao'
    )
  ),
  availability_forecast date,
  confirmation_status text not null default 'nao_verificado' check (
    confirmation_status in (
      'nao_verificado',
      'aguardando_confirmacao',
      'parcialmente_confirmado',
      'confirmado',
      'indisponivel'
    )
  ),
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users(id) on delete set null,
  notes text,
  location text,
  blockers text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, prod_id, material_group)
);

create table public.storage_location_types (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, key)
);

create table public.storage_locations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  code text,
  type text not null,
  material_group text,
  description text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table public.production_document_checklist_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  label text not null,
  sort_order integer not null check (sort_order > 0),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, label)
);

create table public.production_prod_document_checks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prod_id uuid not null references public.production_prods(id) on delete cascade,
  checklist_item_id uuid not null references public.production_document_checklist_items(id) on delete restrict,
  checked boolean not null default false,
  checked_at timestamptz,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  notes text,
  attachment_path text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, prod_id, checklist_item_id)
);

create table public.production_selectable_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  stage_id uuid references public.production_stages(id) on delete cascade,
  name text not null,
  description text,
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, stage_id, name)
);

create table public.production_prod_selected_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prod_id uuid not null references public.production_prods(id) on delete cascade,
  stage_id uuid references public.production_stages(id) on delete set null,
  selectable_item_id uuid not null references public.production_selectable_items(id) on delete restrict,
  selected boolean not null default true,
  quantity numeric(12, 2) check (quantity is null or quantity >= 0),
  location text,
  withdrawn boolean not null default false,
  packed boolean not null default false,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  event_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, prod_id, selectable_item_id)
);

create table public.production_shipping_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prod_id uuid not null references public.production_prods(id) on delete cascade unique,
  shipping_location text,
  entered_at timestamptz,
  planned_departure timestamptz,
  actual_departure timestamptz,
  responsible_profile_id uuid references public.profiles(id) on delete set null,
  status text not null default 'aguardando_expedicao',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.freights (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  title text not null,
  freight_date date not null,
  planned_departure_time time,
  driver text,
  vehicle text,
  plate text,
  status text not null default 'previsto' check (
    status in (
      'previsto',
      'em_planejamento',
      'pre_agendado',
      'agendado',
      'confirmado',
      'em_carregamento',
      'em_transito',
      'concluido',
      'parcialmente_concluido',
      'nao_realizado',
      'cancelado'
    )
  ),
  expected_value numeric(12, 2) not null default 0 check (expected_value >= 0),
  contracted_value numeric(12, 2) not null default 0 check (contracted_value >= 0),
  realized_value numeric(12, 2) not null default 0 check (realized_value >= 0),
  additional_costs numeric(12, 2) not null default 0 check (additional_costs >= 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.extra_service_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  service_type text not null check (
    service_type in ('entrega_avulsa', 'coleta_avulsa', 'entrega_coleta_avulsa')
  ),
  requesting_department_id uuid not null references public.departments(id) on delete restrict,
  requesting_profile_id uuid references public.profiles(id) on delete set null,
  recipient_or_place text not null,
  address text not null,
  contact text,
  phone text,
  service_description text not null,
  materials_description text,
  desired_date date,
  desired_window text,
  priority text not null default 'normal' check (priority in ('baixa', 'normal', 'alta', 'urgente')),
  notes text,
  requires_proof boolean not null default false,
  status text not null default 'solicitado' check (
    status in (
      'solicitado',
      'aguardando_inclusao_rota',
      'incluido_em_rota',
      'em_andamento',
      'concluido',
      'nao_realizado',
      'cancelado'
    )
  ),
  client_id uuid references public.clients(id) on delete set null,
  contract_id uuid references public.production_contracts(id) on delete set null,
  prod_id uuid references public.production_prods(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.freight_stops (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  freight_id uuid not null references public.freights(id) on delete cascade,
  position integer not null check (position > 0),
  stop_type text not null check (
    stop_type in ('entrega_prod', 'entrega_avulsa', 'coleta_avulsa', 'entrega_coleta_avulsa')
  ),
  requesting_department_id uuid not null references public.departments(id) on delete restrict,
  requesting_profile_id uuid references public.profiles(id) on delete set null,
  title text not null,
  address text not null,
  contact text,
  phone text,
  planned_window text,
  notes text,
  status text not null default 'agendado',
  requires_proof boolean not null default false,
  completed boolean not null default false,
  extra_service_request_id uuid references public.extra_service_requests(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, freight_id, position),
  unique (id, freight_id)
);

create table public.freight_stop_prods (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  freight_id uuid not null references public.freights(id) on delete cascade,
  stop_id uuid not null,
  prod_id uuid not null references public.production_prods(id) on delete restrict,
  created_at timestamptz not null default now(),
  foreign key (stop_id, freight_id) references public.freight_stops(id, freight_id) on delete cascade,
  unique (company_id, freight_id, prod_id),
  unique (company_id, stop_id, prod_id)
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete cascade,
  entity text not null,
  entity_id uuid not null,
  action text not null,
  user_id uuid references auth.users(id) on delete set null default auth.uid(),
  before_data jsonb,
  after_data jsonb,
  notes text,
  created_at timestamptz not null default now()
);

create index clients_company_name_idx on public.clients(company_id, name);
create index contracts_company_client_idx on public.production_contracts(company_id, client_id);
create index prods_company_contract_idx on public.production_prods(company_id, contract_id);
create index prods_company_status_idx on public.production_prods(company_id, status);
create index prod_stages_prod_idx on public.production_prod_stages(prod_id, stage_id);
create index prod_materials_prod_idx on public.production_prod_materials(prod_id, material_group);
create index freights_company_date_idx on public.freights(company_id, freight_date);
create index freight_stops_freight_position_idx on public.freight_stops(freight_id, position);
create index audit_logs_entity_idx on public.audit_logs(company_id, entity, entity_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.company_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.status = 'active'
  limit 1
$$;

create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select p.is_master
      from public.profiles p
      where p.user_id = auth.uid()
        and p.status = 'active'
      limit 1
    ),
    false
  )
$$;

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_master()
    or exists (
      select 1
      from public.profiles p
      join public.user_roles ur on ur.profile_id = p.id
      join public.roles r on r.id = ur.role_id and r.active
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions perm on perm.id = rp.permission_id
      where p.user_id = auth.uid()
        and p.status = 'active'
        and p.company_id = ur.company_id
        and perm.key = permission_key
    )
$$;

create or replace function public.ensure_company_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.company_id is null then
    new.company_id := public.current_company_id();
  end if;
  if new.company_id is null then
    raise exception 'company_id is required';
  end if;
  return new;
end;
$$;

create or replace function public.touch_stage_update()
returns trigger
language plpgsql
as $$
begin
  if row(new.status, new.owner_profile_id, new.planned_date, new.started_at, new.completed_at, new.notes, new.blockers)
     is distinct from
     row(old.status, old.owner_profile_id, old.planned_date, old.started_at, old.completed_at, old.notes, old.blockers) then
    new.last_updated_by := auth.uid();
    new.last_updated_at := now();
  end if;

  if new.status in ('concluida', 'concluida_parcialmente') and new.completed_at is null then
    new.completed_at := now();
  end if;

  return new;
end;
$$;

create or replace function public.touch_material_confirmation()
returns trigger
language plpgsql
as $$
begin
  if new.confirmation_status is distinct from old.confirmation_status
     and new.confirmation_status in ('parcialmente_confirmado', 'confirmado', 'indisponivel') then
    new.confirmed_by := coalesce(new.confirmed_by, auth.uid());
    new.confirmed_at := coalesce(new.confirmed_at, now());
  end if;
  return new;
end;
$$;

create or replace function public.initialize_prod_defaults()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.production_prod_stages (company_id, prod_id, stage_id, planned_date)
  select new.company_id, new.id, s.id, new.planned_end_date
  from public.production_stages s
  where s.company_id = new.company_id
    and s.active
  on conflict do nothing;

  insert into public.production_prod_materials (company_id, prod_id, material_group)
  select new.company_id, new.id, mg.key
  from public.production_material_groups mg
  where mg.company_id = new.company_id
    and mg.active
  on conflict do nothing;

  insert into public.production_prod_document_checks (company_id, prod_id, checklist_item_id)
  select new.company_id, new.id, item.id
  from public.production_document_checklist_items item
  where item.company_id = new.company_id
    and item.active
  on conflict do nothing;

  return new;
end;
$$;

create or replace function public.set_freight_stop_link_company()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  stop_record public.freight_stops%rowtype;
begin
  select * into stop_record
  from public.freight_stops
  where id = new.stop_id;

  if stop_record.id is null then
    raise exception 'freight stop not found';
  end if;

  new.company_id := stop_record.company_id;
  new.freight_id := stop_record.freight_id;
  return new;
end;
$$;

create or replace function public.audit_table_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  row_company_id uuid;
  row_id uuid;
begin
  row_company_id := coalesce(new.company_id, old.company_id);
  row_id := coalesce(new.id, old.id);

  insert into public.audit_logs (
    company_id,
    entity,
    entity_id,
    action,
    user_id,
    before_data,
    after_data
  )
  values (
    row_company_id,
    tg_table_name,
    row_id,
    lower(tg_op),
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$$;

create or replace function public.prevent_common_permission_manage_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  permission_key text;
  target_is_master_role boolean;
begin
  select key into permission_key from public.permissions where id = new.permission_id;
  select is_master_role into target_is_master_role from public.roles where id = new.role_id;

  if permission_key = 'production.permissions.manage' and not coalesce(target_is_master_role, false) then
    raise exception 'production.permissions.manage só pode ser atribuída ao perfil Administrador';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_common_master_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_is_master_role boolean;
  target_profile_is_master boolean;
begin
  select is_master_role into target_is_master_role from public.roles where id = new.role_id;
  select is_master into target_profile_is_master from public.profiles where id = new.profile_id;

  if coalesce(target_is_master_role, false)
     and not public.is_master()
     and not coalesce(target_profile_is_master, false) then
    raise exception 'Somente administradores podem atribuir perfis de Administrador';
  end if;

  return new;
end;
$$;

create or replace function public.promote_user_to_master(target_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
  target_company_id uuid;
  target_profile_id uuid;
  target_role_id uuid;
begin
  select u.id into target_user_id
  from auth.users u
  where lower(u.email) = lower(target_email)
  limit 1;

  if target_user_id is null then
    raise exception 'Authenticated user with email % not found', target_email;
  end if;

  select id into target_company_id
  from public.companies
  order by created_at
  limit 1;

  if target_company_id is null then
    insert into public.companies (name, slug)
    values ('Concept21 Aluminium', 'concept21')
    returning id into target_company_id;
  end if;

  insert into public.profiles (company_id, user_id, name, email, is_master)
  values (target_company_id, target_user_id, target_email, target_email, true)
  on conflict (user_id) do update
    set is_master = true,
        status = 'active',
        updated_at = now()
  returning id into target_profile_id;

  select id into target_role_id
  from public.roles
  where company_id = target_company_id
    and is_master_role
  limit 1;

  if target_role_id is not null then
    insert into public.user_roles (company_id, profile_id, role_id)
    values (target_company_id, target_profile_id, target_role_id)
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.promote_user_to_master(text) from public;

do $$
declare
  t text;
begin
  foreach t in array array[
    'companies',
    'departments',
    'profiles',
    'roles',
    'clients',
    'production_contracts',
    'production_stages',
    'production_prods',
    'production_prod_stages',
    'production_material_groups',
    'production_prod_materials',
    'storage_location_types',
    'storage_locations',
    'production_document_checklist_items',
    'production_prod_document_checks',
    'production_selectable_items',
    'production_prod_selected_items',
    'production_shipping_records',
    'freights',
    'extra_service_requests',
    'freight_stops'
  ]
  loop
    execute format('create trigger %I_set_updated_at before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end;
$$;

do $$
declare
  t text;
begin
  foreach t in array array[
    'departments',
    'profiles',
    'roles',
    'role_permissions',
    'user_roles',
    'clients',
    'production_contracts',
    'production_stages',
    'production_prods',
    'production_prod_stages',
    'production_material_groups',
    'production_prod_materials',
    'storage_location_types',
    'storage_locations',
    'production_document_checklist_items',
    'production_prod_document_checks',
    'production_selectable_items',
    'production_prod_selected_items',
    'production_shipping_records',
    'freights',
    'extra_service_requests',
    'freight_stops'
  ]
  loop
    execute format('create trigger %I_ensure_company before insert on public.%I for each row execute function public.ensure_company_id()', t, t);
  end loop;
end;
$$;

create trigger production_prod_stages_touch
before update on public.production_prod_stages
for each row execute function public.touch_stage_update();

create trigger production_prod_materials_confirm
before update on public.production_prod_materials
for each row execute function public.touch_material_confirmation();

create trigger production_prods_initialize_defaults
after insert on public.production_prods
for each row execute function public.initialize_prod_defaults();

create trigger freight_stop_prods_company
before insert or update on public.freight_stop_prods
for each row execute function public.set_freight_stop_link_company();

create trigger role_permissions_guard
before insert or update on public.role_permissions
for each row execute function public.prevent_common_permission_manage_grant();

create trigger user_roles_master_guard
before insert or update on public.user_roles
for each row execute function public.prevent_common_master_role_assignment();

do $$
declare
  t text;
begin
  foreach t in array array[
    'production_prods',
    'production_prod_stages',
    'production_prod_materials',
    'production_prod_document_checks',
    'production_prod_selected_items',
    'production_shipping_records',
    'freights',
    'extra_service_requests',
    'freight_stops',
    'freight_stop_prods'
  ]
  loop
    execute format('create trigger %I_audit after insert or update or delete on public.%I for each row execute function public.audit_table_changes()', t, t);
  end loop;
end;
$$;

create or replace view public.production_prod_overview as
select
  p.id,
  p.company_id,
  p.contract_id,
  c.contract_number,
  c.work_name,
  c.full_address,
  cl.name as client_name,
  p.prod_number,
  concat(cl.name, ' - ', c.contract_number, ' - PROD ', p.prod_number) as display_name,
  p.status,
  p.priority,
  p.current_stage_id,
  s.name as current_stage_name,
  p.delivery_forecast,
  p.planned_end_date,
  p.updated_at
from public.production_prods p
join public.production_contracts c on c.id = p.contract_id
join public.clients cl on cl.id = c.client_id
left join public.production_stages s on s.id = p.current_stage_id;

create or replace view public.dashboard_production_summary as
select
  company_id,
  count(*) filter (where status in ('em_producao', 'embalagem', 'expedicao')) as prods_in_progress,
  count(*) filter (where status in ('aguardando_materiais', 'pausada')) as prods_with_attention,
  count(*) filter (where status not in ('concluida', 'cancelada')) as open_prods
from public.production_prods
group by company_id;

alter table public.companies enable row level security;
alter table public.permissions enable row level security;
alter table public.audit_logs enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array[
    'departments',
    'profiles',
    'roles',
    'role_permissions',
    'user_roles',
    'clients',
    'production_contracts',
    'production_stages',
    'production_prods',
    'production_prod_stages',
    'production_material_groups',
    'production_prod_materials',
    'storage_location_types',
    'storage_locations',
    'production_document_checklist_items',
    'production_prod_document_checks',
    'production_selectable_items',
    'production_prod_selected_items',
    'production_shipping_records',
    'freights',
    'extra_service_requests',
    'freight_stops',
    'freight_stop_prods'
  ]
  loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end;
$$;

create policy companies_read_own on public.companies
for select using (id = public.current_company_id() or public.is_master());

create policy companies_master_all on public.companies
for all using (public.is_master()) with check (public.is_master());

create policy permissions_authenticated_read on public.permissions
for select to authenticated using (true);

create policy permissions_master_write on public.permissions
for all to authenticated using (public.is_master()) with check (public.is_master());

create policy audit_read on public.audit_logs
for select to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.reports.view')));

create policy clients_read on public.clients
for select to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.clients.view') or public.has_permission('production.prods.view')));
create policy clients_insert on public.clients
for insert to authenticated
with check (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.clients.create')));
create policy clients_update on public.clients
for update to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.clients.edit')))
with check (company_id = public.current_company_id());
create policy clients_delete on public.clients
for delete to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.clients.delete')));

create policy contracts_read on public.production_contracts
for select to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.contracts.view') or public.has_permission('production.prods.view')));
create policy contracts_insert on public.production_contracts
for insert to authenticated
with check (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.contracts.create')));
create policy contracts_update on public.production_contracts
for update to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.contracts.edit')))
with check (company_id = public.current_company_id());

create policy prods_read on public.production_prods
for select to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.prods.view')));
create policy prods_insert on public.production_prods
for insert to authenticated
with check (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.prods.create')));
create policy prods_update on public.production_prods
for update to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.prods.edit')))
with check (company_id = public.current_company_id());
create policy prods_delete on public.production_prods
for delete to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.prods.delete')));

create policy prod_stages_read on public.production_prod_stages
for select to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.prods.view')));
create policy prod_stages_update on public.production_prod_stages
for update to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.prods.update_stage')))
with check (company_id = public.current_company_id());

create policy materials_read on public.production_prod_materials
for select to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.materials.view')));
create policy materials_update on public.production_prod_materials
for update to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.materials.forecast')
    or public.has_permission('production.materials.confirm')
    or public.has_permission('production.materials.update_location')
  )
)
with check (company_id = public.current_company_id());

create policy docs_manage on public.production_prod_document_checks
for all to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.documents.manage')))
with check (company_id = public.current_company_id());

create policy selected_items_manage on public.production_prod_selected_items
for all to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.machining.manage')
    or public.has_permission('production.preparation_assembly.manage')
    or public.has_permission('production.packaging.manage')
  )
)
with check (company_id = public.current_company_id());

create policy shipping_manage on public.production_shipping_records
for all to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.shipping.manage')))
with check (company_id = public.current_company_id());

create policy freights_read on public.freights
for select to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.freights.view')));
create policy freights_insert on public.freights
for insert to authenticated
with check (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.freights.create')));
create policy freights_update on public.freights
for update to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.freights.edit') or public.has_permission('production.freights.manage_values')))
with check (company_id = public.current_company_id());

create policy freight_stops_manage on public.freight_stops
for all to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.freights.manage_route')))
with check (company_id = public.current_company_id());

create policy freight_stop_prods_manage on public.freight_stop_prods
for all to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.freights.manage_route')))
with check (company_id = public.current_company_id());

create policy extra_services_read on public.extra_service_requests
for select to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.extra_services.view')));
create policy extra_services_insert on public.extra_service_requests
for insert to authenticated
with check (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.extra_services.create')));
create policy extra_services_update on public.extra_service_requests
for update to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.extra_services.edit') or public.has_permission('production.extra_services.cancel')))
with check (company_id = public.current_company_id());

create policy settings_stages_manage on public.production_stages
for all to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.settings.manage_stages')))
with check (company_id = public.current_company_id());

create policy settings_material_groups_read on public.production_material_groups
for select to authenticated
using (company_id = public.current_company_id());
create policy settings_material_groups_manage on public.production_material_groups
for all to authenticated
using (company_id = public.current_company_id() and public.is_master())
with check (company_id = public.current_company_id());

create policy settings_location_types_manage on public.storage_location_types
for all to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.settings.manage_locations')))
with check (company_id = public.current_company_id());

create policy settings_locations_manage on public.storage_locations
for all to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.settings.manage_locations')))
with check (company_id = public.current_company_id());

create policy settings_document_items_manage on public.production_document_checklist_items
for all to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.documents.manage')))
with check (company_id = public.current_company_id());

create policy settings_selectable_items_manage on public.production_selectable_items
for all to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.settings.manage_selectable_items')))
with check (company_id = public.current_company_id());

create policy departments_manage on public.departments
for all to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.settings.manage_departments')))
with check (company_id = public.current_company_id());

create policy profiles_read on public.profiles
for select to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.settings.manage_users') or user_id = auth.uid()));
create policy profiles_update_basic on public.profiles
for update to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.settings.manage_users') or user_id = auth.uid()))
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or (not is_master and not public.has_permission('production.permissions.manage'))
  )
);

create policy roles_master_only on public.roles
for all to authenticated
using (company_id = public.current_company_id() and public.is_master())
with check (company_id = public.current_company_id() and public.is_master());
create policy role_permissions_master_only on public.role_permissions
for all to authenticated
using (company_id = public.current_company_id() and public.is_master())
with check (company_id = public.current_company_id() and public.is_master());
create policy user_roles_master_only on public.user_roles
for all to authenticated
using (company_id = public.current_company_id() and public.is_master())
with check (company_id = public.current_company_id() and public.is_master());

create policy stage_read_for_prod_users on public.production_stages
for select to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.prods.view')));
create policy storage_locations_read_for_material_users on public.storage_locations
for select to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.materials.view')));
create policy selectable_items_read_for_stage_users on public.production_selectable_items
for select to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.prods.view')));
create policy document_items_read_for_prod_users on public.production_document_checklist_items
for select to authenticated
using (company_id = public.current_company_id() and (public.is_master() or public.has_permission('production.prods.view')));
