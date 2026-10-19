-- Limpeza operacional do módulo de Produção.
-- Mantém:
-- - auth.users
-- - public.companies
-- - public.profiles
-- - public.roles
-- - public.permissions
-- - public.role_permissions
-- - public.user_roles
-- - configurações operacionais base: departamentos, etapas, localizações,
--   grupos de materiais, checklists e itens selecionáveis.
--
-- Apaga:
-- - clientes, contratos, PRODs, materiais de PROD, etapas de PROD
-- - fretes, paradas, vínculos de frete
-- - solicitações avulsas
-- - auditoria, notificações e filas de e-mail
-- - solicitações pendentes de revisão de acesso
--
-- Trava de segurança:
-- Este script só roda se encontrar exatamente os dois usuários abaixo
-- na empresa concept21.

begin;

do $$
declare
  target_company_id uuid;
  preserved_emails text[] := array[
    'igorhenrique@conceptal.com.br',
    'joaopedro@conceptal.com.br'
  ];
  preserved_profiles_count integer;
  total_profiles_count integer;
begin
  select id
    into target_company_id
  from public.companies
  where slug = 'concept21'
  limit 1;

  if target_company_id is null then
    raise exception 'Empresa concept21 não encontrada. Limpeza cancelada.';
  end if;

  select count(*)
    into preserved_profiles_count
  from public.profiles
  where company_id = target_company_id
    and lower(email) = any (preserved_emails);

  select count(*)
    into total_profiles_count
  from public.profiles
  where company_id = target_company_id;

  if preserved_profiles_count <> 2 or total_profiles_count <> 2 then
    raise exception
      'Foram encontrados % usuários preserváveis e % usuários totais. Limpeza cancelada.',
      preserved_profiles_count,
      total_profiles_count;
  end if;

  delete from public.platform_notifications;
  delete from public.email_notification_queue;
  delete from public.access_review_requests
  where company_id = target_company_id;

  delete from public.freight_stop_prods
  where company_id = target_company_id;

  delete from public.freight_stops
  where company_id = target_company_id;

  delete from public.freights
  where company_id = target_company_id;

  delete from public.extra_service_requests
  where company_id = target_company_id;

  delete from public.production_shipping_records
  where company_id = target_company_id;

  delete from public.production_prod_selected_items
  where company_id = target_company_id;

  delete from public.production_prod_document_checks
  where company_id = target_company_id;

  delete from public.production_prod_materials
  where company_id = target_company_id;

  delete from public.production_prod_stages
  where company_id = target_company_id;

  delete from public.production_stage_time_entries
  where company_id = target_company_id;

  delete from public.production_prod_piece_stages
  where company_id = target_company_id;

  delete from public.production_prod_pieces
  where company_id = target_company_id;

  delete from public.production_piece_imports
  where company_id = target_company_id;

  delete from public.production_prods
  where company_id = target_company_id;

  delete from public.production_contracts
  where company_id = target_company_id;

  delete from public.clients
  where company_id = target_company_id;

  delete from public.audit_logs
  where company_id = target_company_id;

  update public.roles
  set name = 'Coordenador de Produção'
  where company_id = target_company_id
    and name = 'Coordenador de Producao';

  update public.roles
  set name = 'Operador de Produção'
  where company_id = target_company_id
    and name = 'Operador de Producao';

  raise notice 'Limpeza concluída. Usuários e perfis de acesso preservados.';
end $$;

commit;
