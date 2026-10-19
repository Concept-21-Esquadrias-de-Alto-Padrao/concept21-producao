alter table public.production_contracts
  add column if not exists street text,
  add column if not exists block text,
  add column if not exists lot text,
  add column if not exists sector text;

create or replace function public.build_contract_full_address(
  target_street text,
  target_block text,
  target_lot text,
  target_sector text,
  fallback_address text
)
returns text
language sql
immutable
as $$
  select coalesce(
    nullif(
      concat_ws(
        ', ',
        case when nullif(trim(target_street), '') is not null then 'Rua ' || trim(target_street) end,
        case when nullif(trim(target_block), '') is not null then 'Quadra ' || trim(target_block) end,
        case when nullif(trim(target_lot), '') is not null then 'Lote ' || trim(target_lot) end,
        case when nullif(trim(target_sector), '') is not null then 'Setor ' || trim(target_sector) end
      ),
      ''
    ),
    fallback_address
  );
$$;

create or replace function public.sync_contract_full_address()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.full_address := public.build_contract_full_address(
    new.street,
    new.block,
    new.lot,
    new.sector,
    new.full_address
  );

  new.zip_code := null;
  new.site_contact := null;
  new.site_contact_phone := null;

  return new;
end;
$$;

drop trigger if exists production_contracts_sync_full_address on public.production_contracts;
create trigger production_contracts_sync_full_address
before insert or update on public.production_contracts
for each row execute function public.sync_contract_full_address();
