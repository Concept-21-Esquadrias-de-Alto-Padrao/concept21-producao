# Conclusão e histórico da Produção

## Estado desta entrega — 21/10/2026

João validou a implementação com “Vamos executar”, após a definição de que arquivados não integram o histórico oficial de concluídos. Código preparado em branch separada a partir de `d2070ff0ae4a940398a4e1998226320f593839d4`. Não houve migration, alteração de usuários/perfis, nova limpeza, mudança de main ou deployment nesta entrega.

A implementação contém o novo fluxo e sua migration. Homologação completa com navegador, sessão Supabase real de teste e PostgREST continua pendente. O download do Chromium falhou no ambiente de trabalho. A consulta atual à Vercel retornou 403 para `concept-aluminium`; o deployment registrado no dossiê não foi revalidado nesta rodada. Nada disso será descrito como homologação ou publicação concluída.

### Retomada da revisão — 21/10/2026

Base remota revalidada em `d2070ff`; a revisão anterior continua preservada no commit remoto `962042f` (mesma árvore do local `f18a3c0`). Foi reproduzida uma falha adicional: remover a data da Expedição sem mudar o status mantinha a PROD concluída. Esta revisão invalida a saída quando se perde a comprovação de fabricação/carga, inclusive data ausente, volumes zerados ou Expedição não aplicável. Repor os campos exige nova confirmação de saída; o evento anterior permanece. O vínculo de um apontamento com sua etapa também não pode ser trocado.

Os 46 cenários SQL passaram (41 anteriores e 5 regressões novas). O primeiro cenário novo falhou na versão anterior e passou após a correção. A migration continua **não aplicada** por esta entrega; o ajuste é sobre o arquivo ainda não implantado. Nenhuma nova suíte visual, sessão real de Auth ou concorrência nativa foi concluída.

Foi localizado, somente em leitura, o projeto `Producao - Concept21 HOMOLOGACAO` (`wtwypcjpnvedpbaluzzr`). Ele tem 51 tabelas públicas, mas não tem `production_expedition_archives` nem as tabelas de lifecycle; o trigger de criação de fretes está ativo e não existem policies `transport_module_isolated`. Portanto, ainda não reproduz a base desta alteração. Não confundir esse ambiente com Produção nem presumir que esteja vazio ou disponível para substituição. Nenhum dado, usuário, acesso ou schema desse projeto foi modificado nesta retomada.

Preflight somente de leitura: `scripts/check-production-lifecycle-prerequisites.sql`. Para a homologação, reconciliar o schema de arquivamento (patch inicial e extensões por etapa), o isolamento dos fretes e os triggers/policies da origem antes desta migration; preservar o endurecimento de acesso já presente no destino. Não executar patches antigos de arquivamento em lote nem copiar registros reais. A instalação do navegador foi tentada novamente e falhou por arquivo de download inválido. O conector Vercel continua retornando 403 no escopo empresarial e a operação de autorização indicada no erro não está exposta entre as ferramentas disponíveis.

## Comportamento

- **PRODs:** abas Em andamento, Concluídos e Cancelados; pesquisa por cliente/obra, contrato, PROD, etapa, status e período de conclusão em Brasília. Conclusão da PROD independe de encerramento do contrato.
- **Peças:** fabricação comprovada exige liberação e as quatro etapas de ordens 5–8, concluídas ou não aplicáveis, com data registrada. Etapa ausente ou arquivada não pode ser omitida do cálculo.
- **Expedição:** a ação anterior agora se chama “Concluir preparação da carga”. A confirmação de saída física é separada, no detalhe da PROD; exige identificação do romaneio e confirmação explícita de que todas as unidades selecionadas saíram. A saída é registrada no instante da confirmação, em UTC, exibida em Brasília. Não há lançamento retroativo silencioso.
- **Quantidades:** cada linha de peça é tratada integralmente, com sua quantidade. Saídas parciais de uma PROD são permitidas entre linhas; não é possível expedir parte da quantidade de uma mesma linha. O formulário explica essa unidade de seleção. Uma subdivisão futura precisa preservar vínculo e escopo; não alterar quantidade para simular uma saída parcial.
- **Conclusão automática:** todas as peças vigentes fabricadas e expedidas, nenhuma etapa arquivada e nenhum impedimento/retrabalho aberto. PROD vazia não conclui. PROD inteiramente cancelada fica em Cancelados. Peças canceladas não somam produção ou entrega.
- **Impedimentos atuais:** pendência ou texto de bloqueio em etapas de peças/PROD (exceto a etapa de frete isolada), texto de bloqueio em materiais e retrabalho com status não terminal. Campos não conferidos ou material não confirmado, por si só, não são convertidos em pendência artificial. A V1 trata qualquer bloqueio explícito como impeditivo da saída e do encerramento; ainda não há classificação por fabricação/saída/encerramento.
- **Contrato:** o Técnico registra evidência de que todo o escopo foi liberado ou formalmente destinado. O responsável da Produção confirma o encerramento, que verifica novamente todas as PRODs. Exige ao menos uma PROD realmente concluída; cancelamento integral não vira realização. O contrato não certifica instalação nem entrega final de Obras.
- **Reabertura:** nova PROD, alteração do escopo de peça ou mudança de destinação invalida a confirmação técnica. Retorno e retrabalho invalidam a saída anterior e reabrem a PROD/contrato; resolver o retrabalho exige nova confirmação de saída. Eventos anteriores permanecem.
- **Arquivados:** consulta administrativa `/archives`, acessível ao Administrador. Sem arquivamento automático em lote. Uma PROD com conclusão comprovada, impedimento/retrabalho aberto ou apontamento ativo não pode ser ocultada por arquivamento. Contrato exige todas as suas PRODs individualmente arquivadas. Restaurar contrato não restaura automaticamente suas PRODs. Arquivar/restaurar exige motivo e confirmação.
- **Exclusão:** exclusão física de contratos, PRODs, peças e etapas deixa de ser um caminho para reduzir escopo e produzir falsa conclusão. Retirar escopo usa cancelamento formal; limpeza usa arquivamento. Integrações que tentem excluir precisam ser reconciliadas antes de implantar.
- **Histórico:** mesmas identidades e vínculos preservados, detalhes de peças/apontamentos/tempos existentes, saídas com referência de romaneio e cópia dos dados da peça, eventos de conclusão/reabertura, data e responsável. Eventos do novo processo são imutáveis. A referência do romaneio é registrada; o novo processo não armazena um PDF assinado nem comprova recebimento pelo cliente.
- **Indicadores:** estado/data oficial de conclusão, filtros de arquivados e cancelados consistentes. Os apontamentos originais são preservados no banco. Arquivados não alimentam os relatórios de realização. Datas/status antigos continuam no banco, mas não são usados para reconhecer conclusão no novo histórico.

## Técnico e integração

A confirmação técnica é feita manualmente por usuário autorizado no módulo Produção, com evidência. Esta entrega não integra automaticamente o banco do Técnico, não consulta o escopo comercial original e não altera outros módulos. O atestado do Técnico é indispensável para tratar liberações ainda não cadastradas.

## Controle de acesso

- Novo catálogo: `production.contracts.confirm_scope` (Técnico) e `production.contracts.close` (encerramento). **Nenhum vínculo de usuário ou papel é inserido/alterado.** Atribuições a Luan/Técnico dependem de decisão específica. Administrador mantém o poder previsto, reconhecido por flag ou papel Master ativo.
- Saída: `production.shipping.manage`; retorno: `production.pointing.rollback`; cancelamento/restauração de peça: `production.prods.manage_pieces`; arquivamento/restauração de PROD/contrato: Administrador.
- A Server Action valida a sessão, manutenção, e-mail confirmado, parâmetros e confirmação. Resolve o ator pela sessão, nunca pelo formulário. RPC somente `service_role`, SECURITY INVOKER, revalida perfil ativo, papel/permissão e empresa dentro da transação.
- Cálculos internos em schema não exposto, funções não executáveis por anon/authenticated (exceções: booleanos de administrador e visibilidade, vinculados à empresa e identidade correntes). Tabelas novas com RLS, sem escrita direta para usuários. Policies restritivas aditivas preservam as policies anteriores e isolam registros arquivados, inclusive os próprios resumos e eventos.
- Mutações envolvidas serializam por empresa via advisory transaction lock. A RPC de seleção é atômica. O teste WASM não simula múltiplas conexões PostgreSQL nativas concorrentes; essa validação permanece pendente.

## Verificações reproduzíveis

```bash
npm ci
npm test
npm run test:lifecycle-db
npm run test:transport-db
npm run lint
npm run build
npm run test:lifecycle-http # ambiente demo sem Supabase, após build
```

`test:lifecycle-db` usa PostgreSQL WASM/PGlite efêmero e dados fictícios. Reutiliza definições de tabelas das migrations e 15 triggers/9 funções instaladas na origem, consultadas somente em leitura e salvas em `scripts/fixtures/production-source-triggers.sql`. Auth e permissões de sessão usam stubs no ensaio, declarados no script. Não é ensaio de restauração de backup nem teste completo do aplicativo/Supabase Auth/PostgREST.

Suite JavaScript: 51 testes (35 anteriores + 16 de histórico/indicadores e da fronteira de servidor). Ensaio SQL: 46 cenários aprovados, com histórico legado preservado, exclusão bloqueada, falta de etapa, arquivos, saída parcial, saída duplicada, cancelamento, retorno, novo escopo, retrabalho, atomicidade de lote, isolamento por empresa/RLS e privilégio insuficiente. A suíte também verifica que registrar retrabalho já encerrado não inventa um retorno, além de bloqueio de importação/sessão sobre arquivados, identidade das etapas, escopo sem liberação e imutabilidade dos eventos.

Lint, build e respostas HTTP locais aprovados. O ensaio HTTP confere 8 páginas/payloads de servidor (incluindo RSC) e 5 endpoints antigos de fretes com status 410. Ele não hidrata o guard de sessão cliente nem comprova a interação visual.

Compilação local usa `npm run build -- --webpack` por dependências locais compartilhadas via symlink neste ambiente. O código não depende desse symlink na Vercel nem altera o bundler padrão do projeto.

## Sequência de homologação e implantação (não executada)

1. Revalidar GitHub `main`, deployment efetivo e catálogo do Supabase `loqmvdiegizwmpzjthhm`. Esta entrega não autoriza publicar uma base antiga sobre mudanças posteriores.
2. Em destino isolado autorizado, aplicar schema e migration `20261021173007_production_lifecycle.sql` com dados fictícios. Conferir especialmente coexistência com todos os triggers/policies efetivos e ações das integrações que excluem/importam peças.
3. Homologar pelo aplicativo: Administrador, Técnico com confirmação, gestor com encerramento e operador sem esses privilégios. Confirmar ausência de transferência indevida entre empresas; concorrência entre apontamento, despacho, inclusão de peça e encerramento; desktop/celular; estado atualizado após ações; filtros e volta ao histórico.
4. Aprovar nominalmente os papéis que receberão as duas permissões novas. A migration apenas cataloga; não distribui acessos.
5. Para produção, obter autorização específica da janela, guardar backup recuperável e reconciliar o estado real. Pausar escritas e integrações pelo procedimento autorizado, aguardar transações anteriores e reaplicar os testes necessários no snapshot isolado.
6. Aplicar **somente** esta migration. Não executar `db push` em massa: há diferenças históricas entre nomes de migrations locais e as aplicadas, incluindo o isolamento de fretes. A migration adiciona tabelas/regras e resumos, sem converter status legados, arquivar ou apagar dados.
7. Publicar a árvore revisada na Vercel `concept-aluminium/concept21-producao`, somente após autorização. Aplicação nova exige o schema novo; não publicar antes de aplicar a migration.
8. Conferir listas, histórico, expedição, permissões, erros e preservação dos fretes isolados. Sem simular lançamentos ou saídas reais de clientes para testar.
9. A limpeza permanece uma tarefa separada: lista cliente → contrato → PROD, validação João/Luan, IDs aprovados, cópia recuperável do recorte e execução auditada.

## Reversão e preservação

Não apagar tabelas/ledgers para reverter. Se houver problema antes de qualquer escrita pelo novo fluxo, manter a janela e reverter a transação de migration que falhar; ela é transacional. Se a migration já foi confirmada, o aplicativo anterior é parcialmente compatível com o schema aditivo, mas suas tentativas de conclusão/exclusão passam a ser bloqueadas. Voltar só o código não restaura o comportamento antigo.

Se o novo fluxo já tiver registrado fatos, preservar todas as tabelas/eventos, bloquear novas escritas pela rotina autorizada, capturar o estado e preparar uma reversão específica. Não desativar as proteções e reativá-las depois sem reconciliar os fatos ocorridos nesse intervalo. A opção preferencial é corrigir em avanço com nova revisão. Não há script de rollback destrutivo automático.
