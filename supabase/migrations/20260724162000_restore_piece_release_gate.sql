begin;

with auto_released_without_movement as (
  select piece.id
  from public.production_prod_pieces piece
  where piece.released_to_production = true
    and piece.released_by is null
    and not exists (
      select 1
      from public.production_stage_time_entries entry
      where entry.company_id = piece.company_id
        and entry.piece_id = piece.id
    )
    and not exists (
      select 1
      from public.production_prod_piece_stages stage
      where stage.company_id = piece.company_id
        and stage.piece_id = piece.id
        and stage.status <> 'nao_iniciada'
    )
)
update public.production_prod_pieces piece
set
  released_to_production = false,
  released_at = null,
  released_by = null,
  updated_at = now()
from auto_released_without_movement candidate
where piece.id = candidate.id;

commit;
