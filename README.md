# Concept21 Aluminium - Módulo de Produção

Primeira versão independente do módulo de Produção. A aplicação usa Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth, PostgreSQL, RLS e migrations completas para operar por PROD.

## Arquitetura

- `src/app`: rotas App Router para dashboard, PRODs, clientes, contratos, fretes, avulsas, relatórios, configurações e login.
- `src/components`: shell, cards, badges, formulários, gráficos, organizador de rota e relatório copiável.
- `src/lib`: tipos, validações Zod, regras de negócio, dados demo, helpers Supabase e camada de leitura.
- `supabase/migrations`: schema PostgreSQL com constraints, triggers, views, RLS e funções auxiliares.
- `supabase/seed.sql`: dados iniciais, permissões, papéis, etapas, grupos de materiais e demo.

Sem variáveis Supabase, o app usa dados demonstrativos para permitir avaliação visual e testes locais. Com Supabase configurado, as telas passam a consultar o banco.

## Variáveis de ambiente

Crie `.env.local` com:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=https://concept21-producao.vercel.app
SUPABASE_SERVICE_ROLE_KEY=only-for-local-admin-scripts-never-expose-in-browser
```

`NEXT_PUBLIC_APP_URL` deve apontar para a URL pública da aplicação em produção. Ela é usada para montar o link de confirmação de e-mail enviado pelo Supabase.

## Supabase

1. Crie um projeto Supabase.
2. Aplique `supabase/migrations/20260713190000_production_module.sql`.
3. Rode `supabase/seed.sql`.
4. Crie o bucket privado `production-attachments` para anexos de listas/documentos.
5. Ative Supabase Auth por e-mail/senha.

### Supabase Auth

Em Auth > URL Configuration, mantenha:

- Site URL: `https://concept21-producao.vercel.app`.
- Redirect URLs:
  - `https://concept21-producao.vercel.app/auth/callback`
  - `https://concept21-producao.vercel.app/auth/confirm`
  - `http://localhost:3000/auth/callback` para desenvolvimento local.

Em Auth > Email Templates > Confirm signup, mantenha o botão/link apontando para `{{ .ConfirmationURL }}`. Assim o Supabase respeita o `redirect_to` enviado pela aplicação.

### Primeiro Administrador

Depois que o primeiro usuário autenticar pelo app, execute no SQL Editor do Supabase com permissão administrativa:

```sql
select public.promote_user_to_master('seu-email@empresa.com');
```

A função foi revogada de `public`; use service role/admin. Ela cria/atualiza o perfil, marca `is_master = true` e atribui o papel `Administrador`.

## Executar localmente

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

## Testes

```bash
npm test
npm run lint
npm run build
```

Os testes cobrem regras de identificação da PROD, unicidade, indicadores, ordenação de paradas, relatório de rota, agrupamento de PRODs, permissões, valores e filtros.

## Publicar na Vercel

1. Suba o repositório para GitHub/GitLab/Bitbucket.
2. Importe o projeto na Vercel.
3. Configure as variáveis `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
4. Use `npm run build` como build command e `.next` como output padrão do Next.js.
5. Aplique migrations/seeds no Supabase antes de liberar usuários reais.

## Escopo desta primeira versão

Incluído:

- Dashboard responsivo com indicadores, gráficos, painel de atenção e rotas.
- Cadastros de clientes, contratos, PRODs, fretes e solicitações avulsas.
- Detalhe de PROD com etapas, materiais, documentos, itens, expedição e histórico.
- Organizador de paradas com arrastar, botões e campo de posição.
- Relatório diário copiável, sem valores por padrão.
- Relatórios operacionais por departamento/tipo/status/motorista.
- Schema Supabase com RLS, permissões granulares, auditoria e seeds.

Limitações planejadas para a próxima versão:

- Edição persistente de todos os subformulários de etapa/material direto na UI.
- Upload visual de anexos para Supabase Storage.
- Calendário completo de fretes.
- Testes end-to-end autenticados contra Supabase real.
- Telas administrativas completas para montar perfis de permissão pela interface.
