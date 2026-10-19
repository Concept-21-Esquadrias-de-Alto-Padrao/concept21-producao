begin;

create or replace function public.create_piece_stage_rows()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.production_prod_piece_stages (
    company_id,
    prod_id,
    piece_id,
    stage_id
  )
  select
    new.company_id,
    new.prod_id,
    new.id,
    stage.id
  from public.production_stages stage
  where stage.company_id = new.company_id
    and stage.active = true
    and stage.sort_order between 5 and 9
  on conflict (company_id, piece_id, stage_id) do nothing;

  perform public.refresh_prod_piece_totals(new.prod_id);
  return new;
end;
$$;

insert into public.production_prod_piece_stages (
  company_id,
  prod_id,
  piece_id,
  stage_id
)
select
  piece.company_id,
  piece.prod_id,
  piece.id,
  stage.id
from public.production_prod_pieces piece
join public.production_stages stage
  on stage.company_id = piece.company_id
 and stage.active = true
 and stage.sort_order between 5 and 9
on conflict (company_id, piece_id, stage_id) do nothing;

delete from public.production_operator_stages operator_stage
using public.production_stages stage
where operator_stage.stage_id = stage.id
  and (
    stage.sort_order < 5
    or stage.sort_order > 9
  );

delete from public.production_prod_piece_stages piece_stage
using public.production_stages stage
where piece_stage.stage_id = stage.id
  and (
    stage.sort_order < 5
    or stage.sort_order > 9
  )
  and not exists (
    select 1
    from public.production_stage_time_entries entry
    where entry.piece_stage_id = piece_stage.id
  );

update public.production_prod_piece_stages piece_stage
set status = 'nao_aplicavel',
    updated_at = now()
from public.production_stages stage
where piece_stage.stage_id = stage.id
  and (
    stage.sort_order < 5
    or stage.sort_order > 9
  )
  and piece_stage.status <> 'nao_aplicavel';

with ordered_stages as (
  select
    stage.id,
    stage.company_id,
    lag(stage.id) over (
      partition by stage.company_id
      order by stage.sort_order
    ) as previous_stage_id
  from public.production_stages stage
  where stage.active = true
    and stage.sort_order between 5 and 9
),
ready_piece_stages as (
  select current_stage.id
  from public.production_prod_piece_stages current_stage
  join ordered_stages ordered
    on ordered.id = current_stage.stage_id
  join public.production_prod_piece_stages previous_stage
    on previous_stage.company_id = current_stage.company_id
   and previous_stage.piece_id = current_stage.piece_id
   and previous_stage.stage_id = ordered.previous_stage_id
  where current_stage.status = 'nao_iniciada'
    and previous_stage.status in ('concluida', 'nao_aplicavel')
)
update public.production_prod_piece_stages piece_stage
set status = 'aguardando',
    updated_at = now()
from ready_piece_stages ready
where piece_stage.id = ready.id;

commit;
