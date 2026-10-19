begin;

alter table public.production_stage_time_entries
  drop constraint if exists production_stage_time_entries_action_check;

alter table public.production_stage_time_entries
  add constraint production_stage_time_entries_action_check
  check (
    action in (
      'iniciar',
      'pausar',
      'retomar',
      'concluir',
      'pendencia',
      'nao_aplicavel',
      'retornar',
      'ajuste_tempo'
    )
  );

alter table public.production_pointing_sessions
  drop constraint if exists production_pointing_sessions_action_check;

alter table public.production_pointing_sessions
  add constraint production_pointing_sessions_action_check
  check (
    action in (
      'iniciar',
      'pausar',
      'retomar',
      'concluir',
      'pendencia',
      'nao_aplicavel',
      'retornar',
      'ajuste_tempo'
    )
  );

commit;
