begin;

alter table public.production_prod_pieces
  add column if not exists released_to_production boolean not null default false,
  add column if not exists released_at timestamptz,
  add column if not exists released_by uuid references auth.users(id) on delete set null;

alter table public.production_prod_piece_stages
  add column if not exists active_rework_id uuid;

alter table public.production_pointing_sessions
  add column if not exists rework_id uuid;

alter table public.production_stage_time_entries
  add column if not exists rework_id uuid;

update public.production_prod_pieces
set released_to_production = true,
    released_at = coalesce(released_at, created_at, now())
where released_to_production = false;

create table if not exists public.production_pointing_session_participants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  pointing_session_id uuid not null references public.production_pointing_sessions(id) on delete cascade,
  operator_id uuid not null references public.production_operators(id) on delete restrict,
  created_at timestamptz not null default now(),
  constraint production_pointing_session_participants_unique unique (
    company_id,
    pointing_session_id,
    operator_id
  )
);

create table if not exists public.production_rework_reasons (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  kind text not null check (kind in ('motivo', 'origem')),
  label text not null,
  description text,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_rework_reasons_unique_label unique (company_id, kind, label)
);

create table if not exists public.production_piece_reworks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prod_id uuid not null references public.production_prods(id) on delete cascade,
  piece_id uuid not null references public.production_prod_pieces(id) on delete cascade,
  reason_id uuid references public.production_rework_reasons(id) on delete set null,
  origin_id uuid references public.production_rework_reasons(id) on delete set null,
  target_stage_id uuid references public.production_stages(id) on delete set null,
  status text not null default 'registrado' check (
    status in (
      'registrado',
      'em_analise_tecnica',
      'aguardando_material',
      'liberado_para_producao',
      'em_retrabalho',
      'concluido',
      'cancelado'
    )
  ),
  priority text not null default 'normal' check (priority in ('baixa', 'normal', 'alta', 'urgente')),
  returned_at date not null default current_date,
  needs_technical_info boolean not null default false,
  needs_material_purchase boolean not null default false,
  technical_guidance text,
  material_notes text,
  description text,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and constraint_name = 'production_prod_piece_stages_active_rework_fk'
  ) then
    alter table public.production_prod_piece_stages
      add constraint production_prod_piece_stages_active_rework_fk
      foreign key (active_rework_id)
      references public.production_piece_reworks(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and constraint_name = 'production_pointing_sessions_rework_fk'
  ) then
    alter table public.production_pointing_sessions
      add constraint production_pointing_sessions_rework_fk
      foreign key (rework_id)
      references public.production_piece_reworks(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from information_schema.table_constraints
    where constraint_schema = 'public'
      and constraint_name = 'production_stage_time_entries_rework_fk'
  ) then
    alter table public.production_stage_time_entries
      add constraint production_stage_time_entries_rework_fk
      foreign key (rework_id)
      references public.production_piece_reworks(id)
      on delete set null;
  end if;
end $$;

create index if not exists prod_pieces_release_idx
  on public.production_prod_pieces(company_id, prod_id, released_to_production);

create index if not exists production_pointing_session_participants_session_idx
  on public.production_pointing_session_participants(company_id, pointing_session_id);

create index if not exists production_piece_reworks_piece_idx
  on public.production_piece_reworks(company_id, prod_id, piece_id, status, created_at desc);

create index if not exists production_piece_reworks_status_idx
  on public.production_piece_reworks(company_id, status, priority, returned_at);

create index if not exists production_rework_reasons_company_kind_idx
  on public.production_rework_reasons(company_id, kind, active, sort_order, label);

drop trigger if exists production_rework_reasons_set_updated_at on public.production_rework_reasons;
create trigger production_rework_reasons_set_updated_at
before update on public.production_rework_reasons
for each row execute function public.set_updated_at();

drop trigger if exists production_piece_reworks_set_updated_at on public.production_piece_reworks;
create trigger production_piece_reworks_set_updated_at
before update on public.production_piece_reworks
for each row execute function public.set_updated_at();

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
    stage_id,
    status
  )
  select
    new.company_id,
    new.prod_id,
    new.id,
    stage.id,
    case
      when new.released_to_production = true
        and stage.sort_order = (
          select min(first_stage.sort_order)
          from public.production_stages first_stage
          where first_stage.company_id = new.company_id
            and first_stage.active = true
            and first_stage.sort_order between 5 and 9
        )
      then 'aguardando'
      else 'nao_iniciada'
    end
  from public.production_stages stage
  where stage.company_id = new.company_id
    and stage.active = true
    and stage.sort_order between 5 and 9
  on conflict (company_id, piece_id, stage_id) do nothing;

  perform public.refresh_prod_piece_totals(new.prod_id);
  return new;
end;
$$;

alter table public.production_pointing_session_participants enable row level security;
alter table public.production_rework_reasons enable row level security;
alter table public.production_piece_reworks enable row level security;

drop policy if exists pointing_session_participants_read on public.production_pointing_session_participants;
create policy pointing_session_participants_read on public.production_pointing_session_participants
for select
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.prods.view')
    or public.has_permission('production.pointing.view')
    or public.has_permission('production.reports.view')
  )
);

drop policy if exists pointing_session_participants_insert on public.production_pointing_session_participants;
create policy pointing_session_participants_insert on public.production_pointing_session_participants
for insert
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.perform')
  )
);

drop policy if exists production_rework_reasons_read on public.production_rework_reasons;
create policy production_rework_reasons_read on public.production_rework_reasons
for select
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.prods.view')
    or public.has_permission('production.rework.view')
    or public.has_permission('production.rework.manage')
  )
);

drop policy if exists production_rework_reasons_manage on public.production_rework_reasons;
create policy production_rework_reasons_manage on public.production_rework_reasons
for all
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.rework.manage')
  )
)
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.rework.manage')
  )
);

drop policy if exists production_piece_reworks_read on public.production_piece_reworks;
create policy production_piece_reworks_read on public.production_piece_reworks
for select
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.prods.view')
    or public.has_permission('production.pointing.view')
    or public.has_permission('production.rework.view')
    or public.has_permission('production.rework.manage')
  )
);

drop policy if exists production_piece_reworks_manage on public.production_piece_reworks;
create policy production_piece_reworks_manage on public.production_piece_reworks
for all
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.rework.manage')
  )
)
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.rework.manage')
  )
);

insert into public.permissions (key, description)
values
  ('production.prods.release_to_production', 'Liberar lote de peças para produção'),
  ('production.rework.view', 'Visualizar retrabalhos de produção'),
  ('production.rework.manage', 'Registrar e liberar retrabalhos de produção')
on conflict (key) do update
set description = excluded.description;

insert into public.role_permissions (company_id, role_id, permission_id)
select role.company_id, role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.is_master_role = true
  and permission.key in (
    'production.prods.release_to_production',
    'production.rework.view',
    'production.rework.manage'
  )
on conflict do nothing;

insert into public.production_rework_reasons (
  company_id,
  kind,
  label,
  description,
  sort_order
)
select company.id, seed.kind, seed.label, seed.description, seed.sort_order
from public.companies company
cross join (
  values
    ('origem', 'Erro técnico', 'Falha ou divergência de informação técnica.', 10),
    ('origem', 'Erro de produção', 'Falha ocorrida durante a fabricação.', 20),
    ('origem', 'Equipe de obra', 'Falha ou dano gerado pela equipe de instalação/obra.', 30),
    ('origem', 'Cliente/obra', 'Alteração, dano ou problema originado na obra ou cliente.', 40),
    ('origem', 'Transporte', 'Dano ou problema ocorrido durante transporte.', 50),
    ('origem', 'Outro', 'Origem não classificada.', 90),
    ('motivo', 'Medida divergente', 'Peça retornou por medida divergente.', 10),
    ('motivo', 'Material danificado', 'Peça retornou com dano em material ou componente.', 20),
    ('motivo', 'Funcionamento inadequado', 'Peça retornou por problema de funcionamento.', 30),
    ('motivo', 'Acabamento', 'Peça retornou por acabamento ou estética.', 40),
    ('motivo', 'Peça incompleta', 'Peça retornou por falta de item, acessório ou componente.', 50),
    ('motivo', 'Outro', 'Motivo não classificado.', 90)
) as seed(kind, label, description, sort_order)
on conflict (company_id, kind, label) do nothing;

commit;
