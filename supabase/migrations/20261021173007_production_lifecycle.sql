-- Additive lifecycle. No legacy completion, archive, user or role assignment is inferred.
-- Apply only after an authorized production window and recoverable backup.
begin;
create schema if not exists production_lifecycle_private;
revoke all on schema production_lifecycle_private from public, anon, authenticated;

create table public.production_prod_lifecycle (
  prod_id uuid primary key references public.production_prods(id) on delete restrict,
  company_id uuid not null references public.companies(id),
  state text not null default 'em_andamento' check (state in ('em_andamento','concluida','cancelada')),
  manufacturing_state text not null default 'nao_iniciada' check (manufacturing_state in ('nao_iniciada','em_andamento','concluida')),
  expedition_state text not null default 'sem_saida' check (expedition_state in ('sem_saida','parcial','total')),
  total_quantity integer not null default 0,
  manufactured_quantity integer not null default 0,
  dispatched_quantity integer not null default 0,
  cancelled_quantity integer not null default 0,
  blocker_count integer not null default 0,
  archived_stage_count integer not null default 0,
  manufactured_at timestamptz,
  completed_at timestamptz,
  archived_at timestamptz,
  archived_by uuid references public.profiles(id),
  archive_reason text,
  check ((state = 'concluida') = (completed_at is not null))
);
create table public.production_contract_lifecycle (
  contract_id uuid primary key references public.production_contracts(id) on delete restrict,
  company_id uuid not null references public.companies(id),
  scope_confirmed_at timestamptz,
  scope_confirmed_by uuid references public.profiles(id),
  scope_evidence text,
  completed_at timestamptz,
  completed_by uuid references public.profiles(id),
  archived_at timestamptz,
  archived_by uuid references public.profiles(id),
  archive_reason text
);
create table public.production_piece_dispositions (
  piece_id uuid primary key references public.production_prod_pieces(id) on delete restrict,
  company_id uuid not null references public.companies(id),
  prod_id uuid not null references public.production_prods(id),
  cancelled_at timestamptz,
  actor_id uuid not null references public.profiles(id),
  reason text not null check (length(trim(reason)) between 3 and 1000)
);
create table public.production_piece_dispatches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  prod_id uuid not null references public.production_prods(id),
  piece_id uuid not null references public.production_prod_pieces(id),
  actor_id uuid not null references public.profiles(id),
  romaneio text not null check (length(trim(romaneio)) between 3 and 200),
  departed_at timestamptz not null default now(),
  quantity integer not null check (quantity > 0),
  piece_snapshot jsonb not null,
  voided_at timestamptz,
  void_reason text,
  check ((voided_at is null) = (void_reason is null))
);
create unique index production_piece_dispatches_active on public.production_piece_dispatches(piece_id) where voided_at is null;
create index production_piece_dispatches_prod on public.production_piece_dispatches(company_id,prod_id,departed_at);
create table public.production_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  contract_id uuid not null references public.production_contracts(id),
  prod_id uuid references public.production_prods(id),
  actor_id uuid references public.profiles(id),
  event text not null,
  occurred_at timestamptz not null default now(),
  reason text not null,
  details jsonb not null default '{}'
);
create index production_lifecycle_events_contract on public.production_lifecycle_events(company_id,contract_id,occurred_at);
create index production_lifecycle_events_prod on public.production_lifecycle_events(prod_id,occurred_at);
create index production_prod_lifecycle_company on public.production_prod_lifecycle(company_id,state,completed_at);
create index production_contract_lifecycle_company on public.production_contract_lifecycle(company_id,completed_at);
create index production_piece_dispositions_prod on public.production_piece_dispositions(company_id,prod_id);

-- New permissions are catalogued, never assigned automatically to existing users/roles.
insert into public.permissions(key,description) values
 ('production.contracts.confirm_scope','Confirmar encerramento das liberações pelo Técnico'),
 ('production.contracts.close','Encerrar contrato na Produção')
on conflict(key) do nothing;

-- Keep the same administrator definition as server access: active Master flag or active Master role.
-- Only a boolean for the current identity is exposed; no arbitrary user lookup.
create function production_lifecycle_private.is_admin()
returns boolean language sql stable security definer set search_path='' as $$
 select public.is_master() or (auth.uid() is not null and exists(
  select 1 from public.profiles p join public.user_roles ur on ur.profile_id=p.id
  join public.roles r on r.id=ur.role_id
  where p.user_id=auth.uid() and p.status='active' and p.company_id=public.current_company_id()
    and ur.company_id=p.company_id and r.company_id=p.company_id and r.active and r.is_master_role
 ));
$$;
create function public.production_lifecycle_is_admin()
returns boolean language sql stable security invoker set search_path='' as $$
 select production_lifecycle_private.is_admin();
$$;
revoke all on function public.production_lifecycle_is_admin() from public,anon;
grant execute on function public.production_lifecycle_is_admin() to authenticated,service_role;

-- Read-only to sessions; all writes use a checked, server-only invoker RPC or private triggers.
do $$ declare t text; begin
 foreach t in array array['production_prod_lifecycle','production_contract_lifecycle','production_piece_dispositions','production_piece_dispatches','production_lifecycle_events'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from public,anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
  execute format('grant select,insert,update on public.%I to service_role',t);
  execute format('create policy lifecycle_read on public.%I for select to authenticated using (company_id=public.current_company_id() and (public.production_lifecycle_is_admin() or public.has_permission(''production.prods.view'') or public.has_permission(''production.contracts.view'') or public.has_permission(''production.pointing.view'') or public.has_permission(''production.pointing.perform'') or public.has_permission(''production.shipping.manage'') or public.has_permission(''production.dashboard.view'') or public.has_permission(''production.reports.view'')))',t);
 end loop;
end $$;

create function production_lifecycle_private.record_event(p_prod uuid,p_contract uuid,p_event text,p_reason text,p_actor uuid default null,p_details jsonb default '{}')
returns void language sql security definer set search_path='' as $$
 insert into public.production_lifecycle_events(company_id,contract_id,prod_id,event,reason,actor_id,details)
 select c.company_id,c.id,p_prod,p_event,p_reason,p_actor,p_details from public.production_contracts c where c.id=p_contract;
$$;

-- Required manufacturing slots are fixed 5..8. Inactive/missing definitions do not make work complete.
create function production_lifecycle_private.piece_manufactured(p_piece uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select coalesce((select p.released_to_production and not exists (
   select 1 from generate_series(5,8) required(slot) where not exists (
    select 1 from public.production_prod_piece_stages ps join public.production_stages s on s.id=ps.stage_id and s.company_id=p.company_id
    where ps.piece_id=p.id and ps.prod_id=p.prod_id and ps.company_id=p.company_id and s.sort_order=required.slot
      and ps.status in ('concluida','nao_aplicavel') and ps.completed_at is not null
      and nullif(trim(ps.blockers),'') is null
      and not exists(select 1 from public.production_expedition_archives a where a.piece_stage_id=ps.id and a.restored_at is null)
   )) from public.production_prod_pieces p where p.id=p_piece),false);
$$;
create function production_lifecycle_private.blockers(p_prod uuid)
returns integer language sql stable security definer set search_path='' as $$
 select (
  (select count(*) from public.production_prod_piece_stages ps where ps.prod_id=p_prod and (ps.status='com_pendencia' or nullif(trim(ps.blockers),'') is not null))+
  (select count(*) from public.production_prod_stages ps join public.production_stages s on s.id=ps.stage_id where ps.prod_id=p_prod and s.sort_order<>10 and (ps.status='com_pendencia' or nullif(trim(ps.blockers),'') is not null))+
  (select count(*) from public.production_prod_materials m where m.prod_id=p_prod and nullif(trim(m.blockers),'') is not null)+
  (select count(*) from public.production_piece_reworks r where r.prod_id=p_prod and r.status not in ('concluido','cancelado'))
 )::integer;
$$;

-- Preparing the load is distinct from departure, but its evidence must remain
-- valid for a departure to count toward completion.
create function production_lifecycle_private.piece_loaded(p_piece uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists (
  select 1 from public.production_prod_pieces p
  join public.production_prod_piece_stages ps on ps.piece_id=p.id and ps.prod_id=p.prod_id and ps.company_id=p.company_id
  join public.production_stages s on s.id=ps.stage_id and s.company_id=p.company_id
  where p.id=p_piece and s.sort_order=9 and ps.status='concluida'
   and ps.completed_at is not null and ps.load_volume_count>0
 );
$$;

create function production_lifecycle_private.refresh(p_prod uuid)
returns void language plpgsql security definer set search_path='' as $$
declare p record; old_state public.production_prod_lifecycle; n integer; m integer; d integer; c integer; a integer; b integer; next_state text; manufacture text; manufactured_time timestamptz;
begin
 select * into p from public.production_prods where id=p_prod;
 if not found then return; end if;
 perform pg_advisory_xact_lock(hashtextextended(p.company_id::text,721));
 insert into public.production_prod_lifecycle(prod_id,company_id) values(p.id,p.company_id) on conflict do nothing;
 select * into old_state from public.production_prod_lifecycle where prod_id=p.id;
 select coalesce(sum(x.quantity),0),
   coalesce(sum(x.quantity) filter(where q.cancelled_at is null and production_lifecycle_private.piece_manufactured(x.id)),0),
   coalesce(sum(x.quantity) filter(where q.cancelled_at is not null),0),
   coalesce(sum(x.quantity) filter(where q.cancelled_at is null and production_lifecycle_private.piece_loaded(x.id) and exists(select 1 from public.production_piece_dispatches e where e.piece_id=x.id and e.voided_at is null and e.quantity=x.quantity)),0)
 into n,m,c,d from public.production_prod_pieces x left join public.production_piece_dispositions q on q.piece_id=x.id where x.prod_id=p.id;
 select count(*) into a from public.production_expedition_archives ar join public.production_prod_piece_stages ps on ps.id=ar.piece_stage_id where ps.prod_id=p.id and ar.restored_at is null;
 b := production_lifecycle_private.blockers(p.id);
 manufacture := case when n>c and m=n-c and a=0 then 'concluida'
  when exists(select 1 from public.production_prod_piece_stages ps where ps.prod_id=p.id and ps.status not in ('aguardando','nao_iniciada')) then 'em_andamento' else 'nao_iniciada' end;
 -- The manufacturing date comes from recorded facts, never from the migration date.
 if manufacture='concluida' then
  select max(ps.completed_at) into manufactured_time from public.production_prod_piece_stages ps join public.production_stages s on s.id=ps.stage_id
  where ps.prod_id=p.id and s.sort_order between 5 and 8 and not exists(select 1 from public.production_piece_dispositions q where q.piece_id=ps.piece_id and q.cancelled_at is not null);
 end if;
 next_state := case when old_state.archived_at is not null then 'em_andamento'
   when n>0 and c=n and a=0 and b=0 then 'cancelada'
   when n>c and m=n-c and d=n-c and a=0 and b=0 then 'concluida' else 'em_andamento' end;
 update public.production_prod_lifecycle set state=next_state,manufacturing_state=manufacture,
  expedition_state=case when d=0 then 'sem_saida' when d=n-c and n>c then 'total' else 'parcial' end,
  total_quantity=n,manufactured_quantity=m,cancelled_quantity=c,dispatched_quantity=d,blocker_count=b,archived_stage_count=a,
  manufactured_at=manufactured_time,
  completed_at=case when next_state='concluida' then coalesce(old_state.completed_at,now()) else null end where prod_id=p.id;
 if old_state.state is distinct from next_state then
  perform production_lifecycle_private.record_event(p.id,p.contract_id,
   case when next_state='concluida' then 'prod_concluida' when next_state='cancelada' then 'prod_cancelada' else 'prod_reaberta' end,
   'Reavaliação automática de todo o escopo',null,jsonb_build_object('before',old_state.state,'after',next_state));
 end if;
 if next_state<>'concluida' and next_state<>'cancelada' and exists(select 1 from public.production_contract_lifecycle where contract_id=p.contract_id and completed_at is not null) then
  perform production_lifecycle_private.record_event(null,p.contract_id,'contrato_reaberto','PROD com trabalho, pendência ou arquivamento');
  update public.production_contract_lifecycle set completed_at=null,completed_by=null where contract_id=p.contract_id;
 end if;
end $$;

create function production_lifecycle_private.invalidate_scope(p_contract uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.production_contract_lifecycle where contract_id=p_contract and (scope_confirmed_at is not null or completed_at is not null)) then
  perform production_lifecycle_private.record_event(null,p_contract,'escopo_reaberto',p_reason);
  update public.production_contract_lifecycle set scope_confirmed_at=null,scope_confirmed_by=null,scope_evidence=null,completed_at=null,completed_by=null where contract_id=p_contract;
 end if;
end $$;

-- All affected mutations serialize before their effects are calculated; any failure aborts the mutation.
create function production_lifecycle_private.before_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; prior jsonb; prod uuid; contract uuid; company uuid;
begin
 r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 prior:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 company:=(r->>'company_id')::uuid;
 perform pg_advisory_xact_lock(hashtextextended(company::text,721));
 if tg_table_name='production_contracts' then contract:=(r->>'id')::uuid;
 elsif tg_table_name='production_prods' then prod:=(r->>'id')::uuid; contract:=(r->>'contract_id')::uuid;
 elsif tg_table_name='production_expedition_archives' then select ps.prod_id into prod from public.production_prod_piece_stages ps where ps.id=(r->>'piece_stage_id')::uuid;
 else prod:=(r->>'prod_id')::uuid; end if;
 if prod is not null and contract is null then select p.contract_id into contract from public.production_prods p where p.id=prod and p.company_id=company; end if;
 if tg_table_name='production_expedition_archives' and not exists(select 1 from public.production_prod_piece_stages ps where ps.id=(r->>'piece_stage_id')::uuid and ps.company_id=company) then raise exception 'Etapa fora da empresa.'; end if;
 if not exists(select 1 from public.production_contracts c where c.id=contract and c.company_id=company) and not (tg_table_name='production_contracts' and tg_op='INSERT') then raise exception 'Vínculo de empresa/contrato inválido.'; end if;
 if tg_op='UPDATE' and (r->>'company_id' is distinct from prior->>'company_id' or r->>'prod_id' is distinct from prior->>'prod_id' or r->>'contract_id' is distinct from prior->>'contract_id' or r->>'piece_id' is distinct from prior->>'piece_id' or r->>'piece_stage_id' is distinct from prior->>'piece_stage_id' or r->>'stage_id' is distinct from prior->>'stage_id') then raise exception 'Não é permitido transferir registros entre escopos. Registre a destinação formal.'; end if;
 if tg_op='DELETE' and tg_table_name in ('production_contracts','production_prods','production_prod_pieces','production_prod_piece_stages') then raise exception 'Preserve o escopo e o histórico: use cancelamento ou arquivamento.'; end if;
 if exists(select 1 from public.production_contract_lifecycle l where l.contract_id=contract and l.archived_at is not null) or exists(select 1 from public.production_prod_lifecycle l where l.prod_id=prod and l.archived_at is not null) then raise exception 'Registro arquivado. Restaure antes de alterar.'; end if;
 if tg_table_name='production_prods' then
  if (tg_op='INSERT' or r->>'status' is distinct from prior->>'status') and r->>'status' in ('concluida','cancelada') then raise exception 'Conclusão e cancelamento são calculados pelo escopo das peças.'; end if;
  if (tg_op='INSERT' and r->>'actual_end_date' is not null) or (tg_op='UPDATE' and r->>'actual_end_date' is distinct from prior->>'actual_end_date') then raise exception 'A conclusão oficial é registrada automaticamente.'; end if;
 end if;
 if tg_table_name='production_contracts' and tg_op='UPDATE' and (r->>'status' is distinct from prior->>'status' or r->>'active' is distinct from prior->>'active') then raise exception 'Use o encerramento ou arquivamento do contrato.'; end if;
 if tg_table_name='production_prod_pieces' and tg_op='UPDATE' and (r - array['updated_at','notes']) is distinct from (prior - array['updated_at','notes']) and exists(select 1 from public.production_piece_dispositions q where q.piece_id=(r->>'id')::uuid and q.cancelled_at is not null) then raise exception 'Restaure a peça cancelada antes de alterar seu escopo.'; end if;
 if tg_table_name in ('production_prod_piece_stages','production_piece_reworks','production_stage_time_entries') then
  if not exists(select 1 from public.production_prod_pieces p where p.id=(r->>'piece_id')::uuid and p.prod_id=prod and p.company_id=company) then raise exception 'Peça fora do escopo da PROD.'; end if;
  if exists(select 1 from public.production_piece_dispositions q where q.piece_id=(r->>'piece_id')::uuid and q.cancelled_at is not null) then raise exception 'Peça cancelada. Restaure sua destinação antes do apontamento.'; end if;
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;

create function production_lifecycle_private.after_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare r jsonb; prior jsonb; prod uuid; piece uuid; contract uuid; invalidate boolean:=false;
begin
 r:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
 prior:=case when tg_op='INSERT' then '{}'::jsonb else to_jsonb(old) end;
 if tg_table_name='production_contracts' then return null;
 elsif tg_table_name='production_prods' then prod:=(r->>'id')::uuid;
 elsif tg_table_name='production_expedition_archives' then select ps.prod_id,ps.piece_id into prod,piece from public.production_prod_piece_stages ps where ps.id=(r->>'piece_stage_id')::uuid;
 else prod:=(r->>'prod_id')::uuid; piece:=(r->>'piece_id')::uuid; end if;
 select p.contract_id into contract from public.production_prods p where p.id=prod;
 if tg_table_name='production_prod_pieces' then
  piece:=(r->>'id')::uuid;
  invalidate:=tg_op<>'UPDATE' or (r - array['updated_at','notes','sort_order','released_at','released_by']) is distinct from (prior - array['updated_at','notes','sort_order','released_at','released_by']);
  if invalidate then perform production_lifecycle_private.invalidate_scope(contract,'Alteração do escopo de peças'); end if;
 elsif tg_table_name='production_prods' and tg_op='INSERT' then
  perform production_lifecycle_private.invalidate_scope(contract,'Nova PROD cadastrada');
 elsif tg_table_name='production_prod_piece_stages' then
  invalidate:=tg_op='DELETE'
   or (r->>'status' is distinct from prior->>'status' and r->>'status' not in ('concluida','nao_aplicavel'))
   or exists(select 1 from public.production_stages s where s.id=(r->>'stage_id')::uuid and (
    (s.sort_order between 5 and 8 and (r->>'completed_at' is null or r->>'status' not in ('concluida','nao_aplicavel')))
    or (s.sort_order=9 and not production_lifecycle_private.piece_loaded(piece))
   ));
 elsif tg_table_name='production_piece_reworks' then invalidate:=r->>'status' not in ('concluido','cancelado');
 elsif tg_table_name='production_expedition_archives' then invalidate:=r->>'restored_at' is null;
 end if;
 if invalidate and piece is not null then
  update public.production_piece_dispatches set voided_at=now(),void_reason='Retorno, retrabalho, arquivamento ou mudança do escopo' where piece_id=piece and voided_at is null;
  if found then perform production_lifecycle_private.record_event(prod,contract,'saida_invalidada','Saída anterior preservada; nova saída será necessária',null,jsonb_build_object('piece_id',piece)); end if;
 end if;
 perform production_lifecycle_private.refresh(prod);
 return null;
end $$;

do $$ declare t text; begin
 foreach t in array array['production_contracts','production_prods','production_prod_pieces','production_prod_piece_stages','production_prod_stages','production_prod_materials','production_piece_reworks','production_expedition_archives','production_prod_document_checks','production_prod_selected_items','production_shipping_records','production_piece_imports','production_stage_time_entries'] loop
  execute format('create trigger lifecycle_before before insert or update or delete on public.%I for each row execute function production_lifecycle_private.before_change()',t);
  execute format('create trigger lifecycle_after after insert or update or delete on public.%I for each row execute function production_lifecycle_private.after_change()',t);
 end loop;
end $$;

create function production_lifecycle_private.protect_stage_identity()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
 if (old.sort_order between 5 and 9) and (tg_op='DELETE' or old.sort_order is distinct from new.sort_order or old.company_id is distinct from new.company_id) then
  raise exception 'As etapas de fabricação e expedição preservam sua identidade para comprovar o histórico.';
 end if;
 if tg_op='DELETE' then return old; end if; return new;
end $$;
create trigger lifecycle_stage_identity before update or delete on public.production_stages for each row execute function production_lifecycle_private.protect_stage_identity();

create function production_lifecycle_private.protect_session()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(new.company_id::text,721));
 if exists(select 1 from unnest(new.prod_ids) x where not exists(select 1 from public.production_prods p where p.id=x and p.company_id=new.company_id)) then raise exception 'Sessão com PROD fora da empresa.'; end if;
 if exists(select 1 from public.production_prod_lifecycle l where l.prod_id=any(new.prod_ids) and (l.archived_at is not null or l.state='cancelada')) then raise exception 'A sessão contém PROD arquivada ou cancelada.'; end if;
 return new;
end $$;
create trigger lifecycle_session_before before insert or update on public.production_pointing_sessions for each row execute function production_lifecycle_private.protect_session();

-- Server-only RPC; invoker retains service_role permissions. User identity is resolved and
-- authorized by the server, then checked again against active DB profile/roles in this transaction.
create function public.production_lifecycle_command(p_actor uuid,p_entity uuid,p_command text,p_reason text,p_piece_ids uuid[] default '{}',p_reference text default null)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.profiles; company uuid; prod uuid; contract uuid; permission text; master boolean; item record; l public.production_prod_lifecycle; archived boolean;
begin
 select * into actor from public.profiles where id=p_actor and status='active';
 if not found then raise exception 'Perfil ativo obrigatório.'; end if;
 company:=actor.company_id;
 master:=actor.is_master or exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.profile_id=actor.id and ur.company_id=company and r.company_id=company and r.active and r.is_master_role);
 permission:=case p_command
  when 'dispatch' then 'production.shipping.manage'
  when 'return_dispatch' then 'production.pointing.rollback'
  when 'cancel_pieces' then 'production.prods.manage_pieces'
  when 'restore_pieces' then 'production.prods.manage_pieces'
  when 'confirm_scope' then 'production.contracts.confirm_scope'
  when 'reopen_scope' then 'production.contracts.confirm_scope'
  when 'close_contract' then 'production.contracts.close'
  when 'reopen_contract' then 'production.contracts.close'
  when 'archive_prod' then 'master_only' when 'restore_prod' then 'master_only'
  when 'archive_contract' then 'master_only' when 'restore_contract' then 'master_only'
  else null end;
 if permission is null then raise exception 'Comando inválido.'; end if;
 if not master and not exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id join public.role_permissions rp on rp.role_id=r.id join public.permissions pm on pm.id=rp.permission_id where ur.profile_id=actor.id and ur.company_id=company and r.company_id=company and rp.company_id=company and r.active and pm.key=permission) then raise exception 'Sem permissão para esta operação.'; end if;
 if p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Informe motivo ou evidência entre 3 e 1000 caracteres.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(company::text,721));
 if p_command in ('confirm_scope','reopen_scope','close_contract','reopen_contract','archive_contract','restore_contract') then
  select c.id into contract from public.production_contracts c where c.id=p_entity and c.company_id=company;
 else
  select p.id,p.contract_id into prod,contract from public.production_prods p where p.id=p_entity and p.company_id=company;
 end if;
 if contract is null then raise exception 'Registro não encontrado na empresa.'; end if;
 insert into public.production_contract_lifecycle(contract_id,company_id) values(contract,company) on conflict do nothing;
 if prod is not null then perform production_lifecycle_private.refresh(prod); end if;
 if exists(select 1 from public.production_contract_lifecycle x where x.contract_id=contract and x.archived_at is not null) and p_command<>'restore_contract' then raise exception 'Restaure o contrato antes de continuar.'; end if;
 if prod is not null and exists(select 1 from public.production_prod_lifecycle x where x.prod_id=prod and x.archived_at is not null) and p_command<>'restore_prod' then raise exception 'Restaure a PROD antes de continuar.'; end if;
 if p_command in ('dispatch','return_dispatch','cancel_pieces','restore_pieces') then
  if coalesce(cardinality(p_piece_ids),0) not between 1 and 500 or array_position(p_piece_ids,null) is not null or cardinality(p_piece_ids)<>(select count(distinct v) from unnest(p_piece_ids) v) then raise exception 'Selecione entre 1 e 500 peças distintas.'; end if;
  if (select count(*) from public.production_prod_pieces where id=any(p_piece_ids) and prod_id=prod and company_id=company)<>cardinality(p_piece_ids) then raise exception 'Há peça fora da PROD selecionada.'; end if;
  if p_command='dispatch' and (p_reference is null or length(trim(p_reference)) not between 3 and 200) then raise exception 'Informe a identificação do romaneio.'; end if;
  for item in select * from public.production_prod_pieces where id=any(p_piece_ids) order by id loop
   if p_command='dispatch' then
    if not production_lifecycle_private.piece_manufactured(item.id) or production_lifecycle_private.blockers(prod)>0
      or exists(select 1 from public.production_piece_dispositions q where q.piece_id=item.id and q.cancelled_at is not null)
      or exists(select 1 from public.production_expedition_archives a join public.production_prod_piece_stages ps on ps.id=a.piece_stage_id where ps.piece_id=item.id and a.restored_at is null)
      or not production_lifecycle_private.piece_loaded(item.id)
    then raise exception 'Peça % sem fabricação/carga concluída ou com impedimento.',item.piece_code; end if;
    if exists(select 1 from public.production_piece_dispatches e where e.piece_id=item.id and e.voided_at is null) then raise exception 'Saída já registrada para a peça %.',item.piece_code; end if;
    insert into public.production_piece_dispatches(company_id,prod_id,piece_id,actor_id,romaneio,quantity,piece_snapshot) values(company,prod,item.id,actor.id,trim(p_reference),item.quantity,to_jsonb(item));
   elsif p_command='return_dispatch' then
    update public.production_piece_dispatches set voided_at=now(),void_reason=trim(p_reason) where piece_id=item.id and voided_at is null;
    if not found then raise exception 'Peça % sem saída vigente.',item.piece_code; end if;
   else
    if p_command='cancel_pieces' and (exists(select 1 from public.production_piece_dispatches e where e.piece_id=item.id and e.voided_at is null) or exists(select 1 from public.production_prod_piece_stages ps where ps.piece_id=item.id and ps.status in ('em_andamento','pausada')) or exists(select 1 from public.production_piece_reworks rw where rw.piece_id=item.id and rw.status not in ('concluido','cancelado'))) then raise exception 'Encerre apontamentos/retrabalho e registre o retorno antes de cancelar.'; end if;
    insert into public.production_piece_dispositions(piece_id,company_id,prod_id,cancelled_at,actor_id,reason) values(item.id,company,prod,case when p_command='cancel_pieces' then now() else null end,actor.id,trim(p_reason)) on conflict(piece_id) do update set cancelled_at=excluded.cancelled_at,actor_id=excluded.actor_id,reason=excluded.reason;
    perform production_lifecycle_private.invalidate_scope(contract,'Destinação de peça alterada');
   end if;
  end loop;
 elsif p_command='confirm_scope' then
  if not exists(select 1 from public.production_prods where contract_id=contract) then raise exception 'Contrato sem PRODs não pode ter o escopo encerrado.'; end if;
  if exists(select 1 from public.production_prods p join public.production_prod_lifecycle pl on pl.prod_id=p.id where p.contract_id=contract and pl.archived_at is not null) or exists(select 1 from public.production_prods p join public.production_prod_piece_stages ps on ps.prod_id=p.id join public.production_expedition_archives a on a.piece_stage_id=ps.id where p.contract_id=contract and a.restored_at is null) then raise exception 'Escopo com registros arquivados exige reconciliação antes da confirmação.'; end if;
  update public.production_contract_lifecycle set scope_confirmed_at=now(),scope_confirmed_by=actor.id,scope_evidence=trim(p_reason) where contract_id=contract;
  if exists(select 1 from public.production_prods p where p.contract_id=contract and not exists(select 1 from public.production_prod_pieces x where x.prod_id=p.id)) or exists(select 1 from public.production_prod_pieces x join public.production_prods p on p.id=x.prod_id where p.contract_id=contract and not x.released_to_production and not exists(select 1 from public.production_piece_dispositions q where q.piece_id=x.id and q.cancelled_at is not null)) then raise exception 'Há PRODs vazias ou peças ainda não liberadas nem formalmente canceladas.'; end if;
 elsif p_command='close_contract' then
  for item in select id from public.production_prods where contract_id=contract loop perform production_lifecycle_private.refresh(item.id); end loop;
  if not exists(select 1 from public.production_contract_lifecycle where contract_id=contract and scope_confirmed_at is not null) then raise exception 'Falta confirmação do escopo pelo Técnico.'; end if;
  if not exists(select 1 from public.production_prods p join public.production_prod_lifecycle pl on pl.prod_id=p.id where p.contract_id=contract and pl.state='concluida' and pl.archived_at is null) then raise exception 'É necessária ao menos uma PROD efetivamente concluída. Cancelamento não é produção.'; end if;
  if exists(select 1 from public.production_prods p left join public.production_prod_lifecycle pl on pl.prod_id=p.id where p.contract_id=contract and (pl.state is null or pl.state not in ('concluida','cancelada') or pl.archived_at is not null or pl.blocker_count>0 or pl.archived_stage_count>0)) then raise exception 'Há PRODs ou pendências que impedem o encerramento.'; end if;
  if exists(select 1 from public.production_contract_lifecycle where contract_id=contract and completed_at is not null) then raise exception 'Contrato já encerrado.'; end if;
  update public.production_contract_lifecycle set completed_at=now(),completed_by=actor.id where contract_id=contract;
 elsif p_command in ('reopen_scope','reopen_contract') then
  perform production_lifecycle_private.invalidate_scope(contract,trim(p_reason));
 elsif p_command in ('archive_prod','restore_prod') then
  select * into l from public.production_prod_lifecycle where prod_id=prod;
  if p_command='archive_prod' and (l.completed_at is not null or l.blocker_count>0 or exists(select 1 from public.production_prod_piece_stages ps where ps.prod_id=prod and ps.status in ('em_andamento','pausada'))) then raise exception 'Conclusões comprovadas, pendências ou apontamentos ativos não podem ser ocultados por arquivamento.'; end if;
  update public.production_prod_lifecycle set archived_at=case when p_command='archive_prod' then now() else null end,archived_by=case when p_command='archive_prod' then actor.id else null end,archive_reason=case when p_command='archive_prod' then trim(p_reason) else null end where prod_id=prod;
  perform production_lifecycle_private.invalidate_scope(contract,trim(p_reason));
 elsif p_command in ('archive_contract','restore_contract') then
  if p_command='archive_contract' and (exists(select 1 from public.production_contract_lifecycle where contract_id=contract and completed_at is not null) or exists(select 1 from public.production_prods p left join public.production_prod_lifecycle pl on pl.prod_id=p.id where p.contract_id=contract and pl.archived_at is null)) then raise exception 'Arquive individualmente todas as PRODs antes do contrato; concluídos ficam no histórico oficial.'; end if;
  update public.production_contract_lifecycle set archived_at=case when p_command='archive_contract' then now() else null end,archived_by=case when p_command='archive_contract' then actor.id else null end,archive_reason=case when p_command='archive_contract' then trim(p_reason) else null end where contract_id=contract;
  perform production_lifecycle_private.invalidate_scope(contract,trim(p_reason));
 end if;
 perform production_lifecycle_private.record_event(prod,contract,p_command,trim(p_reason),actor.id,jsonb_build_object('piece_ids',p_piece_ids,'romaneio',p_reference));
 if prod is not null then perform production_lifecycle_private.refresh(prod); end if;
 return jsonb_build_object('ok',true,'prod_id',prod,'contract_id',contract);
end $$;
revoke all on function public.production_lifecycle_command(uuid,uuid,text,text,uuid[],text) from public,anon,authenticated;
grant execute on function public.production_lifecycle_command(uuid,uuid,text,text,uuid[],text) to service_role;
revoke all on all functions in schema production_lifecycle_private from public,anon,authenticated;
grant usage on schema production_lifecycle_private to service_role;
grant execute on all functions in schema production_lifecycle_private to service_role;
grant usage on schema production_lifecycle_private to authenticated;
grant execute on function production_lifecycle_private.is_admin() to authenticated;

-- Bound to the current company/identity. Definer lookup avoids RLS recursion and ensures
-- hiding a lifecycle summary cannot make an archived parent look absent to a child policy.
create function production_lifecycle_private.contract_visible(p_contract uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.production_contracts c where c.id=p_contract
  and c.company_id=public.current_company_id() and (production_lifecycle_private.is_admin()
   or not exists(select 1 from public.production_contract_lifecycle l where l.contract_id=c.id and l.archived_at is not null)));
$$;
create function production_lifecycle_private.prod_visible(p_prod uuid)
returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.production_prods p where p.id=p_prod
  and p.company_id=public.current_company_id() and production_lifecycle_private.contract_visible(p.contract_id)
  and (production_lifecycle_private.is_admin()
   or not exists(select 1 from public.production_prod_lifecycle l where l.prod_id=p.id and l.archived_at is not null)));
$$;
revoke all on function production_lifecycle_private.contract_visible(uuid),production_lifecycle_private.prod_visible(uuid) from public,anon,authenticated;
grant execute on function production_lifecycle_private.contract_visible(uuid),production_lifecycle_private.prod_visible(uuid) to authenticated,service_role;

-- Existing allow policies remain unchanged. Archive isolation is restrictive and additive.
create policy lifecycle_archive_contract_read on public.production_contracts as restrictive for select to authenticated using (
 production_lifecycle_private.contract_visible(id)
);
create policy lifecycle_archive_prod_read on public.production_prods as restrictive for select to authenticated using (
 production_lifecycle_private.prod_visible(id)
);
create policy lifecycle_archive_contract_summary_read on public.production_contract_lifecycle as restrictive for select to authenticated using (
 production_lifecycle_private.contract_visible(contract_id)
);
create policy lifecycle_archive_prod_summary_read on public.production_prod_lifecycle as restrictive for select to authenticated using (
 production_lifecycle_private.prod_visible(prod_id)
);
do $$ declare t text; begin
 foreach t in array array['production_prod_pieces','production_prod_piece_stages','production_prod_stages','production_prod_materials','production_piece_reworks','production_prod_document_checks','production_prod_selected_items','production_shipping_records','production_piece_imports','production_stage_time_entries','production_piece_dispatches','production_piece_dispositions'] loop
  execute format('create policy lifecycle_archive_child_read on public.%I as restrictive for select to authenticated using (production_lifecycle_private.prod_visible(prod_id))',t);
 end loop;
end $$;
create policy lifecycle_archive_event_read on public.production_lifecycle_events as restrictive for select to authenticated using (
 production_lifecycle_private.contract_visible(contract_id)
 and (prod_id is null or production_lifecycle_private.prod_visible(prod_id))
);
create function production_lifecycle_private.immutable_event()
returns trigger language plpgsql security invoker set search_path='' as $$
begin raise exception 'Eventos de conclusão e escopo são imutáveis.'; end $$;
revoke all on function production_lifecycle_private.immutable_event() from public,anon,authenticated;
create trigger lifecycle_immutable_event before update or delete on public.production_lifecycle_events for each row execute function production_lifecycle_private.immutable_event();

-- Initialize summaries from existing facts without rewriting any original status/date/pointing.
-- No physical departures exist in the new ledger, so this cannot create legacy completions.
do $$ declare p record; begin
 for p in select id from public.production_prods order by id loop
  perform production_lifecycle_private.refresh(p.id);
 end loop;
end $$;

commit;
