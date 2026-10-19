-- Extend the existing archive storage without changing operational records.
-- Legacy SQL names retained for compatibility with existing deployments.
create or replace function public.set_expedition_archive(
  p_company_id uuid, p_actor_id uuid, p_piece_stage_ids uuid[],
  p_archive boolean, p_reason text
) returns integer language plpgsql security invoker set search_path = '' as $$
declare
  v_row record;
  v_before jsonb;
  v_after jsonb;
  v_count integer := 0;
  v_actor_user_id uuid;
begin
  if p_archive is null or p_reason is null
    or length(trim(p_reason)) not between 3 and 1000
    or coalesce(cardinality(p_piece_stage_ids), 0) not between 1 and 500
    or array_position(p_piece_stage_ids, null) is not null
    or cardinality(p_piece_stage_ids) <> (select count(distinct x) from unnest(p_piece_stage_ids) x)
  then raise exception 'Seleção ou motivo inválido.'; end if;
  select p.user_id into v_actor_user_id from public.profiles p
  where p.id = p_actor_id and p.company_id = p_company_id and p.status = 'active'
    and (p.is_master or exists (
      select 1 from public.user_roles ur join public.roles r on r.id = ur.role_id
      where ur.profile_id = p.id and ur.company_id = p_company_id
        and r.company_id = p_company_id and r.active and r.is_master_role
    ));
  if not found then raise exception 'Apenas o administrador Master pode arquivar ou reativar.'; end if;
  -- Lock the original rows without changing them; serialize with pointing writes.
  perform ps.id from public.production_prod_piece_stages ps
    where ps.company_id = p_company_id and ps.id = any(p_piece_stage_ids)
    order by ps.id for update;
  if (select count(*) from public.production_prod_piece_stages ps
    join public.production_stages s on s.id = ps.stage_id and s.company_id = ps.company_id
    where ps.company_id = p_company_id and ps.id = any(p_piece_stage_ids)
      and s.sort_order in (8, 9)) <> cardinality(p_piece_stage_ids)
  then raise exception 'Selecione somente peças de Embalagem ou Expedição da sua empresa.'; end if;
  if p_archive and exists (select 1 from public.production_prod_piece_stages ps
    where ps.id = any(p_piece_stage_ids) and ps.status in ('concluida','nao_aplicavel','em_andamento','pausada'))
  then raise exception 'Há peças concluídas ou com cronômetro ativo na seleção.'; end if;
  for v_row in select ps.id from public.production_prod_piece_stages ps
    where ps.company_id = p_company_id and ps.id = any(p_piece_stage_ids) order by ps.id
  loop
    select to_jsonb(a) into v_before from public.production_expedition_archives a
      where a.piece_stage_id = v_row.id;
    if p_archive then
      if v_before is not null and v_before->>'restored_at' is null then continue; end if;
      insert into public.production_expedition_archives as a
        (company_id,piece_stage_id,archived_by,reason)
      values (p_company_id,v_row.id,p_actor_id,trim(p_reason))
      on conflict (piece_stage_id) do update set archived_at=now(), archived_by=p_actor_id,
        reason=trim(p_reason), restored_at=null, restored_by=null, restore_reason=null
      returning to_jsonb(a) into v_after;
    else
      if v_before is null or v_before->>'restored_at' is not null then continue; end if;
      update public.production_expedition_archives a set restored_at=now(),
        restored_by=p_actor_id,restore_reason=trim(p_reason)
      where a.piece_stage_id=v_row.id returning to_jsonb(a) into v_after;
    end if;
    insert into public.audit_logs(company_id,entity,entity_id,action,user_id,before_data,after_data,notes)
    values (p_company_id,'production_expedition_archives',(v_after->>'id')::uuid,
      case when p_archive then 'archive' else 'restore' end,v_actor_user_id,v_before,v_after,trim(p_reason));
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.set_expedition_archive(uuid,uuid,uuid[],boolean,text) from public,anon,authenticated;
grant execute on function public.set_expedition_archive(uuid,uuid,uuid[],boolean,text) to service_role;


create or replace function public.protect_archived_expedition_stage()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  if exists (select 1 from public.production_expedition_archives a
    where a.piece_stage_id=old.id and a.restored_at is null)
  then raise exception 'Peça arquivada nesta etapa. Reative antes de alterar.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;
