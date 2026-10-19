insert into public.companies (id, name, slug)
values ('00000000-0000-0000-0000-000000000021', 'Concept21 Aluminium', 'concept21')
on conflict (slug) do update set name = excluded.name;

insert into public.system_maintenance (company_id)
values ('00000000-0000-0000-0000-000000000021')
on conflict (company_id) do nothing;

insert into public.departments (company_id, name, active)
values
  ('00000000-0000-0000-0000-000000000021', 'Produção', true),
  ('00000000-0000-0000-0000-000000000021', 'Suprimentos', true),
  ('00000000-0000-0000-0000-000000000021', 'Obras', true),
  ('00000000-0000-0000-0000-000000000021', 'Engenharia', true),
  ('00000000-0000-0000-0000-000000000021', 'Administrativo', true),
  ('00000000-0000-0000-0000-000000000021', 'Comercial', true),
  ('00000000-0000-0000-0000-000000000021', 'Diretoria', true)
on conflict (company_id, name) do update set active = excluded.active;

insert into public.permissions (key, description)
values
  ('production.dashboard.view', 'Visualizar dashboard de produção'),
  ('production.clients.view', 'Visualizar clientes'),
  ('production.clients.create', 'Criar clientes'),
  ('production.clients.edit', 'Editar clientes'),
  ('production.contracts.view', 'Visualizar contratos e obras'),
  ('production.contracts.create', 'Criar contratos e obras'),
  ('production.contracts.edit', 'Editar contratos e obras'),
  ('production.prods.view', 'Visualizar PRODs'),
  ('production.prods.create', 'Criar PRODs'),
  ('production.prods.edit', 'Editar PRODs'),
  ('production.prods.update_stage', 'Atualizar etapas da PROD'),
  ('production.prods.import_pieces', 'Importar peças da PROD por PDF'),
  ('production.prods.manage_pieces', 'Gerenciar peças da PROD'),
  ('production.pointing.view', 'Visualizar apontamentos de produção'),
  ('production.pointing.perform', 'Realizar apontamentos de produção'),
  ('production.pointing.rollback', 'Corrigir retorno de etapas de apontamento'),
  ('production.pointing.adjust_time', 'Ajustar tempos de apontamento'),
  ('production.pointing.receive_pending_notifications', 'Receber notificações de pendências de apontamento'),
  ('production.pointing.manage_operators', 'Gerenciar operadores de apontamento'),
  ('production.pointing.manage_reasons', 'Gerenciar motivos de pausa, pendência e atividades indiretas de apontamento'),
  ('production.materials.view', 'Visualizar materiais'),
  ('production.materials.forecast', 'Atualizar previsão de materiais'),
  ('production.materials.confirm', 'Confirmar materiais'),
  ('production.materials.update_location', 'Atualizar localização de materiais'),
  ('production.documents.manage', 'Gerenciar documentos e listas'),
  ('production.cutting.manage', 'Gerenciar corte'),
  ('production.machining.manage', 'Gerenciar usinagem'),
  ('production.preparation_assembly.manage', 'Gerenciar preparação e montagem'),
  ('production.packaging.manage', 'Gerenciar embalagem'),
  ('production.shipping.manage', 'Gerenciar expedição'),
  ('production.freights.view', 'Visualizar fretes'),
  ('production.freights.create', 'Criar fretes'),
  ('production.freights.edit', 'Editar fretes'),
  ('production.freights.manage_route', 'Gerenciar rota e paradas'),
  ('production.freights.manage_values', 'Gerenciar valores de frete'),
  ('production.freights.confirm_delivery', 'Confirmar entregas'),
  ('production.routes.view', 'Visualizar rotas'),
  ('production.routes.create', 'Criar rotas'),
  ('production.routes.edit', 'Editar rotas'),
  ('production.extra_services.view', 'Visualizar solicitações avulsas'),
  ('production.extra_services.create', 'Criar solicitações avulsas'),
  ('production.extra_services.edit', 'Editar solicitações avulsas'),
  ('production.extra_services.cancel', 'Cancelar solicitações avulsas'),
  ('production.reports.view', 'Visualizar relatórios'),
  ('production.settings.manage_stages', 'Gerenciar etapas'),
  ('production.settings.manage_selectable_items', 'Gerenciar itens selecionáveis'),
  ('production.settings.manage_locations', 'Gerenciar localizações'),
  ('production.settings.manage_departments', 'Gerenciar departamentos'),
  ('production.settings.manage_users', 'Gerenciar usuários básicos'),
  ('production.permissions.manage', 'Gerenciar permissões e usuários administradores')
on conflict (key) do update set description = excluded.description;

update public.roles
set name = 'Administrador',
    description = 'Acesso total e exclusivo ao controle de permissões.',
    active = true
where company_id = '00000000-0000-0000-0000-000000000021'
  and is_master_role = true
  and name = 'Master';

insert into public.roles (company_id, name, description, is_master_role, active)
values
  ('00000000-0000-0000-0000-000000000021', 'Administrador', 'Acesso total e exclusivo ao controle de permissões.', true, true),
  ('00000000-0000-0000-0000-000000000021', 'Coordenador de Produção', 'Gerência PRODs, materiais, etapas e configurações operacionais.', false, true),
  ('00000000-0000-0000-0000-000000000021', 'Operador de Produção', 'Atualiza etapas, materiais e itens da produção.', false, true),
  ('00000000-0000-0000-0000-000000000021', 'Motorista', 'Visualiza rotas e confirma entregas.', false, true)
on conflict (company_id, name) do update
set description = excluded.description,
    is_master_role = excluded.is_master_role,
    active = excluded.active;

insert into public.role_permissions (company_id, role_id, permission_id)
select r.company_id, r.id, p.id
from public.roles r
cross join public.permissions p
where r.company_id = '00000000-0000-0000-0000-000000000021'
  and r.is_master_role = true
on conflict do nothing;

insert into public.role_permissions (company_id, role_id, permission_id)
select r.company_id, r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'production.dashboard.view',
  'production.clients.view',
  'production.clients.create',
  'production.clients.edit',
  'production.contracts.view',
  'production.contracts.create',
  'production.contracts.edit',
  'production.prods.view',
  'production.prods.create',
  'production.prods.edit',
  'production.prods.update_stage',
  'production.prods.import_pieces',
  'production.prods.manage_pieces',
  'production.pointing.view',
  'production.pointing.perform',
  'production.pointing.adjust_time',
  'production.pointing.receive_pending_notifications',
  'production.pointing.manage_operators',
  'production.pointing.manage_reasons',
  'production.materials.view',
  'production.materials.forecast',
  'production.materials.confirm',
  'production.materials.update_location',
  'production.documents.manage',
  'production.cutting.manage',
  'production.machining.manage',
  'production.preparation_assembly.manage',
  'production.packaging.manage',
  'production.shipping.manage',
  'production.freights.view',
  'production.freights.create',
  'production.freights.edit',
  'production.freights.manage_route',
  'production.freights.manage_values',
  'production.routes.view',
  'production.routes.create',
  'production.routes.edit',
  'production.extra_services.view',
  'production.extra_services.create',
  'production.extra_services.edit',
  'production.extra_services.cancel',
  'production.reports.view',
  'production.settings.manage_stages',
  'production.settings.manage_selectable_items',
  'production.settings.manage_locations',
  'production.settings.manage_departments',
  'production.settings.manage_users'
)
where r.company_id = '00000000-0000-0000-0000-000000000021'
  and r.name = 'Coordenador de Produção'
on conflict do nothing;

insert into public.role_permissions (company_id, role_id, permission_id)
select r.company_id, r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'production.dashboard.view',
  'production.prods.view',
  'production.prods.update_stage',
  'production.pointing.view',
  'production.pointing.perform',
  'production.materials.view',
  'production.materials.confirm',
  'production.documents.manage',
  'production.cutting.manage',
  'production.machining.manage',
  'production.preparation_assembly.manage',
  'production.packaging.manage',
  'production.shipping.manage'
)
where r.company_id = '00000000-0000-0000-0000-000000000021'
  and r.name = 'Operador de Produção'
on conflict do nothing;

insert into public.role_permissions (company_id, role_id, permission_id)
select r.company_id, r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'production.freights.view',
  'production.freights.confirm_delivery',
  'production.routes.view'
)
where r.company_id = '00000000-0000-0000-0000-000000000021'
  and r.name = 'Motorista'
on conflict do nothing;

insert into public.production_indirect_activity_reasons (
  company_id,
  label,
  description,
  sort_order
)
values
  ('00000000-0000-0000-0000-000000000021', 'Organização do setor', 'Organização e preparação do posto de trabalho.', 10),
  ('00000000-0000-0000-0000-000000000021', 'Limpeza', 'Limpeza operacional do setor ou equipamento.', 20),
  ('00000000-0000-0000-0000-000000000021', 'Separação de materiais', 'Separação de materiais fora de uma peça específica.', 30),
  ('00000000-0000-0000-0000-000000000021', 'Apoio a outro setor', 'Apoio operacional fora da etapa principal do operador.', 40),
  ('00000000-0000-0000-0000-000000000021', 'Manutenção de equipamento', 'Apoio, ajuste ou acompanhamento de manutenção.', 50),
  ('00000000-0000-0000-0000-000000000021', 'Reunião ou treinamento', 'Reunião, orientação ou treinamento interno.', 60),
  ('00000000-0000-0000-0000-000000000021', 'Atividade administrativa', 'Atividade administrativa necessária durante a jornada.', 70),
  ('00000000-0000-0000-0000-000000000021', 'Aguardando orientação', 'Tempo registrado aguardando direcionamento da liderança.', 80)
on conflict do nothing;

insert into public.production_stages (
  company_id,
  name,
  description,
  sort_order,
  active,
  icon,
  required_permission
)
values
  ('00000000-0000-0000-0000-000000000021', 'Identificação e previsão de materiais', 'Levantamento inicial de perfis, componentes e vidros.', 1, true, 'clipboard-list', 'production.materials.forecast'),
  ('00000000-0000-0000-0000-000000000021', 'Confirmação de materiais', 'Confirmação de disponibilidade, localização e pendências.', 2, true, 'badge-check', 'production.materials.confirm'),
  ('00000000-0000-0000-0000-000000000021', 'Recebimento das listas e ordens de produção', 'Checklist de ordens, listas e documentos técnicos.', 3, true, 'files', 'production.documents.manage'),
  ('00000000-0000-0000-0000-000000000021', 'Separação do material para corte', 'Separação macro do material da PROD completa.', 4, true, 'archive', 'production.cutting.manage'),
  ('00000000-0000-0000-0000-000000000021', 'Corte', 'Controle macro da etapa de corte.', 5, true, 'scissors', 'production.cutting.manage'),
  ('00000000-0000-0000-0000-000000000021', 'Usinagem', 'Retirada de componentes e acompanhamento de usinagem.', 6, true, 'wrench', 'production.machining.manage'),
  ('00000000-0000-0000-0000-000000000021', 'Preparação e montagem', 'Preparação e montagem tratadas como etapa única.', 7, true, 'hammer', 'production.preparation_assembly.manage'),
  ('00000000-0000-0000-0000-000000000021', 'Embalagem', 'Materiais avulsos, acessórios e conferência final.', 8, true, 'package', 'production.packaging.manage'),
  ('00000000-0000-0000-0000-000000000021', 'Expedição', 'Entrada, localização e saída da expedição.', 9, true, 'warehouse', 'production.shipping.manage'),
  ('00000000-0000-0000-0000-000000000021', 'Frete', 'Vínculo da PROD com rota de entrega.', 10, true, 'truck', 'production.freights.manage_route')
on conflict (company_id, name) do update
set description = excluded.description,
    sort_order = excluded.sort_order,
    active = excluded.active,
    icon = excluded.icon,
    required_permission = excluded.required_permission;

insert into public.production_material_groups (company_id, key, name, active)
values
  ('00000000-0000-0000-0000-000000000021', 'perfis', 'Perfis', true),
  ('00000000-0000-0000-0000-000000000021', 'componentes', 'Componentes', true),
  ('00000000-0000-0000-0000-000000000021', 'vidros', 'Vidros', true)
on conflict (company_id, key) do update set name = excluded.name, active = excluded.active;

insert into public.storage_location_types (company_id, key, name, active)
values
  ('00000000-0000-0000-0000-000000000021', 'cavalete', 'Cavalete', true),
  ('00000000-0000-0000-0000-000000000021', 'gaveta', 'Gaveta', true),
  ('00000000-0000-0000-0000-000000000021', 'prateleira', 'Prateleira', true),
  ('00000000-0000-0000-0000-000000000021', 'area', 'Área', true),
  ('00000000-0000-0000-0000-000000000021', 'outro', 'Outro', true)
on conflict (company_id, key) do update set name = excluded.name, active = excluded.active;

insert into public.storage_locations (company_id, name, code, type, material_group, description, active)
values
  ('00000000-0000-0000-0000-000000000021', 'Cavalete C-02', 'C-02', 'cavalete', 'perfis', 'Perfis liberados para produção.', true),
  ('00000000-0000-0000-0000-000000000021', 'Gaveta G-11', 'G-11', 'gaveta', 'componentes', 'Ferragens pequenas e acessórios.', true),
  ('00000000-0000-0000-0000-000000000021', 'Cavalete V-04', 'V-04', 'cavalete', 'vidros', 'Vidros temperados identificados.', true)
on conflict (company_id, name) do update
set code = excluded.code,
    type = excluded.type,
    material_group = excluded.material_group,
    description = excluded.description,
    active = excluded.active;

insert into public.production_document_checklist_items (company_id, label, sort_order, active)
values
  ('00000000-0000-0000-0000-000000000021', 'Ordem de produção recebida', 1, true),
  ('00000000-0000-0000-0000-000000000021', 'Lista de corte recebida', 2, true),
  ('00000000-0000-0000-0000-000000000021', 'Lista de componentes recebida', 3, true),
  ('00000000-0000-0000-0000-000000000021', 'Lista de vidros recebida', 4, true),
  ('00000000-0000-0000-0000-000000000021', 'Documentos técnicos recebidos', 5, true),
  ('00000000-0000-0000-0000-000000000021', 'Revisão conferida', 6, true)
on conflict (company_id, label) do update set sort_order = excluded.sort_order, active = excluded.active;

insert into public.production_selectable_items (company_id, stage_id, name, description, active)
select '00000000-0000-0000-0000-000000000021', s.id, item.name, item.description, true
from public.production_stages s
join (
  values
    ('Usinagem', 'Fechadura', 'Item inicial para retirada em usinagem.'),
    ('Usinagem', 'Concha', 'Item inicial para retirada em usinagem.'),
    ('Usinagem', 'Cremona', 'Item inicial para retirada em usinagem.'),
    ('Usinagem', 'Fecho unha', 'Item inicial para retirada em usinagem.'),
    ('Usinagem', 'Pivô', 'Item inicial para retirada em usinagem.'),
    ('Preparação e montagem', 'Fechadura complementar', 'Componente selecionável de montagem.'),
    ('Preparação e montagem', 'Roldanas', 'Componente selecionável de montagem.'),
    ('Preparação e montagem', 'Guias', 'Componente selecionável de montagem.'),
    ('Embalagem', 'Perfis de acabamento', 'Material avulso para acompanhar a PROD.'),
    ('Embalagem', 'Ferragens', 'Material avulso para acompanhar a PROD.'),
    ('Embalagem', 'Acessórios', 'Material avulso para acompanhar a PROD.'),
    ('Embalagem', 'Peças avulsas', 'Material avulso para acompanhar a PROD.'),
    ('Embalagem', 'Componentes adicionais', 'Material avulso para acompanhar a PROD.'),
    ('Embalagem', 'Chaves', 'Material avulso para acompanhar a PROD.'),
    ('Embalagem', 'Materiais complementares', 'Material avulso para acompanhar a PROD.')
) as item(stage_name, name, description) on item.stage_name = s.name
where s.company_id = '00000000-0000-0000-0000-000000000021'
on conflict (company_id, stage_id, name) do update
set description = excluded.description,
    active = excluded.active;

insert into public.clients (id, company_id, name, trade_name, document, phone, email, notes, active)
values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000021', 'João da Silva', null, '123.456.789-00', '(11) 99999-1000', 'joao@example.com', 'Cliente demo residencial.', true),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000021', 'Alphaville Incorporadora', 'Alphaville', '12.345.678/0001-90', '(11) 3333-4040', 'obras@alphaville.example', 'Cliente demo corporativo.', true)
on conflict (id) do update
set name = excluded.name,
    trade_name = excluded.trade_name,
    document = excluded.document,
    phone = excluded.phone,
    email = excluded.email,
    notes = excluded.notes,
    active = excluded.active;

insert into public.production_contracts (
  id,
  company_id,
  contract_number,
  client_id,
  work_name,
  full_address,
  street,
  block,
  lot,
  sector,
  city,
  state,
  zip_code,
  site_contact,
  site_contact_phone,
  general_delivery_forecast,
  notes,
  status,
  active
)
values
  ('20000000-0000-0000-0000-000000000064', '00000000-0000-0000-0000-000000000021', '26-0064', '10000000-0000-0000-0000-000000000001', 'Residência Alphaville', 'Rua das Palmeiras, Quadra 12, Lote 150, Setor Alphaville', 'das Palmeiras', '12', '150', 'Alphaville', 'Barueri', 'SP', null, null, null, '2026-07-22', 'Entrar pelo acesso lateral.', 'ativo', true),
  ('20000000-0000-0000-0000-000000000072', '00000000-0000-0000-0000-000000000021', '26-0072', '10000000-0000-0000-0000-000000000002', 'Torre Comercial C21', 'Rua Industrial, Quadra 3, Lote 980, Setor Mooca', 'Industrial', '3', '980', 'Mooca', 'São Paulo', 'SP', null, null, null, '2026-08-02', 'Recebimento pela doca 2.', 'ativo', true)
on conflict (id) do update
set contract_number = excluded.contract_number,
    client_id = excluded.client_id,
    work_name = excluded.work_name,
    full_address = excluded.full_address,
    street = excluded.street,
    block = excluded.block,
    lot = excluded.lot,
    sector = excluded.sector,
    city = excluded.city,
    state = excluded.state,
    zip_code = excluded.zip_code,
    site_contact = excluded.site_contact,
    site_contact_phone = excluded.site_contact_phone,
    general_delivery_forecast = excluded.general_delivery_forecast,
    notes = excluded.notes,
    status = excluded.status,
    active = excluded.active;

insert into public.production_prods (
  id,
  company_id,
  contract_id,
  prod_number,
  description,
  priority,
  planned_start_date,
  planned_end_date,
  delivery_forecast,
  current_stage_id,
  status,
  notes
)
select
  prod.id::uuid,
  '00000000-0000-0000-0000-000000000021',
  prod.contract_id::uuid,
  prod.prod_number,
  prod.description,
  prod.priority,
  prod.planned_start_date::date,
  prod.planned_end_date::date,
  prod.delivery_forecast::date,
  s.id,
  prod.status,
  prod.notes
from (
  values
    ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000064', 1, 'Primeiro lote de esquadrias sociais.', 'alta', '2026-07-08', '2026-07-18', '2026-07-22', 'Preparação e montagem', 'em_producao', 'Aguardando retirada de cremona.'),
    ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000064', 2, 'Segundo lote com portas de correr.', 'urgente', '2026-07-12', '2026-07-19', '2026-07-20', 'Embalagem', 'embalagem', 'Embalagem pendente de acessórios.'),
    ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000064', 3, 'Lote complementar para área gourmet.', 'normal', '2026-07-16', '2026-07-25', '2026-07-29', 'Confirmação de materiais', 'aguardando_materiais', 'Vidros com previsão parcial.'),
    ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000072', 1, 'Fachada pavimento térreo.', 'normal', '2026-07-20', '2026-08-01', '2026-08-04', 'Recebimento das listas e ordens de produção', 'aguardando_listas', 'Lista de vidros ainda não recebida.')
) as prod(id, contract_id, prod_number, description, priority, planned_start_date, planned_end_date, delivery_forecast, stage_name, status, notes)
join public.production_stages s on s.company_id = '00000000-0000-0000-0000-000000000021'
  and s.name = prod.stage_name
on conflict (id) do update
set description = excluded.description,
    priority = excluded.priority,
    planned_start_date = excluded.planned_start_date,
    planned_end_date = excluded.planned_end_date,
    delivery_forecast = excluded.delivery_forecast,
    current_stage_id = excluded.current_stage_id,
    status = excluded.status,
    notes = excluded.notes;

update public.production_prod_materials
set forecast_status = 'previsto',
    confirmation_status = 'confirmado',
    availability_forecast = '2026-07-12',
    location = 'Cavalete C-02'
where prod_id in ('30000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002')
  and material_group = 'perfis';

update public.production_prod_materials
set forecast_status = 'previsto',
    confirmation_status = 'parcialmente_confirmado',
    availability_forecast = '2026-07-13',
    location = 'Gaveta G-11',
    blockers = 'Cremona pendente'
where prod_id = '30000000-0000-0000-0000-000000000001'
  and material_group = 'componentes';

update public.production_prod_materials
set forecast_status = 'parcialmente_previsto',
    confirmation_status = 'aguardando_confirmacao',
    availability_forecast = '2026-07-17',
    blockers = 'Aguardando fornecedor'
where prod_id = '30000000-0000-0000-0000-000000000002'
  and material_group = 'vidros';

insert into public.freights (
  id,
  company_id,
  title,
  freight_date,
  planned_departure_time,
  driver,
  vehicle,
  plate,
  status,
  expected_value,
  contracted_value,
  notes
)
values (
  '40000000-0000-0000-0000-000000000015',
  '00000000-0000-0000-0000-000000000021',
  'Rota de entrega - 15/07',
  '2026-07-15',
  '07:00',
  'Carlos Henrique',
  'Caminhão Mercedes',
  'ABC1D23',
  'agendado',
  1200,
  1150,
  'Conferir volumes antes da saída.'
)
on conflict (id) do update
set title = excluded.title,
    freight_date = excluded.freight_date,
    planned_departure_time = excluded.planned_departure_time,
    driver = excluded.driver,
    vehicle = excluded.vehicle,
    plate = excluded.plate,
    status = excluded.status,
    expected_value = excluded.expected_value,
    contracted_value = excluded.contracted_value,
    notes = excluded.notes;

insert into public.extra_service_requests (
  id,
  company_id,
  service_type,
  requesting_department_id,
  recipient_or_place,
  address,
  contact,
  phone,
  service_description,
  materials_description,
  desired_date,
  desired_window,
  priority,
  requires_proof,
  status,
  notes
)
select
  '50000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000021',
  'coleta_avulsa',
  d.id,
  'Vidros Alfa',
  'Avenida Industrial, 250',
  'Ricardo',
  '(11) 94444-1010',
  'Coletar oito unidades de vidro temperado',
  '8 vidros temperados',
  '2026-07-15',
  'Ate 11:00',
  'alta',
  true,
  'incluido_em_rota',
  'Conferir as medidas.'
from public.departments d
where d.company_id = '00000000-0000-0000-0000-000000000021'
  and d.name = 'Suprimentos'
on conflict (id) do update
set service_type = excluded.service_type,
    requesting_department_id = excluded.requesting_department_id,
    recipient_or_place = excluded.recipient_or_place,
    address = excluded.address,
    contact = excluded.contact,
    phone = excluded.phone,
    service_description = excluded.service_description,
    materials_description = excluded.materials_description,
    desired_date = excluded.desired_date,
    desired_window = excluded.desired_window,
    priority = excluded.priority,
    requires_proof = excluded.requires_proof,
    status = excluded.status,
    notes = excluded.notes;

insert into public.freight_stops (
  id,
  company_id,
  freight_id,
  position,
  stop_type,
  requesting_department_id,
  title,
  address,
  contact,
  phone,
  planned_window,
  notes,
  status,
  requires_proof,
  completed,
  extra_service_request_id
)
select
  '60000000-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000021',
  '40000000-0000-0000-0000-000000000015',
  1,
  'entrega_prod',
  d.id,
  'Entrega Residência Alphaville',
  'Rua das Palmeiras, 150',
  'Marcos',
  '(11) 98888-2000',
  '08:30',
  'Entrar pelo acesso lateral.',
  'agendado',
  true,
  false,
  null::uuid
from public.departments d
where d.company_id = '00000000-0000-0000-0000-000000000021'
  and d.name = 'Produção'
on conflict (id) do update
set position = excluded.position,
    stop_type = excluded.stop_type,
    requesting_department_id = excluded.requesting_department_id,
    title = excluded.title,
    address = excluded.address,
    contact = excluded.contact,
    phone = excluded.phone,
    planned_window = excluded.planned_window,
    notes = excluded.notes,
    status = excluded.status,
    requires_proof = excluded.requires_proof,
    completed = excluded.completed;

insert into public.freight_stops (
  id,
  company_id,
  freight_id,
  position,
  stop_type,
  requesting_department_id,
  title,
  address,
  contact,
  phone,
  planned_window,
  notes,
  status,
  requires_proof,
  completed,
  extra_service_request_id
)
select
  '60000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000021',
  '40000000-0000-0000-0000-000000000015',
  2,
  'coleta_avulsa',
  d.id,
  'Coleta Vidros Alfa',
  'Avenida Industrial, 250',
  'Ricardo',
  '(11) 94444-1010',
  'Ate 11:00',
  'Conferir medidas.',
  'agendado',
  true,
  false,
  '50000000-0000-0000-0000-000000000001'
from public.departments d
where d.company_id = '00000000-0000-0000-0000-000000000021'
  and d.name = 'Suprimentos'
on conflict (id) do update
set position = excluded.position,
    stop_type = excluded.stop_type,
    requesting_department_id = excluded.requesting_department_id,
    title = excluded.title,
    address = excluded.address,
    contact = excluded.contact,
    phone = excluded.phone,
    planned_window = excluded.planned_window,
    notes = excluded.notes,
    status = excluded.status,
    requires_proof = excluded.requires_proof,
    completed = excluded.completed,
    extra_service_request_id = excluded.extra_service_request_id;

insert into public.freight_stop_prods (company_id, freight_id, stop_id, prod_id)
values
  ('00000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000015', '60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000002'),
  ('00000000-0000-0000-0000-000000000021', '40000000-0000-0000-0000-000000000015', '60000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003')
on conflict do nothing;
