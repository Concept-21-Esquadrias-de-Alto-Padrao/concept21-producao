begin;

alter table public.production_prod_piece_stages
  add column if not exists load_volume_count integer not null default 0 check (load_volume_count >= 0),
  add column if not exists load_checklist jsonb not null default '{}'::jsonb,
  add column if not exists load_checked_at timestamptz,
  add column if not exists load_checked_by uuid references auth.users(id) on delete set null;

commit;
