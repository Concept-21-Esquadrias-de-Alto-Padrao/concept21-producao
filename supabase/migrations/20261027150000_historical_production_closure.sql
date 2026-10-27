-- Historical declarations after a nominal portfolio review are distinct from
-- new-process manufacturing, dispatch and actual delivery dates.
-- Apply before the audited, UUID-scoped one-time regularization script.
begin;
alter table public.production_prod_lifecycle
  add column historical_recorded_at timestamptz,
  add column historical_reviewed_on date,
  add column historical_declared_by text,
  add column historical_statement text,
  add constraint production_prod_historical_complete check (
    (historical_recorded_at is null and historical_reviewed_on is null and historical_declared_by is null and historical_statement is null)
    or (historical_recorded_at is not null and historical_reviewed_on is not null and historical_declared_by is not null and historical_statement is not null and length(trim(historical_declared_by)) between 3 and 200 and length(trim(historical_statement)) between 3 and 1000 and completed_at is null and archived_at is null)
  );
alter table public.production_contract_lifecycle
  add column historical_recorded_at timestamptz,
  add column historical_reviewed_on date,
  add column historical_declared_by text,
  add column historical_statement text,
  add constraint production_contract_historical_complete check (
    (historical_recorded_at is null and historical_reviewed_on is null and historical_declared_by is null and historical_statement is null)
    or (historical_recorded_at is not null and historical_reviewed_on is not null and historical_declared_by is not null and historical_statement is not null and length(trim(historical_declared_by)) between 3 and 200 and length(trim(historical_statement)) between 3 and 1000 and completed_at is null and archived_at is null)
  );

create or replace function production_lifecycle_private.invalidate_scope(p_contract uuid,p_reason text)
returns void language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from public.production_contract_lifecycle where contract_id=p_contract and (scope_confirmed_at is not null or completed_at is not null or historical_recorded_at is not null)) then
  perform production_lifecycle_private.record_event(null,p_contract,'escopo_reaberto',p_reason);
  update public.production_contract_lifecycle set scope_confirmed_at=null,scope_confirmed_by=null,scope_evidence=null,completed_at=null,completed_by=null,historical_recorded_at=null,historical_reviewed_on=null,historical_declared_by=null,historical_statement=null where contract_id=p_contract;
 end if;
end $$;

create or replace function production_lifecycle_private.before_change()
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
 if prod is not null and exists(select 1 from public.production_prod_lifecycle h where h.prod_id=prod and h.historical_recorded_at is not null) then raise exception 'PROD com conclusão histórica: reabra antes de alterar.'; end if;
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

create or replace function public.production_lifecycle_command(p_actor uuid,p_entity uuid,p_command text,p_reason text,p_piece_ids uuid[] default '{}',p_reference text default null)
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
 if exists(select 1 from public.production_contract_lifecycle h where h.contract_id=contract and h.historical_recorded_at is not null) and p_command not in ('reopen_contract','reopen_scope') then raise exception 'Contrato com conclusão histórica: reabra antes de alterar.'; end if;
 if prod is not null and exists(select 1 from public.production_prod_lifecycle h where h.prod_id=prod and h.historical_recorded_at is not null) then raise exception 'PROD com conclusão histórica: reabra antes de alterar.'; end if;
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
  if p_command='archive_prod' and (l.completed_at is not null or l.historical_recorded_at is not null or l.blocker_count>0 or exists(select 1 from public.production_prod_piece_stages ps where ps.prod_id=prod and ps.status in ('em_andamento','pausada'))) then raise exception 'Conclusões comprovadas, pendências ou apontamentos ativos não podem ser ocultados por arquivamento.'; end if;
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

-- Only a Master can reopen a previously declared PROD; the service role
-- invokes this after resolving and checking the real logged-in user.
create function public.production_reopen_historical_prod(p_actor uuid,p_prod uuid,p_reason text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare actor public.profiles; item public.production_prods; master boolean;
begin
 select * into actor from public.profiles where id=p_actor and status='active';
 if not found then raise exception 'Perfil ativo obrigatório.'; end if;
 master:=actor.is_master or exists(select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id where ur.profile_id=actor.id and ur.company_id=actor.company_id and r.company_id=actor.company_id and r.active and r.is_master_role);
 if not master then raise exception 'Administrador obrigatório para reabertura histórica.'; end if;
 if p_reason is null or length(trim(p_reason)) not between 3 and 1000 then raise exception 'Informe o motivo da reabertura.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(actor.company_id::text,721));
 select * into item from public.production_prods where id=p_prod and company_id=actor.company_id;
 if not found then raise exception 'PROD não encontrada nesta empresa.'; end if;
 if exists(select 1 from public.production_contract_lifecycle where contract_id=item.contract_id and archived_at is not null) then raise exception 'Restaure o contrato antes de continuar.'; end if;
 if not exists(select 1 from public.production_prod_lifecycle where prod_id=item.id and historical_recorded_at is not null and archived_at is null) then raise exception 'PROD sem conclusão histórica vigente.'; end if;
 update public.production_prod_lifecycle set historical_recorded_at=null,historical_reviewed_on=null,historical_declared_by=null,historical_statement=null where prod_id=item.id;
 perform production_lifecycle_private.record_event(item.id,item.contract_id,'prod_historica_reaberta',trim(p_reason),actor.id);
 perform production_lifecycle_private.invalidate_scope(item.contract_id,'PROD histórica reaberta: '||trim(p_reason));
 perform production_lifecycle_private.refresh(item.id);
 return jsonb_build_object('ok',true,'prod_id',item.id,'contract_id',item.contract_id);
end $$;
revoke all on function public.production_reopen_historical_prod(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.production_reopen_historical_prod(uuid,uuid,text) to service_role;
commit;
