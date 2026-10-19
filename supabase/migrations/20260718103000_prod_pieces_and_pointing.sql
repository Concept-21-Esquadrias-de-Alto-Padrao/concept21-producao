begin;

create extension if not exists pgcrypto with schema extensions;

alter table public.production_prods
  add column if not exists pieces_count integer not null default 0,
  add column if not exists pieces_area_m2 numeric(14, 3) not null default 0,
  add column if not exists pieces_weight_kg numeric(14, 3) not null default 0;

create table if not exists public.production_piece_imports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prod_id uuid not null references public.production_prods(id) on delete cascade,
  file_name text not null,
  parsed_totals jsonb not null default '{}'::jsonb,
  source text not null default 'pdf_itens_da_obra',
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists public.production_prod_pieces (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prod_id uuid not null references public.production_prods(id) on delete cascade,
  piece_code text not null,
  system_code text,
  system_description text,
  quantity integer not null default 1 check (quantity > 0),
  width_mm numeric(12, 2),
  height_mm numeric(12, 2),
  measure_a numeric(12, 2),
  measure_b numeric(12, 2),
  location text,
  area_m2 numeric(14, 3) not null default 0 check (area_m2 >= 0),
  unit_weight_kg numeric(14, 3) not null default 0 check (unit_weight_kg >= 0),
  total_weight_kg numeric(14, 3) not null default 0 check (total_weight_kg >= 0),
  source text not null default 'manual',
  import_batch_id uuid references public.production_piece_imports(id) on delete set null,
  sort_order integer not null default 0,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_prod_pieces_unique_code unique (company_id, prod_id, piece_code)
);

create table if not exists public.production_prod_piece_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prod_id uuid not null references public.production_prods(id) on delete cascade,
  piece_id uuid not null references public.production_prod_pieces(id) on delete cascade,
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
  started_at timestamptz,
  completed_at timestamptz,
  total_productive_seconds integer not null default 0 check (total_productive_seconds >= 0),
  total_paused_seconds integer not null default 0 check (total_paused_seconds >= 0),
  current_operator_id uuid,
  last_action text,
  last_action_at timestamptz,
  notes text,
  blockers text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_prod_piece_stages_unique unique (company_id, piece_id, stage_id)
);

create table if not exists public.production_operators (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  registration text not null,
  pin_hash text not null,
  active boolean not null default true,
  notes text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_operators_unique_registration unique (company_id, registration)
);

alter table public.production_prod_piece_stages
  drop constraint if exists production_prod_piece_stages_operator_fk;

alter table public.production_prod_piece_stages
  add constraint production_prod_piece_stages_operator_fk
  foreign key (current_operator_id)
  references public.production_operators(id)
  on delete set null;

create table if not exists public.production_operator_stages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  operator_id uuid not null references public.production_operators(id) on delete cascade,
  stage_id uuid not null references public.production_stages(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint production_operator_stages_unique unique (company_id, operator_id, stage_id)
);

create table if not exists public.production_stage_time_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prod_id uuid not null references public.production_prods(id) on delete cascade,
  piece_id uuid not null references public.production_prod_pieces(id) on delete cascade,
  stage_id uuid not null references public.production_stages(id) on delete restrict,
  piece_stage_id uuid not null references public.production_prod_piece_stages(id) on delete cascade,
  operator_id uuid not null references public.production_operators(id) on delete restrict,
  session_profile_id uuid references public.profiles(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  action text not null check (action in ('iniciar', 'pausar', 'retomar', 'concluir', 'pendencia')),
  event_at timestamptz not null default now(),
  productive_seconds_delta integer not null default 0 check (productive_seconds_delta >= 0),
  paused_seconds_delta integer not null default 0 check (paused_seconds_delta >= 0),
  notes text,
  pause_reason text,
  created_at timestamptz not null default now()
);

create index if not exists prod_piece_imports_prod_idx
  on public.production_piece_imports(company_id, prod_id, created_at desc);

create index if not exists prod_pieces_prod_idx
  on public.production_prod_pieces(company_id, prod_id, sort_order, piece_code);

create index if not exists prod_piece_stages_prod_stage_idx
  on public.production_prod_piece_stages(company_id, prod_id, stage_id, status);

create index if not exists production_operators_company_idx
  on public.production_operators(company_id, registration);

create index if not exists production_operator_stages_operator_idx
  on public.production_operator_stages(company_id, operator_id);

create index if not exists production_stage_time_entries_piece_stage_idx
  on public.production_stage_time_entries(company_id, piece_stage_id, event_at desc);

drop trigger if exists production_prod_pieces_set_updated_at on public.production_prod_pieces;
create trigger production_prod_pieces_set_updated_at
before update on public.production_prod_pieces
for each row execute function public.set_updated_at();

drop trigger if exists production_prod_piece_stages_set_updated_at on public.production_prod_piece_stages;
create trigger production_prod_piece_stages_set_updated_at
before update on public.production_prod_piece_stages
for each row execute function public.set_updated_at();

drop trigger if exists production_operators_set_updated_at on public.production_operators;
create trigger production_operators_set_updated_at
before update on public.production_operators
for each row execute function public.set_updated_at();

create or replace function public.hash_production_operator_pin(plain_pin text)
returns text
language sql
security definer
set search_path = public, extensions
as $$
  select extensions.crypt(plain_pin, extensions.gen_salt('bf'));
$$;

create or replace function public.verify_production_operator_pin(stored_hash text, plain_pin text)
returns boolean
language sql
security definer
set search_path = public, extensions
as $$
  select coalesce(stored_hash = extensions.crypt(plain_pin, stored_hash), false);
$$;

grant execute on function public.hash_production_operator_pin(text) to authenticated;
grant execute on function public.verify_production_operator_pin(text, text) to authenticated;

create or replace function public.refresh_prod_piece_totals(target_prod_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.production_prods prod
  set
    pieces_count = coalesce(totals.pieces_count, 0),
    pieces_area_m2 = coalesce(totals.area_m2, 0),
    pieces_weight_kg = coalesce(totals.weight_kg, 0),
    updated_at = now()
  from (
    select
      p.prod_id,
      coalesce(sum(p.quantity), 0)::integer as pieces_count,
      coalesce(sum(p.area_m2), 0)::numeric(14, 3) as area_m2,
      coalesce(sum(p.total_weight_kg), 0)::numeric(14, 3) as weight_kg
    from public.production_prod_pieces p
    where p.prod_id = target_prod_id
    group by p.prod_id
  ) totals
  where prod.id = target_prod_id
    and prod.id = totals.prod_id;

  if not found then
    update public.production_prods
    set
      pieces_count = 0,
      pieces_area_m2 = 0,
      pieces_weight_kg = 0,
      updated_at = now()
    where id = target_prod_id;
  end if;
end;
$$;

create or replace function public.create_piece_stage_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.production_prod_piece_stages (
    company_id,
    prod_id,
    piece_id,
    stage_id
  )
  select
    new.company_id,
    new.prod_id,
    new.id,
    stage.id
  from public.production_stages stage
  where stage.company_id = new.company_id
    and stage.active = true
    and stage.sort_order between 5 and 9
  on conflict (company_id, piece_id, stage_id) do nothing;

  perform public.refresh_prod_piece_totals(new.prod_id);
  return new;
end;
$$;

drop trigger if exists production_prod_pieces_create_stages on public.production_prod_pieces;
create trigger production_prod_pieces_create_stages
after insert on public.production_prod_pieces
for each row execute function public.create_piece_stage_rows();

create or replace function public.refresh_prod_piece_totals_from_piece()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  affected_prod_id uuid;
begin
  affected_prod_id := case when tg_op = 'DELETE' then old.prod_id else new.prod_id end;
  perform public.refresh_prod_piece_totals(affected_prod_id);
  return coalesce(new, old);
end;
$$;

drop trigger if exists production_prod_pieces_refresh_totals_update on public.production_prod_pieces;
create trigger production_prod_pieces_refresh_totals_update
after update of quantity, area_m2, total_weight_kg, prod_id on public.production_prod_pieces
for each row execute function public.refresh_prod_piece_totals_from_piece();

drop trigger if exists production_prod_pieces_refresh_totals_delete on public.production_prod_pieces;
create trigger production_prod_pieces_refresh_totals_delete
after delete on public.production_prod_pieces
for each row execute function public.refresh_prod_piece_totals_from_piece();

alter table public.production_piece_imports enable row level security;
alter table public.production_prod_pieces enable row level security;
alter table public.production_prod_piece_stages enable row level security;
alter table public.production_operators enable row level security;
alter table public.production_operator_stages enable row level security;
alter table public.production_stage_time_entries enable row level security;

drop policy if exists piece_imports_read on public.production_piece_imports;
create policy piece_imports_read on public.production_piece_imports
for select
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.prods.view')
    or public.has_permission('production.prods.import_pieces')
  )
);

drop policy if exists piece_imports_insert on public.production_piece_imports;
create policy piece_imports_insert on public.production_piece_imports
for insert
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.prods.import_pieces')
  )
);

drop policy if exists prod_pieces_read on public.production_prod_pieces;
create policy prod_pieces_read on public.production_prod_pieces
for select
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.prods.view')
    or public.has_permission('production.pointing.view')
  )
);

drop policy if exists prod_pieces_manage on public.production_prod_pieces;
create policy prod_pieces_manage on public.production_prod_pieces
for all
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.prods.manage_pieces')
    or public.has_permission('production.prods.import_pieces')
  )
)
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.prods.manage_pieces')
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
    or public.has_permission('production.prods.view')
    or public.has_permission('production.pointing.view')
  )
);

drop policy if exists prod_piece_stages_manage on public.production_prod_piece_stages;
create policy prod_piece_stages_manage on public.production_prod_piece_stages
for all
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.perform')
    or public.has_permission('production.prods.manage_pieces')
  )
)
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.perform')
    or public.has_permission('production.prods.manage_pieces')
  )
);

drop policy if exists production_operators_read on public.production_operators;
create policy production_operators_read on public.production_operators
for select
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.manage_operators')
  )
);

drop policy if exists production_operators_manage on public.production_operators;
create policy production_operators_manage on public.production_operators
for all
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.manage_operators')
  )
)
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.manage_operators')
  )
);

drop policy if exists production_operator_stages_read on public.production_operator_stages;
create policy production_operator_stages_read on public.production_operator_stages
for select
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.manage_operators')
  )
);

drop policy if exists production_operator_stages_manage on public.production_operator_stages;
create policy production_operator_stages_manage on public.production_operator_stages
for all
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.manage_operators')
  )
)
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.manage_operators')
  )
);

drop policy if exists production_stage_time_entries_read on public.production_stage_time_entries;
create policy production_stage_time_entries_read on public.production_stage_time_entries
for select
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.prods.view')
    or public.has_permission('production.pointing.view')
  )
);

drop policy if exists production_stage_time_entries_insert on public.production_stage_time_entries;
create policy production_stage_time_entries_insert on public.production_stage_time_entries
for insert
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.perform')
  )
);

insert into public.permissions (key, description)
values
  ('production.prods.import_pieces', 'Importar peças da PROD por PDF'),
  ('production.prods.manage_pieces', 'Gerenciar peças da PROD'),
  ('production.pointing.view', 'Visualizar apontamentos de produção'),
  ('production.pointing.perform', 'Realizar apontamentos de produção'),
  ('production.pointing.manage_operators', 'Gerenciar operadores de apontamento')
on conflict (key) do update
set description = excluded.description;

insert into public.role_permissions (company_id, role_id, permission_id)
select role.company_id, role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.is_master_role = true
  and permission.key in (
    'production.prods.import_pieces',
    'production.prods.manage_pieces',
    'production.pointing.view',
    'production.pointing.perform',
    'production.pointing.manage_operators'
  )
on conflict do nothing;

commit;
