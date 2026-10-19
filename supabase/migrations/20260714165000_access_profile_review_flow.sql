create table if not exists public.access_review_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  profile_id uuid not null unique references public.profiles(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  requested_at timestamptz not null default now(),
  email_confirmed_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  reviewer_notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists access_review_requests_company_status_idx
  on public.access_review_requests(company_id, status, requested_at desc);

create index if not exists access_review_requests_auth_user_idx
  on public.access_review_requests(auth_user_id);

drop trigger if exists access_review_requests_set_updated_at on public.access_review_requests;
create trigger access_review_requests_set_updated_at
before update on public.access_review_requests
for each row execute function public.set_updated_at();

alter table public.access_review_requests enable row level security;

create or replace function public.current_auth_email_confirmed()
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from auth.users u
    where u.id = auth.uid()
      and coalesce(u.email_confirmed_at, u.confirmed_at) is not null
  )
$$;

create or replace function public.current_company_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select p.company_id
  from public.profiles p
  where p.user_id = auth.uid()
    and p.status = 'active'
    and public.current_auth_email_confirmed()
  limit 1
$$;

create or replace function public.is_master()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_auth_email_confirmed()
    and coalesce(
      (
        select p.is_master
        from public.profiles p
        where p.user_id = auth.uid()
          and p.status = 'active'
        limit 1
      ),
      false
    )
$$;

create or replace function public.has_permission(permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_auth_email_confirmed()
    and (
      public.is_master()
      or exists (
        select 1
        from public.profiles p
        join public.user_roles ur on ur.profile_id = p.id
        join public.roles r on r.id = ur.role_id and r.active
        join public.role_permissions rp on rp.role_id = r.id
        join public.permissions perm on perm.id = rp.permission_id
        where p.user_id = auth.uid()
          and p.status = 'active'
          and p.company_id = ur.company_id
          and perm.key = permission_key
      )
    )
$$;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_company_id uuid;
  profile_name text;
  profile_email text;
begin
  select id into target_company_id
  from public.companies
  order by created_at
  limit 1;

  if target_company_id is null then
    insert into public.companies (name, slug)
    values ('Concept21 Aluminium', 'concept21')
    returning id into target_company_id;
  end if;

  profile_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', '')), '');
  profile_email := coalesce(new.email, new.id::text || '@auth.local');

  insert into public.profiles (
    company_id,
    user_id,
    name,
    email,
    title,
    status,
    is_master
  )
  values (
    target_company_id,
    new.id,
    coalesce(profile_name, split_part(profile_email, '@', 1), 'Usuário'),
    profile_email,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'title', '')), ''),
    'active',
    false
  )
  on conflict (company_id, email) do update
  set
    user_id = coalesce(public.profiles.user_id, excluded.user_id),
    name = coalesce(nullif(excluded.name, ''), public.profiles.name),
    title = coalesce(excluded.title, public.profiles.title),
    status = 'active',
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

create or replace function public.request_access_review()
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  current_profile record;
  confirmed_at timestamptz;
  request_id uuid;
begin
  select
    p.id,
    p.company_id,
    p.user_id,
    p.name,
    p.email,
    p.status,
    coalesce(u.email_confirmed_at, u.confirmed_at) as confirmed_at
  into current_profile
  from public.profiles p
  join auth.users u on u.id = p.user_id
  where p.user_id = auth.uid()
  limit 1;

  if not found then
    raise exception 'Perfil de acesso não encontrado.';
  end if;

  if current_profile.status <> 'active' then
    raise exception 'Cadastro inativo.';
  end if;

  confirmed_at := current_profile.confirmed_at;

  if confirmed_at is null then
    raise exception 'Confirme seu e-mail antes de solicitar acesso.';
  end if;

  if exists (
    select 1
    from public.user_roles ur
    join public.roles r on r.id = ur.role_id
    where ur.profile_id = current_profile.id
      and r.active = true
  ) then
    insert into public.access_review_requests (
      company_id,
      profile_id,
      auth_user_id,
      email,
      name,
      status,
      email_confirmed_at,
      reviewed_at,
      reviewed_by
    )
    values (
      current_profile.company_id,
      current_profile.id,
      current_profile.user_id,
      current_profile.email,
      current_profile.name,
      'approved',
      confirmed_at,
      now(),
      auth.uid()
    )
    on conflict (profile_id) do update
    set
      status = 'approved',
      email = excluded.email,
      name = excluded.name,
      email_confirmed_at = excluded.email_confirmed_at,
      reviewed_at = coalesce(public.access_review_requests.reviewed_at, now()),
      reviewed_by = coalesce(public.access_review_requests.reviewed_by, auth.uid()),
      updated_at = now()
    returning id into request_id;

    return request_id;
  end if;

  insert into public.access_review_requests (
    company_id,
    profile_id,
    auth_user_id,
    email,
    name,
    status,
    requested_at,
    email_confirmed_at
  )
  values (
    current_profile.company_id,
    current_profile.id,
    current_profile.user_id,
    current_profile.email,
    current_profile.name,
    'pending',
    now(),
    confirmed_at
  )
  on conflict (profile_id) do update
  set
    status = 'pending',
    email = excluded.email,
    name = excluded.name,
    requested_at = coalesce(public.access_review_requests.requested_at, now()),
    email_confirmed_at = excluded.email_confirmed_at,
    updated_at = now()
  returning id into request_id;

  return request_id;
end;
$$;

create or replace function public.mark_access_request_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.access_review_requests
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    updated_at = now()
  where profile_id = new.profile_id
    and status = 'pending';

  return new;
end;
$$;

drop trigger if exists mark_access_request_approved_on_user_roles on public.user_roles;
create trigger mark_access_request_approved_on_user_roles
after insert on public.user_roles
for each row execute function public.mark_access_request_approved();

drop policy if exists access_review_requests_select on public.access_review_requests;
create policy access_review_requests_select on public.access_review_requests
for select to authenticated
using (
  auth_user_id = auth.uid()
  or (
    company_id = public.current_company_id()
    and (public.is_master() or public.has_permission('production.settings.manage_users'))
  )
);

drop policy if exists access_review_requests_update on public.access_review_requests;
create policy access_review_requests_update on public.access_review_requests
for update to authenticated
using (
  company_id = public.current_company_id()
  and (public.is_master() or public.has_permission('production.settings.manage_users'))
)
with check (
  company_id = public.current_company_id()
  and (public.is_master() or public.has_permission('production.settings.manage_users'))
);

drop policy if exists profiles_insert_manage on public.profiles;
create policy profiles_insert_manage on public.profiles
for insert to authenticated
with check (
  company_id = public.current_company_id()
  and (public.is_master() or public.has_permission('production.settings.manage_users'))
);

drop policy if exists roles_read_security on public.roles;
create policy roles_read_security on public.roles
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.settings.manage_users')
    or exists (
      select 1
      from public.profiles p
      join public.user_roles ur on ur.profile_id = p.id
      where p.user_id = auth.uid()
        and p.status = 'active'
        and ur.role_id = roles.id
    )
  )
);

drop policy if exists user_roles_read_own_or_security on public.user_roles;
create policy user_roles_read_own_or_security on public.user_roles
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.settings.manage_users')
    or exists (
      select 1
      from public.profiles p
      where p.id = user_roles.profile_id
        and p.user_id = auth.uid()
        and p.status = 'active'
    )
  )
);

drop policy if exists user_roles_manage_security on public.user_roles;
create policy user_roles_manage_security on public.user_roles
for all to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or (
      public.has_permission('production.settings.manage_users')
      and not exists (
        select 1 from public.roles r
        where r.id = user_roles.role_id
          and r.is_master_role
      )
    )
  )
)
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or (
      public.has_permission('production.settings.manage_users')
      and not exists (
        select 1 from public.roles r
        where r.id = user_roles.role_id
          and r.is_master_role
      )
    )
  )
);

grant execute on function public.current_auth_email_confirmed() to authenticated;
grant execute on function public.request_access_review() to authenticated;
