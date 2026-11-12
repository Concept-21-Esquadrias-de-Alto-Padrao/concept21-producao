
-- User-authorized maintenance for this module. All new controls start OFF.
-- Existing identity/RBAC policies and local maintenance controls remain intact.
create schema portal_maintenance_private;
revoke all on schema portal_maintenance_private from public, anon, authenticated;
create table portal_maintenance_private.state (
 scope text primary key check(scope in ('global','module')),
 enabled boolean not null default false,
 message text not null default 'Sistema em manutenção. Aguarde a liberação.',
 version bigint not null default 0 check(version>=0),
 updated_at timestamptz not null default now(),
 updated_by uuid
);
insert into portal_maintenance_private.state(scope) values('global'),('module');
create table portal_maintenance_private.events (
 id bigint generated always as identity primary key,
 scope text not null, enabled boolean not null, version bigint not null,
 actor uuid not null, changed_at timestamptz not null default now(),
 unique(scope,version)
);
alter table portal_maintenance_private.state enable row level security;
alter table portal_maintenance_private.events enable row level security;
revoke all on all tables in schema portal_maintenance_private from public,anon,authenticated;

create function portal_maintenance_private.is_admin() returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
 select auth.uid() is not null and (auth.jwt()->>'client_id') is null and coalesce((public.is_master()),false)
$$;
create function portal_maintenance_private.enabled() returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
 select exists(select 1 from portal_maintenance_private.state where enabled) or coalesce((select coalesce(bool_or(enabled),false) from public.system_maintenance),false)
$$;
create function portal_maintenance_private.allowed() returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$
 select not portal_maintenance_private.enabled() or portal_maintenance_private.is_admin()
   or coalesce(auth.jwt()->>'role'='service_role',false)
   or ((auth.jwt()->>'role') is null and session_user in ('postgres','supabase_admin'))
$$;
create function public.platform_maintenance_can_access() returns boolean language sql stable security definer
set search_path=pg_catalog,public as $$ select portal_maintenance_private.allowed() $$;
create function public.platform_maintenance_status() returns jsonb language sql stable security definer
set search_path=pg_catalog,public as $$
 select jsonb_build_object(
  'enabled',portal_maintenance_private.enabled(),
  'globalEnabled',(select enabled from portal_maintenance_private.state where scope='global'),
  'moduleEnabled',(select enabled from portal_maintenance_private.state where scope='module'),
  'legacyEnabled',coalesce((select coalesce(bool_or(enabled),false) from public.system_maintenance),false),
  'admin',portal_maintenance_private.is_admin(),
  'canAccess',portal_maintenance_private.allowed(),
  'message',coalesce((select message from portal_maintenance_private.state where enabled order by case scope when 'global' then 0 else 1 end limit 1),'Sistema em manutenção. Aguarde a liberação.')
 )
$$;
create function public.platform_maintenance_apply(p_scope text,p_enabled boolean,p_version bigint,p_actor uuid,p_message text)
returns jsonb language plpgsql security definer set search_path=pg_catalog,public as $$
declare current_version bigint;
begin
 if p_scope not in ('global','module') or p_enabled is null or p_version<=0 or p_actor is null
    or p_message is null or length(p_message)>500 then raise exception 'Comando de manutenção inválido.' using errcode='22023'; end if;
 select version into current_version from portal_maintenance_private.state where scope=p_scope for update;
 if current_version>p_version then return jsonb_build_object('stale',true,'version',current_version); end if;
 if current_version=p_version then return jsonb_build_object('ok',true,'version',current_version); end if;
 update portal_maintenance_private.state set enabled=p_enabled,version=p_version,message=p_message,
  updated_at=now(),updated_by=p_actor where scope=p_scope;
 insert into portal_maintenance_private.events(scope,enabled,version,actor) values(p_scope,p_enabled,p_version,p_actor);
 return jsonb_build_object('ok',true,'version',p_version);
end;
$$;
create function portal_maintenance_private.guard_write() returns trigger language plpgsql security definer
set search_path=pg_catalog,public as $$
begin
 if not portal_maintenance_private.allowed() then
  raise exception 'Sistema em manutenção. Não é possível gravar dados neste momento.' using errcode='55000';
 end if;
 return null;
end;
$$;
revoke all on all functions in schema portal_maintenance_private from public,anon,authenticated;
revoke all on function public.platform_maintenance_apply(text,boolean,bigint,uuid,text) from public,anon,authenticated;
grant execute on function public.platform_maintenance_apply(text,boolean,bigint,uuid,text) to service_role;
revoke all on function public.platform_maintenance_status(),public.platform_maintenance_can_access() from public,anon,authenticated;
grant execute on function public.platform_maintenance_status(),public.platform_maintenance_can_access() to anon,authenticated,service_role;

-- Explicit inventory of operational tables reviewed for this module.
-- Restrictive policies intersect existing grants; statement guards also cover
-- writes through existing SECURITY DEFINER business RPCs.
do $inventory$ declare item record; begin for item in select * from jsonb_to_recordset('[{"s":"public","t":"production_prods"},{"s":"public","t":"production_expedition_archives"},{"s":"public","t":"production_prod_lifecycle"},{"s":"public","t":"companies"},{"s":"public","t":"departments"},{"s":"public","t":"clients"},{"s":"public","t":"production_stages"},{"s":"public","t":"production_prod_stages"},{"s":"public","t":"production_material_groups"},{"s":"public","t":"production_prod_materials"},{"s":"public","t":"storage_location_types"},{"s":"public","t":"production_contracts"},{"s":"public","t":"storage_locations"},{"s":"public","t":"production_document_checklist_items"},{"s":"public","t":"production_prod_document_checks"},{"s":"public","t":"production_selectable_items"},{"s":"public","t":"production_prod_selected_items"},{"s":"public","t":"production_shipping_records"},{"s":"public","t":"production_piece_imports"},{"s":"public","t":"production_operator_stages"},{"s":"public","t":"production_operators"},{"s":"public","t":"production_pointing_sessions"},{"s":"public","t":"production_stage_time_entries"},{"s":"public","t":"production_pointing_reasons"},{"s":"public","t":"production_prod_pieces"},{"s":"public","t":"production_prod_piece_stages"},{"s":"public","t":"production_pointing_session_participants"},{"s":"public","t":"production_rework_reasons"},{"s":"public","t":"production_piece_reworks"},{"s":"public","t":"production_pointing_settings"},{"s":"public","t":"production_indirect_activity_reasons"},{"s":"public","t":"production_indirect_activity_sessions"},{"s":"public","t":"production_piece_dispositions"},{"s":"public","t":"production_piece_dispatches"},{"s":"public","t":"production_lifecycle_events"},{"s":"public","t":"production_contract_lifecycle"},{"s":"public","t":"production_contract_scope_revisions"},{"s":"public","t":"production_romaneios"},{"s":"public","t":"production_romaneio_items"}]'::jsonb) as x(s text,t text) loop execute format('create policy portal_maintenance_gate on %I.%I as restrictive for all to public using ((select public.platform_maintenance_can_access())) with check ((select public.platform_maintenance_can_access()))',item.s,item.t); execute format('create trigger portal_maintenance_write before insert or update or delete on %I.%I for each statement execute function portal_maintenance_private.guard_write()',item.s,item.t); end loop; end; $inventory$;

notify pgrst,'reload schema';
