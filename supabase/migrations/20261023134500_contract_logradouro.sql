-- The street field now contains the entire logradouro, including its type.
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
        nullif(trim(target_street), ''),
        case when nullif(trim(target_block), '') is not null then 'Quadra ' || trim(target_block) end,
        case when nullif(trim(target_lot), '') is not null then 'Lote ' || trim(target_lot) end,
        case when nullif(trim(target_sector), '') is not null then 'Setor ' || trim(target_sector) end
      ),
      ''
    ),
    fallback_address
  );
$$;

-- Old forms asked for the name of a Rua; keep those existing addresses intact.
-- Addresses where someone already entered a complete type (e.g. Rua SB)
-- are rebuilt without the duplicated prefix.
update public.production_contracts
set street = case
  when trim(street) ~* '^rua:[[:space:]]*' then regexp_replace(trim(street), '^rua:[[:space:]]*', 'Rua ', 'i')
  when trim(street) ~* '^(rua|r\.|avenida|av\.?|alameda|travessa|estrada|rodovia|praça|praca|largo|via|viela|servidão|servidao|conjunto)([[:space:]]|$)|^BR-[0-9]'
    then trim(street)
  else 'Rua ' || trim(street)
end
where nullif(trim(street), '') is not null;
