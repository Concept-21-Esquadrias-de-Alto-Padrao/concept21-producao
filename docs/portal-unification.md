# Entrada central da Produção

A Produção usa OAuth/OIDC com PKCE do Portal Concept21. As sete contas nativas ativas revisadas mantêm seus IDs, perfis, permissões e histórico. A conta inativa não recebe vínculo central. Contas recém-criadas no Portal seguem o fluxo normal de primeiro acesso; não recebem senha por este procedimento.

A autoridade central é verificada no servidor antes de qualquer acesso à aplicação e antes das consultas administrativas com service role. Uma autorização de banco vinculada à sessão OAuth dura 30 segundos e é renovada pelo servidor; revogação central passa a bloquear operações no máximo após esse intervalo. A existência da sessão nativa, identidade OIDC exata, conta confirmada, perfil ativo e ausência de client_id são verificadas novamente pelo banco. Políticas restritivas e gatilhos de escrita cobrem as tabelas públicas existentes. Os controles individuais e geral de manutenção e as regras de RBAC permanecem aplicáveis.

## Configuração

Configurações públicas adicionais da Produção: NEXT_PUBLIC_PORTAL_ORIGIN e PLATFORM_IDENTITY_PUBLISHABLE_KEY. As configurações de Supabase e NEXT_PUBLIC_APP_URL existentes são preservadas. A chave administrativa já configurada continua exclusivamente no servidor. O único retorno OIDC adicional permitido é a origem oficial com /auth/complete.

O instalador é temporário, restrito ao Master autorizado, exige validação administrativa central atual e sete vínculos exatamente iguais à revisão. A janela de banco dura no máximo 30 minutos, com claim único. Após a instalação, remover a rota e expirar a configuração de setup.

## Validação e reversão

Baseline oficial anterior: f84eb2d6a04225c9e6593c56e5ef34b3b95ab8ae (deployment dpl_Csr1hzmuK8N74fzQVptgVRbe2uce). Antes e depois, comparar contagens e hashes de todas as 60 tabelas públicas existentes. Auditoria e manutenção devem ser avaliadas conforme as ações efetivamente executadas; perfis, atribuições e dados operacionais devem permanecer iguais.

Para reversão administrativa, manter somente Produção em manutenção, reimplantar a versão anterior e desativar central_login por acesso administrativo. As alterações são aditivas e não exigem excluir vínculos, usuários, perfis ou históricos. Não remover políticas de manutenção nem alterar roles. A desativação exige restaurar também a regra anterior de apresentação do módulo no Portal.
