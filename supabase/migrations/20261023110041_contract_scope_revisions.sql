-- Atomic, immutable snapshots of the complete contract list. Old contracts remain pending.
begin;
create table public.production_contract_scope_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  contract_id uuid not null references public.production_contracts(id) on delete restrict,
  revision_number integer not null check (revision_number > 0),
  source_kind text not null check (source_kind in ('proposta','tecnico_integral')),
  source_reference text not null check (length(trim(source_reference)) between 3 and 500),
  source_revision text check (source_revision is null or length(trim(source_revision)) between 1 and 100),
  items jsonb not null check (jsonb_typeof(items) = 'array' and jsonb_array_length(items) between 1 and 500),
  created_by uuid not null references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (contract_id, revision_number)
);
create index production_contract_scope_company_contract on public.production_contract_scope_revisions(company_id,contract_id,revision_number desc);
alter table public.production_contract_scope_revisions enable row level security;
revoke all on public.production_contract_scope_revisions from public,anon,authenticated;
grant select on public.production_contract_scope_revisions to authenticated;
grant select,insert on public.production_contract_scope_revisions to service_role;
create policy contract_scope_read on public.production_contract_scope_revisions for select to authenticated
 using (company_id=(select public.current_company_id()) and contract_id in (select production_lifecycle_private.visible_contract_ids()));

create function production_lifecycle_private.validate_contract_scope()
returns trigger language plpgsql security definer set search_path='' as $$
declare item jsonb; codes text[] := '{}'; prod_codes text[] := '{}';
begin
 if tg_op<>'INSERT' then raise exception 'Revisões são imutáveis. Registre uma nova revisão.'; end if;
 if not exists(select 1 from public.production_contracts c where c.id=new.contract_id and c.company_id=new.company_id and c.active)
   or not exists(select 1 from public.profiles p where p.id=new.created_by and p.company_id=new.company_id and p.status='active')
 then raise exception 'Contrato ou responsável inválido para esta empresa.'; end if;
 for item in select value from jsonb_array_elements(new.items) loop
  if jsonb_typeof(item)<>'object' or (item->>'code') !~ '^[A-Z0-9_./-]{1,60}$'
    or coalesce(item->>'prod_code',item->>'code') !~ '^[A-Z0-9_./-]{1,60}$'
    or (item->>'quantity') !~ '^[1-9][0-9]{0,4}$'
    or (item->>'quantity')::integer > 10000
    or (item->>'code')=any(codes)
    or coalesce(item->>'prod_code',item->>'code')=any(prod_codes)
  then raise exception 'Item inválido ou código repetido na revisão integral.'; end if;
  codes:=array_append(codes,item->>'code');
  prod_codes:=array_append(prod_codes,coalesce(item->>'prod_code',item->>'code'));
 end loop;
 return new;
end $$;
create trigger validate_contract_scope before insert or update or delete on public.production_contract_scope_revisions
 for each row execute function production_lifecycle_private.validate_contract_scope();

-- The current Technical list, all active PROD lines, and imported/released status must agree.
create function production_lifecycle_private.scope_matches(p_contract uuid)
returns boolean language sql stable security definer set search_path='' as $$
 with revision as (
  select r.* from public.production_contract_scope_revisions r where r.contract_id=p_contract
  order by r.revision_number desc limit 1
 ), expected as (
  select coalesce(i.value->>'prod_code',i.value->>'code') code,
         (i.value->>'quantity')::integer quantity
  from revision r cross join lateral jsonb_array_elements(r.items) i
 ), actual as (
  select upper(trim(x.piece_code)) code,sum(x.quantity)::integer quantity
  from public.production_prods p join public.production_prod_pieces x on x.prod_id=p.id
  left join public.production_piece_dispositions d on d.piece_id=x.id
  where p.contract_id=p_contract and d.cancelled_at is null
  group by upper(trim(x.piece_code))
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

create function production_lifecycle_private.refresh_contract_scope(p_contract uuid)
returns void language plpgsql security definer set search_path='' as $$
declare rev public.production_contract_scope_revisions;
begin
 select * into rev from public.production_contract_scope_revisions where contract_id=p_contract order by revision_number desc limit 1;
 if not found then return; end if;
 if not production_lifecycle_private.scope_matches(p_contract) then
  perform production_lifecycle_private.invalidate_scope(p_contract,'Conciliação integral do contrato pendente');
  return;
 end if;
 insert into public.production_contract_lifecycle(contract_id,company_id)
 values(p_contract,rev.company_id) on conflict do nothing;
 if exists(select 1 from public.production_contract_lifecycle where contract_id=p_contract and scope_confirmed_at is null) then
  update public.production_contract_lifecycle set scope_confirmed_at=now(),scope_confirmed_by=null,
   scope_evidence='Conciliação automática com a revisão integral '||rev.revision_number||' ('||rev.source_reference||')'
  where contract_id=p_contract;
  perform production_lifecycle_private.record_event(null,p_contract,'escopo_conciliado',
   'Lista integral do Técnico x itens acumulados das PRODs',rev.created_by,jsonb_build_object('revision_id',rev.id));
 end if;
end $$;

-- Even the old manual command cannot certify or close a contract without a reconciled baseline.
create function production_lifecycle_private.guard_contract_scope()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if ((new.scope_confirmed_at is not null and old.scope_confirmed_at is null)
   or (new.completed_at is not null and old.completed_at is null))
  and not production_lifecycle_private.scope_matches(new.contract_id)
 then raise exception 'Lista integral vigente e PRODs ainda não conciliadas.'; end if;
 return new;
end $$;
create trigger guard_contract_scope before update on public.production_contract_lifecycle
 for each row execute function production_lifecycle_private.guard_contract_scope();

create function production_lifecycle_private.after_scope_source_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare contract uuid;
begin
 if tg_table_name='production_prods' then contract:=new.contract_id;
 elsif tg_table_name='production_piece_dispositions' then
  select p.contract_id into contract from public.production_prods p where p.id=new.prod_id;
 else
  select p.contract_id into contract from public.production_prods p where p.id=new.prod_id;
 end if;
 if contract is not null then perform production_lifecycle_private.refresh_contract_scope(contract); end if;
 return null;
end $$;
create trigger z_scope_refresh after insert or update on public.production_prods
 for each row execute function production_lifecycle_private.after_scope_source_change();
create trigger z_scope_refresh after insert or update on public.production_prod_pieces
 for each row execute function production_lifecycle_private.after_scope_source_change();
create trigger z_scope_refresh after insert or update on public.production_piece_dispositions
 for each row execute function production_lifecycle_private.after_scope_source_change();

-- Invoker RPC is restricted to the server role; it checks the active actor and company again.
create function public.production_contract_scope_register(p_actor uuid,p_contract uuid,p_kind text,p_reference text,p_revision text,p_items jsonb)
returns integer language plpgsql security invoker set search_path='' as $$
declare actor public.profiles; number integer; company uuid; allowed boolean;
begin
 select * into actor from public.profiles where id=p_actor and status='active';
 if not found then raise exception 'Perfil ativo obrigatório.'; end if;
 company:=actor.company_id;
 allowed:=actor.is_master or exists(
  select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
  where ur.profile_id=actor.id and ur.company_id=company and r.company_id=company and r.active and r.is_master_role
 ) or exists(
  select 1 from public.user_roles ur join public.roles r on r.id=ur.role_id
   join public.role_permissions rp on rp.role_id=r.id join public.permissions pm on pm.id=rp.permission_id
  where ur.profile_id=actor.id and ur.company_id=company and r.company_id=company and r.active
    and rp.company_id=company and pm.key='production.contracts.edit'
 );
 if not allowed then raise exception 'Sem permissão para revisar o escopo do contrato.'; end if;
 perform pg_advisory_xact_lock(hashtextextended(company::text,721));
 if not exists(select 1 from public.production_contracts c where c.id=p_contract and c.company_id=company and c.active)
   or exists(select 1 from public.production_contract_lifecycle l where l.contract_id=p_contract and l.archived_at is not null)
 then raise exception 'Contrato indisponível na empresa.'; end if;
 if p_kind not in ('proposta','tecnico_integral') or length(trim(p_reference)) not between 3 and 500
   or jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items) not between 1 and 500
 then raise exception 'Fonte ou lista integral inválida.'; end if;
 select coalesce(max(revision_number),0)+1 into number from public.production_contract_scope_revisions where contract_id=p_contract;
 insert into public.production_contract_scope_revisions(company_id,contract_id,revision_number,source_kind,source_reference,source_revision,items,created_by)
 values(company,p_contract,number,p_kind,trim(p_reference),nullif(trim(p_revision),''),p_items,actor.id);
 perform production_lifecycle_private.refresh_contract_scope(p_contract);
 return number;
end $$;
revoke all on function public.production_contract_scope_register(uuid,uuid,text,text,text,jsonb) from public,anon,authenticated;
grant execute on function public.production_contract_scope_register(uuid,uuid,text,text,text,jsonb) to service_role;
revoke all on function production_lifecycle_private.validate_contract_scope(),production_lifecycle_private.scope_matches(uuid),
 production_lifecycle_private.refresh_contract_scope(uuid),production_lifecycle_private.after_scope_source_change(),
 production_lifecycle_private.guard_contract_scope() from public,anon,authenticated;
grant execute on function production_lifecycle_private.validate_contract_scope(),production_lifecycle_private.scope_matches(uuid),
 production_lifecycle_private.refresh_contract_scope(uuid),production_lifecycle_private.after_scope_source_change(),
 production_lifecycle_private.guard_contract_scope() to service_role;
commit;
