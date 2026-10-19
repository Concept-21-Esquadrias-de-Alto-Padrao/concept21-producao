begin;

create or replace function public.create_pointing_pending_notifications(
  target_piece_stage_id uuid,
  pending_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  pending_details record;
begin
  select
    piece_stage.id,
    piece_stage.company_id,
    piece_stage.prod_id,
    piece_stage.piece_id,
    piece_stage.stage_id,
    piece.piece_code,
    stage.name as stage_name,
    prod.prod_number
  into pending_details
  from public.production_prod_piece_stages piece_stage
  join public.production_prod_pieces piece on piece.id = piece_stage.piece_id
  join public.production_stages stage on stage.id = piece_stage.stage_id
  join public.production_prods prod on prod.id = piece_stage.prod_id
  where piece_stage.id = target_piece_stage_id;

  if pending_details.id is null then
    return;
  end if;

  insert into public.platform_notifications (
    recipient_profile_id,
    recipient_auth_user_id,
    title,
    body,
    category,
    entity,
    entity_id,
    action_url,
    metadata
  )
  select
    profile.id,
    profile.user_id,
    'Pendência de apontamento',
    'Peça ' || pending_details.piece_code ||
      ' da PROD ' || pending_details.prod_number ||
      ' ficou com pendência na etapa ' || pending_details.stage_name ||
      case
        when nullif(trim(coalesce(pending_reason, '')), '') is not null
          then ': ' || trim(pending_reason)
        else '.'
      end,
    'pointing_pending',
    'production_piece_stage_pending',
    pending_details.id,
    '/pointing',
    jsonb_build_object(
      'prod_id', pending_details.prod_id,
      'piece_id', pending_details.piece_id,
      'stage_id', pending_details.stage_id,
      'piece_code', pending_details.piece_code,
      'stage_name', pending_details.stage_name,
      'pending_reason', pending_reason,
      'notification_source', 'pointing_pending_created'
    )
  from public.profiles profile
  where profile.company_id = pending_details.company_id
    and profile.status = 'active'
    and (
      profile.is_master = true
      or exists (
        select 1
        from public.user_roles user_role
        join public.roles role on role.id = user_role.role_id and role.active = true
        left join public.role_permissions role_permission on role_permission.role_id = role.id
        left join public.permissions permission on permission.id = role_permission.permission_id
        where user_role.profile_id = profile.id
          and user_role.company_id = pending_details.company_id
          and (
            role.is_master_role = true
            or permission.key = 'production.pointing.receive_pending_notifications'
          )
      )
    );
end;
$$;

grant execute on function public.create_pointing_pending_notifications(uuid, text) to authenticated;

commit;
