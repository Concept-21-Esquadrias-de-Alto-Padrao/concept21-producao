begin;

create table public.production_romaneios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  prod_id uuid not null references public.production_prods(id) on delete restrict,
  issue_year integer not null check (issue_year between 2020 and 9999),
  sequence_number integer not null check (sequence_number between 1 and 999999),
  number text not null,
  report jsonb not null check (jsonb_typeof(report) = 'object'),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (company_id, issue_year, sequence_number),
  unique (company_id, number)
);
create index production_romaneios_prod_history on public.production_romaneios(company_id, prod_id, created_at desc);

create table public.production_romaneio_items (
  romaneio_id uuid not null references public.production_romaneios(id) on delete restrict,
  company_id uuid not null references public.companies(id),
  prod_id uuid not null references public.production_prods(id) on delete restrict,
  piece_stage_id uuid primary key references public.production_prod_piece_stages(id) on delete restrict
);
create index production_romaneio_items_document on public.production_romaneio_items(romaneio_id);

alter table public.production_romaneios enable row level security;
alter table public.production_romaneio_items enable row level security;
revoke all on public.production_romaneios, public.production_romaneio_items from public, anon, authenticated;
grant select on public.production_romaneios, public.production_romaneio_items to authenticated;
grant select, insert on public.production_romaneios, public.production_romaneio_items to service_role;
create policy romaneio_read on public.production_romaneios for select to authenticated
 using (company_id = (select public.current_company_id()) and
   ((select public.production_lifecycle_is_admin()) or
    (select public.has_permission('production.prods.view')) or
    (select public.has_permission('production.pointing.view')) or
    (select public.has_permission('production.shipping.manage'))));
create policy romaneio_item_read on public.production_romaneio_items for select to authenticated
 using (company_id = (select public.current_company_id()) and
   ((select public.production_lifecycle_is_admin()) or
    (select public.has_permission('production.prods.view')) or
    (select public.has_permission('production.pointing.view')) or
    (select public.has_permission('production.shipping.manage'))));

-- The server supplies the snapshot; this transaction checks its source rows,
-- allocates a company/year number, and binds each expedition stage only once.
create function public.production_romaneio_issue(
  p_actor uuid, p_prod uuid, p_piece_stage_ids uuid[], p_report jsonb
)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  actor public.profiles;
  company uuid;
  item_count integer;
  expected_volumes integer;
  expected_items integer;
  next_number integer;
  current_year integer;
  document_number text;
  document_id uuid;
  master boolean;
begin
  select * into actor from public.profiles where id = p_actor and status = 'active';
  if not found then raise exception 'Perfil ativo obrigatório.'; end if;
  company := actor.company_id;
  master := actor.is_master or exists(
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
    where ur.profile_id = actor.id and ur.company_id = company and r.company_id = company
      and r.active and r.is_master_role
  );
  if not master and not exists(
    select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
      join public.role_permissions rp on rp.role_id = r.id
      join public.permissions pm on pm.id = rp.permission_id
    where ur.profile_id = actor.id and ur.company_id = company and r.company_id = company
      and rp.company_id = company and r.active
      and pm.key in ('production.pointing.perform', 'production.shipping.manage')
  ) then raise exception 'Sem permissão para emitir romaneio.'; end if;
  if not exists(
    select 1 from public.production_prods p
      join public.production_contracts c on c.id = p.contract_id and c.company_id = company
      left join public.production_prod_lifecycle pl on pl.prod_id = p.id
      left join public.production_contract_lifecycle cl on cl.contract_id = c.id
    where p.id = p_prod and p.company_id = company and pl.archived_at is null and cl.archived_at is null
  ) then raise exception 'PROD não encontrada ou arquivada.'; end if;
  if coalesce(cardinality(p_piece_stage_ids), 0) not between 1 and 500
     or array_position(p_piece_stage_ids, null) is not null
     or cardinality(p_piece_stage_ids) <> (select count(distinct id) from unnest(p_piece_stage_ids) id)
  then raise exception 'Selecione de 1 a 500 peças distintas.'; end if;
  if jsonb_typeof(p_report) is distinct from 'object' or jsonb_typeof(p_report->'rows') is distinct from 'array'
  then raise exception 'Dados do romaneio inválidos.'; end if;

  -- A single lock serializes both yearly numbering and assignment of pieces.
  current_year := extract(year from now() at time zone 'America/Sao_Paulo')::integer;
  perform pg_advisory_xact_lock(hashtextextended(company::text || ':' || current_year::text, 8821));
  perform 1 from public.production_prod_piece_stages ps where ps.id = any(p_piece_stage_ids) order by ps.id for update;

  select count(*)::integer, coalesce(sum(ps.load_volume_count), 0)::integer,
         coalesce(sum(piece.quantity), 0)::integer
    into item_count, expected_volumes, expected_items
  from public.production_prod_piece_stages ps
    join public.production_stages s on s.id = ps.stage_id and s.company_id = company and s.sort_order = 9
    join public.production_prod_pieces piece on piece.id = ps.piece_id and piece.prod_id = p_prod and piece.company_id = company
    left join public.production_piece_dispositions d on d.piece_id = piece.id
  where ps.id = any(p_piece_stage_ids) and ps.prod_id = p_prod and ps.company_id = company
    and ps.load_volume_count > 0 and d.cancelled_at is null
    and not exists(select 1 from public.production_expedition_archives a where a.piece_stage_id = ps.id and a.restored_at is null);
  if item_count <> cardinality(p_piece_stage_ids)
     or exists(select 1 from public.production_romaneio_items i where i.piece_stage_id = any(p_piece_stage_ids))
     or jsonb_array_length(p_report->'rows') <> item_count
     or (p_report->>'totalVolumes')::integer is distinct from expected_volumes
     or (p_report->>'totalItems')::integer is distinct from expected_items
  then raise exception 'Peças ou volumes mudaram, ou já constam de um romaneio. Atualize a página.'; end if;

  select coalesce(max(r.sequence_number), 0) + 1 into next_number
    from public.production_romaneios r where r.company_id = company and r.issue_year = current_year;
  if next_number > 999999 then raise exception 'Limite anual de romaneios atingido.'; end if;
  document_number := 'ROM-' || current_year::text || '-' || lpad(next_number::text, 6, '0');
  insert into public.production_romaneios(company_id, prod_id, issue_year, sequence_number, number, report, created_by)
  values(company, p_prod, current_year, next_number, document_number,
         p_report || jsonb_build_object('romaneioNumber', document_number), p_actor)
  returning id into document_id;
  insert into public.production_romaneio_items(romaneio_id, company_id, prod_id, piece_stage_id)
  select document_id, company, p_prod, id from unnest(p_piece_stage_ids) id;
  return document_id;
end $$;
revoke all on function public.production_romaneio_issue(uuid, uuid, uuid[], jsonb) from public, anon, authenticated;
grant execute on function public.production_romaneio_issue(uuid, uuid, uuid[], jsonb) to service_role;

commit;
