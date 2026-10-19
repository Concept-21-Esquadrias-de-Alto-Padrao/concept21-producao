begin;

update public.roles
set
  name = case
    when name = 'Coordenador de Producao' then 'Coordenador de Produção'
    when name = 'Operador de Producao' then 'Operador de Produção'
    else name
  end,
  description = case
    when description = 'Gerencia PRODs, materiais, etapas e configuracoes operacionais.'
      then 'Gerência PRODs, materiais, etapas e configurações operacionais.'
    when description = 'Atualiza etapas, materiais e itens da producao.'
      then 'Atualiza etapas, materiais e itens da produção.'
    when description = 'Acesso total e exclusivo ao controle de permissoes.'
      then 'Acesso total e exclusivo ao controle de permissões.'
    else description
  end
where
  name in ('Coordenador de Producao', 'Operador de Producao')
  or description in (
    'Gerencia PRODs, materiais, etapas e configuracoes operacionais.',
    'Atualiza etapas, materiais e itens da producao.',
    'Acesso total e exclusivo ao controle de permissoes.'
  );

update public.permissions
set description = case
  when description = 'Gerenciar usuarios basicos' then 'Gerenciar usuários básicos'
  when description = 'Gerenciar permissoes e usuarios Master' then 'Gerenciar permissões e usuários administradores'
  when description = 'Gerenciar preparacao e montagem' then 'Gerenciar preparação e montagem'
  when description = 'Gerenciar expedicao' then 'Gerenciar expedição'
  when description = 'Gerenciar localizacoes' then 'Gerenciar localizações'
  when description = 'Gerenciar itens selecionaveis' then 'Gerenciar itens selecionáveis'
  else description
end
where description in (
  'Gerenciar usuarios basicos',
  'Gerenciar permissoes e usuarios Master',
  'Gerenciar preparacao e montagem',
  'Gerenciar expedicao',
  'Gerenciar localizacoes',
  'Gerenciar itens selecionaveis'
);

update public.production_stages
set
  name = case
    when name = 'Identificacao e previsao de materiais' then 'Identificação e previsão de materiais'
    when name = 'Confirmacao de materiais' then 'Confirmação de materiais'
    when name = 'Recebimento das listas e ordens de producao' then 'Recebimento das listas e ordens de produção'
    when name = 'Separacao do material para corte' then 'Separação do material para corte'
    when name = 'Preparacao e montagem' then 'Preparação e montagem'
    when name = 'Expedicao' then 'Expedição'
    else name
  end,
  description = case
    when description = 'Confirmacao de disponibilidade, localizacao e pendencias.'
      then 'Confirmação de disponibilidade, localização e pendências.'
    when description = 'Checklist de ordens, listas e documentos tecnicos.'
      then 'Checklist de ordens, listas e documentos técnicos.'
    when description = 'Separacao macro do material da PROD completa.'
      then 'Separação macro do material da PROD completa.'
    when description = 'Preparacao e montagem tratadas como etapa unica.'
      then 'Preparação e montagem tratadas como etapa única.'
    when description = 'Materiais avulsos, acessorios e conferencia final.'
      then 'Materiais avulsos, acessórios e conferência final.'
    when description = 'Entrada, localizacao e saida da expedicao.'
      then 'Entrada, localização e saída da expedição.'
    when description = 'Vinculo da PROD com rota de entrega.'
      then 'Vínculo da PROD com rota de entrega.'
    else description
  end
where
  name in (
    'Identificacao e previsao de materiais',
    'Confirmacao de materiais',
    'Recebimento das listas e ordens de producao',
    'Separacao do material para corte',
    'Preparacao e montagem',
    'Expedicao'
  )
  or description in (
    'Confirmacao de disponibilidade, localizacao e pendencias.',
    'Checklist de ordens, listas e documentos tecnicos.',
    'Separacao macro do material da PROD completa.',
    'Preparacao e montagem tratadas como etapa unica.',
    'Materiais avulsos, acessorios e conferencia final.',
    'Entrada, localizacao e saida da expedicao.',
    'Vinculo da PROD com rota de entrega.'
  );

update public.production_selectable_items
set name = case
  when name = 'Pivo' then 'Pivô'
  when name = 'Acessorios' then 'Acessórios'
  when name = 'Pecas avulsas' then 'Peças avulsas'
  else name
end
where name in ('Pivo', 'Acessorios', 'Pecas avulsas');

update public.storage_location_types
set name = case
  when name = 'Area' then 'Área'
  else name
end
where name = 'Area';

update public.storage_locations
set description = case
  when description = 'Perfis liberados para producao.' then 'Perfis liberados para produção.'
  when description = 'Ferragens pequenas e acessorios.' then 'Ferragens pequenas e acessórios.'
  else description
end
where description in (
  'Perfis liberados para producao.',
  'Ferragens pequenas e acessorios.'
);

commit;
