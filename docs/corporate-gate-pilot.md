# Vínculo corporativo: piloto de homologação

No deploy de homologação, configure `CORPORATE_GATE_ENABLED=true`,
`NEXT_PUBLIC_CORPORATE_GATE_ENABLED=true` e
`PORTAL_CORPORATE_ACCESS_URL=https://concept21-portal-homologacao.vercel.app/api/internal/module-access`.
Configure `PORTAL_GATE_SYNC_SECRET` com valor aleatório exclusivo de pelo menos
32 caracteres, igual a `PRODUCTION_MODULE_GATE_SYNC_SECRET` no servidor do Portal.
Configure `CORPORATE_GATE_PILOT_USER_ID=5eed5cfb-b572-4b50-a300-549340e61bff`
e `CORPORATE_GATE_PILOT_LINK_ID=1dd1876e-7503-4da9-b1a4-66cf96205d70`.
Somente esse par pode ser alterado pela rota interna.
Não configure o sinalizador na produção.

O Portal verifica o token emitido pelo projeto Supabase da Produção e consulta o
vínculo da identidade corporativa. A interface consulta o vínculo a cada cinco
segundos e encerra sua sessão quando o Portal responde que foi revogado. As APIs
que usam `requireAuthenticatedProfile`, as ações que usam `getActionContext`,
o endpoint de acesso atual e as rotas de solicitação de acesso também consultam
o Portal. Falha de comunicação bloqueia essas operações.

A migração `corporate_gate_homologation` acrescenta uma política restritiva às
tabelas `public` com RLS e a `storage.objects`. A rota interna do módulo mantém
a chave de serviço do Supabase no próprio módulo. O Portal atualiza primeiro a
condição local para revogar e só depois marca o vínculo como revogado. Uma
restauração inverte essa ordem. Usuários sem linha no cadastro local conservam
as permissões atuais durante o piloto. Um rollback de DDL está em
`docs/corporate-gate-rollback.sql`.

Em 04/11/2026, a migração foi ensaiada em transação revertida no Supabase de
homologação. A identidade piloto revogada leu zero linhas de `permissions`, e
com a condição ativa recuperou a leitura. O ensaio foi revertido. Depois, a
migração foi aplicada na homologação como versão `20261104125229`: 61 políticas
foram criadas e o cadastro de bloqueio permaneceu vazio.
O guarda dos caminhos de escrita privilegiados foi aplicado como versão
`20261104130745`: três gatilhos verificam a revogação antes de escrever em
`production_prods`, `platform_notifications` e `access_review_requests`.
Em transação revertida, um gatilho recusou a escrita da identidade revogada
com erro 42501. Nenhuma linha piloto permaneceu gravada.

**Pendente:** configurar os aplicativos e testar com sessão
existente, URL direta, ações do servidor, Storage e consulta direta ao Supabase.
Até concluir esses testes, não afirmar revogação completa.
