# Isolamento do Transporte na Produção

Decisão de João em 20/10/2026: deixar de controlar fretes pela Produção, remover o acesso do menu e isolar o domínio preservando dados e código para integração futura. Esta entrega precede o saneamento das demais áreas.

## Estado e origem

Publicação e alteração do banco oficial autorizadas por João em 21/10/2026. Versão preparada para aplicação coordenada; conferir o resultado efetivo no dossiê e no histórico de migrations/deployments. Banco: `loqmvdiegizwmpzjthhm`. Repositório canônico: `Concept-21-Esquadrias-de-Alto-Padrao/concept21-producao`; Vercel: `concept-aluminium/concept21-producao`.

A main remota consultada estava em `ee8f815c75cc8c0de1869e9d9d5bbbc7baeb73f1`, árvore `5cb13d251560d292274a079cb278f46f95db38da`. O ponto inicial local `a195e38e06eb6f63c428617bbeea8bede0b758ac` tem **a mesma árvore, mas outra ancestralidade**. Branch local: `feat/isolate-transport`. Nunca fazer force-push nem enviar essa ancestralidade diretamente à main; reaplicar/cherry-pick a alteração sobre checkout da origem canônica após revalidar o remoto. Não usar o remoto antigo `origin` de igorconcept.

## Comportamento preparado

- Menu desktop/mobile sem Transporte; dashboard sem atalho, indicadores financeiros/logísticos ou rotas do dia; relatório por contrato sem contador de fretes.
- `/transport`, `/freights`, `/routes` e `/extra-services`, inclusive subcaminhos, respondem HTTP 410 antes da renderização. As páginas também mantêm guardas próprias.
- GET/POST de `/api/settings/logistics` respondem 410; as seis Server Actions de fretes/avulsos recusam a operação antes de acessar o banco, inclusive para administrador.
- Consultas do snapshot não carregam as dez coleções logísticas. A projeção de dados oculta a etapa macro Frete sem reescrever registros, datas, tempos ou status.
- Configurações de Logística e controles de permissões logísticas ficam ocultos. Os vínculos de permissões existentes continuam preservados, inclusive ao salvar outros controles do mesmo perfil.
- Criação/edição da PROD não sincroniza fretes, não permite selecionar uma nova etapa/status logístico e preserva um vínculo legado já existente se o usuário apenas editar outro campo. O status histórico `aguardando_frete` aparece como **Pendência externa (legado)**, sem ser tratado como conclusão ou atraso da produção.
- Corte, Usinagem, Preparação e montagem, Embalagem, Expedição, controle de carga, romaneio e retorno de etapa continuam no fluxo da produção.

## Banco — alteração autorizada

Migration `supabase/migrations/20261020202604_isolate_transport_module.sql`:

1. Desabilita somente `production_prods_create_freight_demand`. A função existente permanece.
2. Inativa a definição da etapa macro Frete. `initialize_prod_defaults` já considera somente etapas ativas; registros históricos de etapas permanecem.
3. Acrescenta uma política RLS restritiva `transport_module_isolated` em 11 tabelas logísticas, bloqueando leitura e escrita de `anon`/`authenticated`, sem remover grants, políticas anteriores ou papéis. O acesso privilegiado de `service_role` permanece reservado a integrações e administração técnica.

Tabelas: `freights`, `freight_demands`, `freight_stops`, `freight_stop_prods`, `freight_route_helpers`, `logistics_recipients`, `logistics_drivers`, `logistics_vehicles`, `logistics_settings`, `extra_service_catalog`, `extra_service_requests`.

Evidência de leitura em 20/10: as 11 tabelas estavam com RLS habilitado; o trigger estava ativo; a etapa Frete `a407fc9b-4138-42e7-a4c5-0820b1779a0a` estava ativa, ordem 10. A função de inicialização não depende da demanda de frete. Nenhum job de frete foi encontrado no código consultado; o levantamento não certifica inexistência de integrações externas à aplicação.

## Verificação

- `npm run lint`: aprovado.
- `npm test`: 35 testes aprovados; suíte existente mais isolamento de permissões, projeção sem mutação, etapas de apontamento, bloqueio das seis ações e da API, e interceptação de URLs legadas.
- `npm run build`: aprovado, compilação/TypeScript Next.js 16.2.10. Build de ensaio sem conexão Supabase, usando somente demonstração.
- `npm run test:transport-db`: aprovado em PostgreSQL WASM/PGlite 0.5.10 com estruturas e dados fictícios. Verifica as 11 tabelas para SELECT/INSERT/UPDATE/DELETE com `anon` e `authenticated`, preservação pelo acesso privilegiado, políticas originais intactas, aplicação repetida e nova PROD com Expedição sem geração de frete. Este ensaio verifica a migration; não é restauração do banco oficial nem homologação integral do Supabase.
- Teste HTTP do servidor local: quatro caminhos antigos e GET/POST da API logística retornaram 410; dashboard, apontamento, PRODs, detalhe da PROD, configurações e relatórios retornaram 200, com menu renderizado sem Transporte. O conteúdo interativo depende de hidratação no navegador e não foi validado visualmente.
- Verificação visual em navegador pendente: Chromium indisponível; a tentativa de instalação retornou arquivo inválido. Não afirmar teste visual desktop/mobile concluído nem homologação com contas reais.

## Aplicação após autorização

1. Revalidar main canônica, deployment efetivo e alterações concorrentes. Preparar a versão na ancestralidade correta, sem force-push.
2. Registrar definições atuais do trigger, etapas afetadas, policies e inventário dos dados logísticos; confirmar cópia recuperável antes da alteração do banco. Não aproveitar o procedimento/backup do módulo Técnico: trata-se de outro projeto.
3. Publicar a aplicação isolada e aplicar **somente** a migration desta entrega em janela aprovada. Não executar `db push` que possa incluir outras migrations pendentes. Coordenar as duas partes: somente a aplicação não desliga o trigger; somente a migration deixa a interface antiga incompatível.
4. Conferir HTTP 410, navegação, criação/edição de PROD e expedição com perfis autorizados. Registrar commit/deployment e verificações. Não criar ou movimentar peças reais só para teste sem autorização.
5. Confirmar trigger desabilitado, etapa logística inativa, 11 novas policies e preservação do histórico. Atualizar o dossiê com o resultado efetivo.

## Reversão ou futura integração

Não basta mudar `TRANSPORT_ENABLED`. A retomada é uma decisão de produto e exige revisão da integração, dos vínculos que deixaram de ser sincronizados e das permissões.

Se houver rollback autorizado: remover somente a política `transport_module_isolated` das 11 tabelas, restaurar o estado anterior das etapas capturado antes da aplicação, reabilitar somente o trigger identificado e restaurar a versão compatível da aplicação. Nunca habilitar indiscriminadamente todas as etapas/policies nem criar fretes retroativos automaticamente. Não apagar históricos para resolver conflitos.

Referências: [Matriz](https://chatgpt.com/space/page_d3e4126b68688191a886959ac63bdc7e), [Produção](https://chatgpt.com/space/page_7d25a68c357c81919b9415ce97b795bf), [Segurança](https://chatgpt.com/space/page_cf8a51c7fa9c81918dd5bd7627bfb9bf).

## Preparação da publicação autorizada em 21/10/2026

- Main canônica revalidada: `ee8f815c75cc8c0de1869e9d9d5bbbc7baeb73f1`, igual ao deployment de produção `Y53LrCTn5HzZTnEBcSGUoWPwuL2y`, confirmado no painel Vercel. Alteração reaplicada sobre essa ancestralidade, sem force-push.
- `docs/transport-isolation-state-before.json`: cópia direcionada dos objetos/configurações afetados, incluindo estado da etapa Frete, triggers, definições das funções, 23 policies anteriores e grants das 11 tabelas; inventário e fingerprints sem conteúdo de registros logísticos. Não é backup integral nem ensaio de recuperação integral do banco.
- `docs/transport-isolation-rollback.sql`: reversão direcionada preparada, não executada. Não apaga históricos nem gera demandas retroativas.
- Antes da alteração: 108 registros distribuídos nas 11 tabelas logísticas; trigger ativo; etapa Frete ativa; nenhuma policy de isolamento. Comparar o inventário após aplicar.
- Nenhuma escrita de teste deve ser feita em PRODs/peças reais. A validação em produção usará leitura de catálogo, inventário, bloqueios HTTP e navegação da sessão disponível.
