-- Read-only catalogue captured from Produção on 2026-10-21. No operational data.
CREATE OR REPLACE FUNCTION public.audit_table_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  row_company_id uuid;
  row_id uuid;
begin
  row_company_id := coalesce(new.company_id, old.company_id);
  row_id := coalesce(new.id, old.id);

  insert into public.audit_logs (
    company_id,
    entity,
    entity_id,
    action,
    user_id,
    before_data,
    after_data
  )
  values (
    row_company_id,
    tg_table_name,
    row_id,
    lower(tg_op),
    auth.uid(),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) else null end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) else null end
  );

  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.create_piece_stage_rows()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.production_prod_piece_stages (
    company_id,
    prod_id,
    piece_id,
    stage_id,
    status
  )
  select
    new.company_id,
    new.prod_id,
    new.id,
    stage.id,
    case
      when new.released_to_production = true
        and stage.sort_order = (
          select min(first_stage.sort_order)
          from public.production_stages first_stage
          where first_stage.company_id = new.company_id
            and first_stage.active = true
            and first_stage.sort_order between 5 and 9
        )
      then 'aguardando'
      else 'nao_iniciada'
    end
  from public.production_stages stage
  where stage.company_id = new.company_id
    and stage.active = true
    and stage.sort_order between 5 and 9
  on conflict (company_id, piece_id, stage_id) do nothing;

  perform public.refresh_prod_piece_totals(new.prod_id);
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.ensure_company_id()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.company_id is null then
    new.company_id := public.current_company_id();
  end if;
  if new.company_id is null then
    raise exception 'company_id is required';
  end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.initialize_prod_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.production_prod_stages (company_id, prod_id, stage_id, planned_date)
  select new.company_id, new.id, s.id, new.planned_end_date
  from public.production_stages s
  where s.company_id = new.company_id
    and s.active
  on conflict do nothing;

  insert into public.production_prod_materials (company_id, prod_id, material_group)
  select new.company_id, new.id, mg.key
  from public.production_material_groups mg
  where mg.company_id = new.company_id
    and mg.active
  on conflict do nothing;

  insert into public.production_prod_document_checks (company_id, prod_id, checklist_item_id)
  select new.company_id, new.id, item.id
  from public.production_document_checklist_items item
  where item.company_id = new.company_id
    and item.active
  on conflict do nothing;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.protect_archived_expedition_stage()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if exists (select 1 from public.production_expedition_archives a
    where a.piece_stage_id=old.id and a.restored_at is null)
  then raise exception 'Peça arquivada nesta etapa. Reative antes de alterar.'; end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_prod_piece_totals_from_piece()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  affected_prod_id uuid;
begin
  affected_prod_id := case when tg_op = 'DELETE' then old.prod_id else new.prod_id end;
  perform public.refresh_prod_piece_totals(affected_prod_id);
  return coalesce(new, old);
end;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.touch_stage_update()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  if row(new.status, new.owner_profile_id, new.planned_date, new.started_at, new.completed_at, new.notes, new.blockers)
     is distinct from
     row(old.status, old.owner_profile_id, old.planned_date, old.started_at, old.completed_at, old.notes, old.blockers) then
    new.last_updated_by := auth.uid();
    new.last_updated_at := now();
  end if;

  if new.status in ('concluida', 'concluida_parcialmente') and new.completed_at is null then
    new.completed_at := now();
  end if;

  return new;
end;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_prod_piece_totals(target_prod_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  update public.production_prods prod
  set
    pieces_count = coalesce(totals.pieces_count, 0),
    pieces_area_m2 = coalesce(totals.area_m2, 0),
    pieces_weight_kg = coalesce(totals.weight_kg, 0),
    updated_at = now()
  from (
    select
      p.prod_id,
      coalesce(sum(p.quantity), 0)::integer as pieces_count,
      coalesce(sum(p.area_m2), 0)::numeric(14, 3) as area_m2,
      coalesce(sum(p.total_weight_kg), 0)::numeric(14, 3) as weight_kg
    from public.production_prod_pieces p
    where p.prod_id = target_prod_id
    group by p.prod_id
  ) totals
  where prod.id = target_prod_id
    and prod.id = totals.prod_id;

  if not found then
    update public.production_prods
    set
      pieces_count = 0,
      pieces_area_m2 = 0,
      pieces_weight_kg = 0,
      updated_at = now()
    where id = target_prod_id;
  end if;
end;
$function$;

CREATE TRIGGER production_piece_reworks_set_updated_at BEFORE UPDATE ON public.production_piece_reworks FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER production_prod_piece_stages_set_updated_at BEFORE UPDATE ON public.production_prod_piece_stages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER protect_archived_expedition_stage BEFORE DELETE OR UPDATE ON public.production_prod_piece_stages FOR EACH ROW EXECUTE FUNCTION protect_archived_expedition_stage();
CREATE TRIGGER production_prod_pieces_create_stages AFTER INSERT ON public.production_prod_pieces FOR EACH ROW EXECUTE FUNCTION create_piece_stage_rows();
CREATE TRIGGER production_prod_pieces_refresh_totals_delete AFTER DELETE ON public.production_prod_pieces FOR EACH ROW EXECUTE FUNCTION refresh_prod_piece_totals_from_piece();
CREATE TRIGGER production_prod_pieces_refresh_totals_update AFTER UPDATE OF quantity, area_m2, total_weight_kg, prod_id ON public.production_prod_pieces FOR EACH ROW EXECUTE FUNCTION refresh_prod_piece_totals_from_piece();
CREATE TRIGGER production_prod_pieces_set_updated_at BEFORE UPDATE ON public.production_prod_pieces FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER production_prod_stages_audit AFTER INSERT OR DELETE OR UPDATE ON public.production_prod_stages FOR EACH ROW EXECUTE FUNCTION audit_table_changes();
CREATE TRIGGER production_prod_stages_ensure_company BEFORE INSERT ON public.production_prod_stages FOR EACH ROW EXECUTE FUNCTION ensure_company_id();
CREATE TRIGGER production_prod_stages_set_updated_at BEFORE UPDATE ON public.production_prod_stages FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER production_prod_stages_touch BEFORE UPDATE ON public.production_prod_stages FOR EACH ROW EXECUTE FUNCTION touch_stage_update();
CREATE TRIGGER production_prods_audit AFTER INSERT OR DELETE OR UPDATE ON public.production_prods FOR EACH ROW EXECUTE FUNCTION audit_table_changes();
CREATE TRIGGER production_prods_ensure_company BEFORE INSERT ON public.production_prods FOR EACH ROW EXECUTE FUNCTION ensure_company_id();
CREATE TRIGGER production_prods_initialize_defaults AFTER INSERT ON public.production_prods FOR EACH ROW EXECUTE FUNCTION initialize_prod_defaults();
CREATE TRIGGER production_prods_set_updated_at BEFORE UPDATE ON public.production_prods FOR EACH ROW EXECUTE FUNCTION set_updated_at();
