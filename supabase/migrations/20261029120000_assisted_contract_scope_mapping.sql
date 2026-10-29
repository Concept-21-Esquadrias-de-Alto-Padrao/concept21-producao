-- Preserve the original contract list while allowing one contract item to
-- correspond to several distinct PROD codes (including a change of units).
begin;

create or replace function production_lifecycle_private.validate_contract_scope()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  item jsonb;
  part jsonb;
  parts jsonb;
  codes text[] := '{}';
  prod_codes text[] := '{}';
  part_count integer := 0;
  part_code text;
begin
  if tg_op <> 'INSERT' then raise exception 'Revisões são imutáveis. Registre uma nova revisão.'; end if;
  if not exists(select 1 from public.production_contracts c where c.id=new.contract_id and c.company_id=new.company_id and c.active)
    or not exists(select 1 from public.profiles p where p.id=new.created_by and p.company_id=new.company_id and p.status='active')
  then raise exception 'Contrato ou responsável inválido para esta empresa.'; end if;
  for item in select value from jsonb_array_elements(new.items) loop
    if jsonb_typeof(item) <> 'object' or (item->>'code') !~ '^[A-Z0-9_./-]{1,60}$'
      or (item->>'quantity') !~ '^[1-9][0-9]{0,4}$'
      or (item->>'quantity')::integer > 10000 or (item->>'code')=any(codes)
    then raise exception 'Item inválido ou código repetido na revisão integral.'; end if;
    codes := array_append(codes,item->>'code');

    if item ? 'prod_parts' then
      if item ? 'prod_code' or jsonb_typeof(item->'prod_parts') <> 'array'
        or jsonb_array_length(item->'prod_parts') not between 1 and 500
      then raise exception 'Confira os vínculos do item %.',item->>'code'; end if;
      parts := item->'prod_parts';
    else
      parts := jsonb_build_array(jsonb_build_object('code',coalesce(item->>'prod_code',item->>'code'),
        'quantity',item->'quantity'));
    end if;
    for part in select value from jsonb_array_elements(parts) loop
      part_code := part->>'code';
      if jsonb_typeof(part) <> 'object' or part_code !~ '^[A-Z0-9_./-]{1,60}$'
        or (part->>'quantity') !~ '^[1-9][0-9]{0,4}$'
        or (part->>'quantity')::integer > 10000 or part_code=any(prod_codes)
      then raise exception 'Código ou quantidade inválidos/repetidos no vínculo da PROD.'; end if;
      prod_codes := array_append(prod_codes,part_code);
      part_count := part_count + 1;
      if part_count > 500 then raise exception 'A revisão excede 500 vínculos.'; end if;
    end loop;
    if item ? 'prod_parts' and jsonb_array_length(parts)=1
      and (parts->0->>'quantity')::integer <> (item->>'quantity')::integer
    then raise exception 'Um vínculo único não pode alterar a quantidade do item %.',item->>'code'; end if;
  end loop;
  return new;
end $$;

create or replace function production_lifecycle_private.scope_matches(p_contract uuid)
returns boolean language sql stable security definer set search_path = '' as $$
 with revision as (
  select r.* from public.production_contract_scope_revisions r where r.contract_id=p_contract
  order by r.revision_number desc limit 1
 ), expected as (
  select part.value->>'code' code, (part.value->>'quantity')::integer quantity
  from revision r cross join lateral jsonb_array_elements(r.items) i
  cross join lateral jsonb_array_elements(case when i.value ? 'prod_parts' then i.value->'prod_parts'
   else jsonb_build_array(jsonb_build_object('code',coalesce(i.value->>'prod_code',i.value->>'code'),
     'quantity',i.value->'quantity')) end) part
 ), actual as (
  select upper(regexp_replace(trim(x.piece_code),'[[:space:]]+','','g')) code,sum(x.quantity)::integer quantity
  from public.production_prods p join public.production_prod_pieces x on x.prod_id=p.id
  left join public.production_piece_dispositions d on d.piece_id=x.id
  where p.contract_id=p_contract and d.cancelled_at is null
  group by upper(regexp_replace(trim(x.piece_code),'[[:space:]]+','','g'))
 )
 select exists(select 1 from revision where source_kind='tecnico_integral')
  and exists(select 1 from public.production_prods where contract_id=p_contract)
  and not exists(select 1 from expected e full join actual a using(code) where e.quantity is distinct from a.quantity)
  and not exists(
   select 1 from public.production_prods p left join public.production_prod_lifecycle l on l.prod_id=p.id
   where p.contract_id=p_contract and
    (l.archived_at is not null or not exists(
      select 1 from public.production_prod_pieces x left join public.production_piece_dispositions d on d.piece_id=x.id
      where x.prod_id=p.id and d.cancelled_at is null
    ))
  )
  and not exists(
   select 1 from public.production_prods p join public.production_prod_pieces x on x.prod_id=p.id
   left join public.production_piece_dispositions d on d.piece_id=x.id
   where p.contract_id=p_contract and d.cancelled_at is null
    and (x.import_batch_id is null or not x.released_to_production or x.quantity<=0)
  )
  and not exists(
   select 1 from public.production_prods p join public.production_prod_piece_stages ps on ps.prod_id=p.id
   join public.production_expedition_archives a on a.piece_stage_id=ps.id
   where p.contract_id=p_contract and a.restored_at is null
  );
$$;

-- The caller supplies only links. Contract codes, quantities, document kind and
-- source revision are copied from the latest immutable snapshot inside the lock.
create function public.production_contract_scope_map(
  p_actor uuid,p_contract uuid,p_expected_revision uuid,p_mappings jsonb,p_confirmed_technical_scope boolean
)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  actor public.profiles;
  latest public.production_contract_scope_revisions;
  item jsonb;
  next_items jsonb := '[]'::jsonb;
begin
  select * into actor from public.profiles where id=p_actor and status='active';
  if not found then raise exception 'Perfil ativo obrigatório.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor.company_id::text,721));
  select * into latest from public.production_contract_scope_revisions
    where contract_id=p_contract and company_id=actor.company_id
    order by revision_number desc limit 1;
  if not found or latest.id is distinct from p_expected_revision then
    raise exception 'A lista do contrato mudou. Atualize a página antes de conciliar.';
  end if;
  if latest.source_kind='tecnico_integral' and p_confirmed_technical_scope is distinct from true then
    raise exception 'Confirme a revisão vigente do Técnico antes de alterar seus vínculos.';
  end if;
  if jsonb_typeof(p_mappings) <> 'object' or
    (select count(*) from jsonb_object_keys(p_mappings)) <> jsonb_array_length(latest.items)
  then raise exception 'Todos os itens do contrato precisam constar na conciliação.'; end if;
  for item in select value from jsonb_array_elements(latest.items) loop
    if jsonb_typeof(p_mappings->(item->>'code')) <> 'array' then
      raise exception 'Falta vínculo para o item %.',item->>'code';
    end if;
    next_items := next_items || jsonb_build_array(jsonb_set(item-'prod_code','{prod_parts}',
      p_mappings->(item->>'code'),true));
  end loop;
  return public.production_contract_scope_register(p_actor,p_contract,latest.source_kind,
    'Conciliação da revisão '||latest.revision_number,latest.source_revision,next_items);
end $$;
revoke all on function public.production_contract_scope_map(uuid,uuid,uuid,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.production_contract_scope_map(uuid,uuid,uuid,jsonb,boolean) to service_role;
commit;
