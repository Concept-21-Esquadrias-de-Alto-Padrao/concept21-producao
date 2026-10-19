begin;

create table if not exists public.platform_notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_profile_id uuid references public.profiles(id) on delete cascade,
  recipient_auth_user_id uuid references auth.users(id) on delete cascade,
  title text not null,
  body text not null,
  category text not null default 'info',
  entity text,
  entity_id uuid,
  action_url text,
  read_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.email_notification_queue (
  id uuid primary key default gen_random_uuid(),
  recipient_email text not null,
  recipient_name text,
  subject text not null,
  body text not null,
  status text not null default 'queued',
  provider text,
  provider_response jsonb,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  constraint email_notification_queue_status_check check (
    status in ('queued', 'sent', 'failed', 'provider_not_configured')
  )
);

create index if not exists platform_notifications_recipient_idx
  on public.platform_notifications(recipient_profile_id, read_at, created_at desc);

create index if not exists email_notification_queue_status_idx
  on public.email_notification_queue(status, created_at);

alter table public.platform_notifications enable row level security;
alter table public.email_notification_queue enable row level security;

drop policy if exists platform_notifications_select on public.platform_notifications;
create policy platform_notifications_select
on public.platform_notifications for select to authenticated
using (
  recipient_auth_user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = platform_notifications.recipient_profile_id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
  or public.is_master()
  or public.has_permission('production.settings.manage_users')
);

drop policy if exists platform_notifications_update_own on public.platform_notifications;
create policy platform_notifications_update_own
on public.platform_notifications for update to authenticated
using (
  recipient_auth_user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = platform_notifications.recipient_profile_id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
)
with check (
  recipient_auth_user_id = auth.uid()
  or exists (
    select 1
    from public.profiles p
    where p.id = platform_notifications.recipient_profile_id
      and p.user_id = auth.uid()
      and p.status = 'active'
  )
);

drop policy if exists email_notification_queue_select on public.email_notification_queue;
create policy email_notification_queue_select
on public.email_notification_queue for select to authenticated
using (
  public.is_master()
  or public.has_permission('production.settings.manage_users')
);

drop policy if exists email_notification_queue_update on public.email_notification_queue;
create policy email_notification_queue_update
on public.email_notification_queue for update to authenticated
using (
  public.is_master()
  or public.has_permission('production.settings.manage_users')
)
with check (
  public.is_master()
  or public.has_permission('production.settings.manage_users')
);

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
  recipient record;
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

  for recipient in
    select distinct p.id, p.user_id, p.name, p.email
    from public.profiles p
    left join public.user_roles ur on ur.profile_id = p.id
    left join public.roles r on r.id = ur.role_id
    left join public.role_permissions rp on rp.role_id = r.id
    left join public.permissions perm on perm.id = rp.permission_id
    where p.company_id = current_profile.company_id
      and p.status = 'active'
      and p.user_id is not null
      and (
        p.is_master = true
        or (
          r.active = true
          and (
            r.is_master_role = true
            or perm.key = 'production.settings.manage_users'
          )
        )
      )
  loop
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
      recipient.id,
      recipient.user_id,
      'Cadastro aguardando perfil de acesso',
      current_profile.name || ' (' || current_profile.email || ') confirmou o e-mail e aguarda aprovação.',
      'access_review',
      'access_review_request',
      request_id,
      '/settings',
      jsonb_build_object('profile_id', current_profile.id, 'auth_user_id', current_profile.user_id)
    where not exists (
      select 1
      from public.platform_notifications n
      where n.recipient_profile_id = recipient.id
        and n.entity = 'access_review_request'
        and n.entity_id = request_id
        and n.read_at is null
    );

    insert into public.email_notification_queue (
      recipient_email,
      recipient_name,
      subject,
      body,
      status,
      metadata
    )
    select
      recipient.email,
      recipient.name,
      'Cadastro aguardando perfil de acesso',
      'O usuário ' || current_profile.name || ' (' || current_profile.email || ') confirmou o e-mail e precisa de aprovação de perfil no módulo de Produção Concept21.',
      'queued',
      jsonb_build_object(
        'source', 'access_review_request',
        'access_request_id', request_id,
        'profile_id', current_profile.id,
        'auth_user_id', current_profile.user_id
      )
    where not exists (
      select 1
      from public.email_notification_queue q
      where q.recipient_email = recipient.email
        and q.metadata ->> 'access_request_id' = request_id::text
        and q.status in ('queued', 'sent')
    );
  end loop;

  return request_id;
end;
$$;

create or replace function public.mark_access_request_approved()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  request_id uuid;
begin
  update public.access_review_requests
  set
    status = 'approved',
    reviewed_at = now(),
    reviewed_by = auth.uid(),
    updated_at = now()
  where profile_id = new.profile_id
    and status = 'pending'
  returning id into request_id;

  if request_id is not null then
    update public.platform_notifications
    set read_at = coalesce(read_at, now())
    where entity = 'access_review_request'
      and entity_id = request_id;
  end if;

  return new;
end;
$$;

drop trigger if exists mark_access_request_approved_on_user_roles on public.user_roles;
create trigger mark_access_request_approved_on_user_roles
after insert on public.user_roles
for each row execute function public.mark_access_request_approved();

create or replace function public.promote_user_to_master(target_email text)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  target_user_id uuid;
  target_company_id uuid;
  target_profile_id uuid;
  target_role_id uuid;
  target_user_name text;
begin
  select u.id, coalesce(u.raw_user_meta_data ->> 'full_name', u.raw_user_meta_data ->> 'name', target_email)
    into target_user_id, target_user_name
  from auth.users u
  where lower(u.email) = lower(target_email)
  limit 1;

  if target_user_id is null then
    raise exception 'Authenticated user with email % not found', target_email;
  end if;

  select id into target_company_id
  from public.companies
  order by created_at
  limit 1;

  if target_company_id is null then
    insert into public.companies (name, slug)
    values ('Concept21 Aluminium', 'concept21')
    returning id into target_company_id;
  end if;

  select id into target_profile_id
  from public.profiles
  where user_id = target_user_id
  limit 1;

  if target_profile_id is null then
    update public.profiles
    set
      user_id = target_user_id,
      name = coalesce(nullif(name, ''), target_user_name, target_email),
      email = target_email,
      is_master = true,
      status = 'active',
      updated_at = now()
    where company_id = target_company_id
      and lower(email) = lower(target_email)
    returning id into target_profile_id;
  end if;

  if target_profile_id is null then
    insert into public.profiles (company_id, user_id, name, email, is_master, status)
    values (
      target_company_id,
      target_user_id,
      coalesce(nullif(target_user_name, ''), target_email),
      target_email,
      true,
      'active'
    )
    on conflict (user_id) do update
      set is_master = true,
          status = 'active',
          updated_at = now()
    returning id into target_profile_id;
  else
    update public.profiles
    set is_master = true,
        status = 'active',
        updated_at = now()
    where id = target_profile_id;
  end if;

  select id into target_role_id
  from public.roles
  where company_id = target_company_id
    and is_master_role
  limit 1;

  if target_role_id is not null then
    insert into public.user_roles (company_id, profile_id, role_id)
    values (target_company_id, target_profile_id, target_role_id)
    on conflict do nothing;
  end if;
end;
$$;

revoke all on function public.promote_user_to_master(text) from public;

grant execute on function public.request_access_review() to authenticated;

commit;
