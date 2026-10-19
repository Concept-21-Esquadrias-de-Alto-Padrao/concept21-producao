# Arquivamento reversível da Expedição

Base: commit 443b7a5334a7ceadb398a70143a6bf367b66cbdc.

## Comportamento

O arquivamento possui registro separado por etapa de peça. Não atualiza peças,
etapas, tempos, liberação, apontamentos ou conclusão. A fila e seu contador
excluem somente arquivamentos ativos da Expedição. Relatórios continuam lendo
as etapas originais. O Master pode arquivar e reativar, com motivo obrigatório.
Cada transição registra antes/depois e autor em audit_logs. Repetições sem
mudança não duplicam a auditoria. Novas peças da mesma PROD não são arquivadas
automaticamente.

A RPC é SECURITY INVOKER e disponível apenas ao service_role no servidor.
A ação autentica a sessão e exige Master; a RPC valida novamente empresa e
perfil ativo. Usuários autenticados têm somente leitura dos registros conforme
o acesso existente às etapas; anon não tem acesso. Não são concedidos novos
papéis a usuários. Um trigger impede alterações da etapa enquanto arquivada.

## Aplicação

1. Testar e revisar o patch `supabase/patches/expedition_archive.sql`.
2. Aplicar como migration aditiva `expedition_archive` antes da publicação.
   O patch não arquiva nenhuma peça e não deve ser reaplicado após sucesso.
3. Publicar a aplicação no projeto concept21-producao, equipe concept-aluminium.
4. Validar no aplicativo, com os perfis autorizados, a fila e o painel Master.
5. Revalidar a relação privada aprovada, IDs, estados e contagens atuais.
6. Em uma transação, capturar os registros originais, executar a RPC com IDs
   explícitos e comparar os registros originais antes/depois. Nunca selecionar
   somente por exclusão das PRODs mantidas; preservar novas entradas na fila.
7. Conferir fila, contador, auditoria e relatórios após a execução.

A relação operacional contém dados corporativos e fica fora do repositório
público. Não inserir nomes de clientes ou seus IDs neste documento.

## Verificação local

- `npm ci --ignore-scripts`, `npm test`, `npm run lint`, `npm run build`.
- `scripts/test-expedition-archive-db.mjs` roda Postgres via PGlite 0.5.10 com
  dados artificiais. Requer esse pacote disponível localmente; pode ser
  instalado com `npm install --no-save --package-lock=false @electric-sql/pglite@0.5.10`
  e removido com `npm ci --ignore-scripts` após o teste. Executar
  `node scripts/test-expedition-archive-db.mjs`.
- Cobertura SQL: arquivar, reativar, idempotência, preservação integral das
  etapas, bloqueio de escrita em etapa arquivada, empresa incorreta, etapa
  incorreta, usuário sem Master, IDs repetidos, leitura por empresa, negativas
  anon/authenticated e auditoria.
- Esses testes locais não substituem validação HTTP, RLS com identidades reais
  de teste ou verificação do aplicativo publicado.

## Retomada em 19/10/2026

Implementação local preparada. Nenhum patch ou arquivamento aplicado ao banco
original. Publicação pendente: conector GitHub está conectado a jpedroms20-tech
com leitura apenas; navegador está em Joaoconcept123 e exige reconfirmação da
senha antes de gerenciar o acesso ao repositório da organização. Vercel no
navegador acessa concept-aluminium, mas o conector retorna 403 nesse escopo.
O repositório da organização está vazio; o código-base foi recuperado de
igorconcept/concept21-producao e corresponde ao commit publicado na Vercel.
Não publicar no repositório pessoal por engano.
