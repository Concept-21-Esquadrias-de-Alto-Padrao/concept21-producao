begin;

update public.roles r
set name = 'Administrador',
    description = coalesce(nullif(r.description, ''), 'Acesso total e exclusivo ao controle de permissões.'),
    active = true
where r.is_master_role = true
  and r.name = 'Master'
  and not exists (
    select 1
    from public.roles existing
    where existing.company_id = r.company_id
      and existing.name = 'Administrador'
      and existing.id <> r.id
  );

update public.roles
set description = replace(description, 'Master', 'Administrador')
where is_master_role = true
  and description like '%Master%';

update public.permissions
set description = 'Gerenciar permissões e usuários administradores'
where key = 'production.permissions.manage';

create or replace function public.prevent_common_permission_manage_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  permission_key text;
  target_is_master_role boolean;
begin
  select key into permission_key from public.permissions where id = new.permission_id;
  select is_master_role into target_is_master_role from public.roles where id = new.role_id;

  if permission_key = 'production.permissions.manage' and not coalesce(target_is_master_role, false) then
    raise exception 'production.permissions.manage só pode ser atribuída ao perfil Administrador';
  end if;

  return new;
end;
$$;

create or replace function public.prevent_common_master_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  target_is_master_role boolean;
  target_profile_is_master boolean;
begin
  select is_master_role into target_is_master_role from public.roles where id = new.role_id;
  select is_master into target_profile_is_master from public.profiles where id = new.profile_id;

  if coalesce(target_is_master_role, false)
     and not public.is_master()
     and not coalesce(target_profile_is_master, false) then
    raise exception 'Somente administradores podem atribuir perfis de Administrador';
  end if;

  return new;
end;
$$;

commit;
