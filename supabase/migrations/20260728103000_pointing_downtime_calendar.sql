begin;

alter table public.production_pointing_reasons
  add column if not exists counts_as_downtime boolean not null default true;

comment on column public.production_pointing_reasons.counts_as_downtime is
  'Define se o motivo entra no cálculo gerencial de tempo parado.';

update public.production_pointing_reasons
set counts_as_downtime = false
where kind = 'pausa'
  and (
    lower(label) like '%intervalo%'
    or lower(label) like '%almo%'
    or lower(label) like '%lanche%'
    or lower(label) like '%cafe%'
    or lower(label) like '%café%'
    or lower(label) like '%fim de expediente%'
    or lower(label) like '%fim do expediente%'
  );

create table if not exists public.production_pointing_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  timezone text not null default 'America/Sao_Paulo',
  workday_start time not null default '08:00',
  workday_end time not null default '18:00',
  workdays integer[] not null default array[1, 2, 3, 4, 5],
  breaks jsonb not null default
    '[{"label":"Almoço","start":"12:00","end":"13:00"},{"label":"Lanche","start":"15:00","end":"15:15"}]'::jsonb,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint production_pointing_settings_workdays_check check (
    array_length(workdays, 1) is not null
    and workdays <@ array[0, 1, 2, 3, 4, 5, 6]
  ),
  constraint production_pointing_settings_breaks_array_check check (jsonb_typeof(breaks) = 'array')
);

insert into public.production_pointing_settings (company_id)
select company.id
from public.companies company
on conflict (company_id) do nothing;

insert into public.permissions (key, description)
values
  ('production.pointing.manage_calendar', 'Gerenciar jornada e cálculo de tempo parado dos apontamentos')
on conflict (key) do update
set description = excluded.description;

insert into public.role_permissions (company_id, role_id, permission_id)
select role.company_id, role.id, permission.id
from public.roles role
cross join public.permissions permission
where role.is_master_role = true
  and permission.key = 'production.pointing.manage_calendar'
on conflict do nothing;

alter table public.production_pointing_settings enable row level security;

drop policy if exists production_pointing_settings_read on public.production_pointing_settings;
create policy production_pointing_settings_read on public.production_pointing_settings
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.dashboard.view')
    or public.has_permission('production.reports.view')
    or public.has_permission('production.pointing.view')
    or public.has_permission('production.pointing.perform')
    or public.has_permission('production.pointing.manage_reasons')
    or public.has_permission('production.pointing.manage_calendar')
  )
);

drop policy if exists production_pointing_settings_manage on public.production_pointing_settings;
create policy production_pointing_settings_manage on public.production_pointing_settings
for all to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.manage_calendar')
  )
)
with check (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.pointing.manage_calendar')
  )
);

drop trigger if exists production_pointing_settings_set_updated_at
  on public.production_pointing_settings;
create trigger production_pointing_settings_set_updated_at
before update on public.production_pointing_settings
for each row execute function public.set_updated_at();

commit;
