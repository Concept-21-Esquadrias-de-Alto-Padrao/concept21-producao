create table if not exists public.system_maintenance (
  company_id uuid primary key references public.companies(id) on delete cascade,
  enabled boolean not null default false,
  message text not null default 'Sistema em manutenção para atualização controlada.',
  activated_at timestamptz,
  activated_by uuid references public.profiles(id) on delete set null,
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references public.profiles(id) on delete set null,
  constraint system_maintenance_activation_check check (
    enabled = false or activated_at is not null
  )
);

insert into public.system_maintenance (company_id)
select id
from public.companies
on conflict (company_id) do nothing;

alter table public.system_maintenance enable row level security;

drop policy if exists system_maintenance_read on public.system_maintenance;
create policy system_maintenance_read on public.system_maintenance
for select to authenticated
using (company_id = public.current_company_id() or public.is_master());

drop policy if exists system_maintenance_master_manage on public.system_maintenance;
create policy system_maintenance_master_manage on public.system_maintenance
for all to authenticated
using (company_id = public.current_company_id() and public.is_master())
with check (company_id = public.current_company_id() and public.is_master());
