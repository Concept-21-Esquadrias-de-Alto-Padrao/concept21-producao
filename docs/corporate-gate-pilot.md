# Vínculo corporativo: piloto de homologação

No deploy de homologação, configure `CORPORATE_GATE_ENABLED=true`,
`NEXT_PUBLIC_CORPORATE_GATE_ENABLED=true` e
`PORTAL_CORPORATE_ACCESS_URL=https://concept21-portal-homologacao.vercel.app/api/internal/module-access`.
Não configure o sinalizador na produção.

O Portal verifica o token emitido pelo projeto Supabase da Produção e consulta o
vínculo da identidade corporativa. A interface consulta o vínculo a cada cinco
segundos e encerra sua sessão quando o Portal responde que foi revogado. As APIs
que usam `requireAuthenticatedProfile` e o endpoint de acesso atual também
consultam o Portal. Falha de comunicação bloqueia a tela/essas APIs.

**Limite atual:** a aplicação também usa consultas diretas do navegador ao
Supabase. Um JWT ainda válido pode acessar essas operações até que uma regra
restritiva de RLS no banco da Produção reflita a revogação. Este piloto não
cumpre o requisito de revogação completa antes dessa etapa e do teste com
sessão existente, URL direta e consulta direta ao Supabase.
