begin;

alter table public.production_operators
  drop constraint if exists production_operators_registration_three_digits;

alter table public.production_operators
  add constraint production_operators_registration_three_digits
  check (registration ~ '^[0-9]{3}$')
  not valid;

create or replace function public.hash_production_operator_pin(plain_pin text)
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  if plain_pin is null or plain_pin !~ '^[0-9]{4}$' then
    raise exception 'A senha do operador deve possuir 4 dígitos.';
  end if;

  return extensions.crypt(plain_pin, extensions.gen_salt('bf'));
end;
$$;

create or replace function public.verify_production_operator_pin(stored_hash text, plain_pin text)
returns boolean
language sql
stable
security definer
set search_path = public, extensions
as $$
  select coalesce(plain_pin ~ '^[0-9]{4}$' and stored_hash = extensions.crypt(plain_pin, stored_hash), false);
$$;

grant execute on function public.hash_production_operator_pin(text) to authenticated;
grant execute on function public.verify_production_operator_pin(text, text) to authenticated;

commit;
