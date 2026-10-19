begin;

create table if not exists public.logistics_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  fuel_price_per_liter numeric(12, 2) not null default 0 check (fuel_price_per_liter >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null
);

insert into public.logistics_settings (company_id, fuel_price_per_liter)
select
  c.id,
  coalesce((
    select max(v.fuel_price_per_liter)
    from public.logistics_vehicles v
    where v.company_id = c.id
      and v.ownership_type = 'proprio'
      and v.fuel_price_per_liter > 0
  ), 0)
from public.companies c
on conflict (company_id) do nothing;

update public.logistics_settings s
set fuel_price_per_liter = source.fuel_price_per_liter
from (
  select
    company_id,
    max(fuel_price_per_liter) as fuel_price_per_liter
  from public.logistics_vehicles
  where ownership_type = 'proprio'
    and fuel_price_per_liter > 0
  group by company_id
) source
where s.company_id = source.company_id
  and s.fuel_price_per_liter = 0;

alter table public.logistics_settings enable row level security;

drop policy if exists logistics_settings_read on public.logistics_settings;
create policy logistics_settings_read on public.logistics_settings
for select to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.settings.manage_logistics')
    or public.has_permission('production.routes.view')
    or public.has_permission('production.routes.create')
    or public.has_permission('production.routes.edit')
  )
);

drop policy if exists logistics_settings_manage on public.logistics_settings;
create policy logistics_settings_manage on public.logistics_settings
for all to authenticated
using (
  company_id = public.current_company_id()
  and (
    public.is_master()
    or public.has_permission('production.settings.manage_logistics')
  )
)
with check (company_id = public.current_company_id());

drop trigger if exists logistics_settings_set_updated_at on public.logistics_settings;
create trigger logistics_settings_set_updated_at
before update on public.logistics_settings
for each row execute function public.set_updated_at();

commit;
