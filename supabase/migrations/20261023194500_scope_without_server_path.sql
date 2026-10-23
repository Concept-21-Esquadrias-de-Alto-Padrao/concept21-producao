-- Keep the document lineage and responsible actor without asking for a server path.
-- The old proposal remains immutable; the confirmed revision points to its number.
create or replace function public.production_contract_scope_confirm_existing(
  p_actor uuid, p_contract uuid, p_expected_revision uuid, p_reference text, p_source_revision text
)
returns integer language plpgsql security invoker set search_path = '' as $$
declare
  actor public.profiles;
  latest public.production_contract_scope_revisions;
  next_revision integer;
begin
  select * into actor from public.profiles where id = p_actor and status = 'active';
  if not found then raise exception 'Perfil ativo obrigatório.'; end if;
  perform pg_advisory_xact_lock(hashtextextended(actor.company_id::text, 721));
  select * into latest from public.production_contract_scope_revisions
   where contract_id = p_contract and company_id = actor.company_id
   order by revision_number desc limit 1;
  if not found or latest.id is distinct from p_expected_revision or latest.source_kind <> 'proposta'
  then raise exception 'A lista do contrato mudou. Atualize a página antes de confirmar.'; end if;
  if length(trim(coalesce(p_source_revision, ''))) > 100
  then raise exception 'Confira a revisão da lista vigente.'; end if;

  -- p_reference is retained in the signature for existing API compatibility,
  -- but no client-supplied path is stored in a new revision.
  next_revision := public.production_contract_scope_register(
    p_actor, p_contract, 'tecnico_integral',
    'Itens previamente lidos na revisão ' || latest.revision_number,
    p_source_revision, latest.items
  );
  if not production_lifecycle_private.scope_matches(p_contract) then
    raise exception 'As peças liberadas nas PRODs ainda não coincidem integralmente com a lista. Atualize a página e confira as divergências.';
  end if;
  return next_revision;
end $$;
