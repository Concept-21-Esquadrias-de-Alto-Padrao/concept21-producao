begin;

create table if not exists public.production_pointing_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  prod_ids uuid[] not null default '{}'::uuid[],
  stage_id uuid not null references public.production_stages(id) on delete restrict,
  operator_id uuid not null references public.production_operators(id) on delete restrict,
  session_profile_id uuid references public.profiles(id) on delete set null,
  auth_user_id uuid references auth.users(id) on delete set null default auth.uid(),
  action text not null check (
    action in ('iniciar', 'pausar', 'retomar', 'concluir', 'pendencia', 'retornar', 'ajuste_tempo')
  ),
  event_at timestamptz not null default now(),
  productive_seconds_delta integer not null default 0 check (
    productive_seconds_delta >= 0 or action = 'ajuste_tempo'
  ),
  paused_seconds_delta integer not null default 0 check (
    paused_seconds_delta >= 0 or action = 'ajuste_tempo'
  ),
  piece_count integer not null default 0 check (piece_count >= 0),
  notes text,
  pause_reason text,
  created_at timestamptz not null default now()
);

alter table public.production_stage_time_entries
  add column if not exists pointing_session_id uuid
  references public.production_pointing_sessions(id) on delete set null;

create index if not exists production_pointing_sessions_company_stage_idx
  on public.production_pointing_sessions(company_id, stage_id, event_at desc);

create index if not exists production_pointing_sessions_operator_idx
  on public.production_pointing_sessions(company_id, operator_id, event_at desc);

create index if not exists production_stage_time_entries_pointing_session_idx
  on public.production_stage_time_entries(company_id, pointing_session_id);

alter table public.production_pointing_sessions enable row level security;

drop policy if exists production_pointing_sessions_read on public.production_pointing_sessions;
create policy production_pointing_sessions_read on public.production_pointing_sessions
for select
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.dashboard.view')
    or public.has_permission('production.pointing.view')
    or public.has_permission('production.reports.view')
  )
);

drop policy if exists production_pointing_sessions_insert on public.production_pointing_sessions;
create policy production_pointing_sessions_insert on public.production_pointing_sessions
for insert
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.perform')
    or public.has_permission('production.pointing.rollback')
    or public.has_permission('production.pointing.adjust_time')
  )
);

commit;
