begin;

update auth.users
set raw_user_meta_data =
  jsonb_set(
    jsonb_set(
      coalesce(raw_user_meta_data, '{}'::jsonb),
      '{full_name}',
      to_jsonb('João Pedro Menezes Silva'::text),
      true
    ),
    '{name}',
    to_jsonb('João Pedro Menezes Silva'::text),
    true
  )
where lower(email) = lower('joaopedro@conceptal.com.br');

update public.profiles
set
  name = 'João Pedro Menezes Silva',
  updated_at = now()
where lower(email) = lower('joaopedro@conceptal.com.br')
  or user_id in (
    select id
    from auth.users
    where lower(email) = lower('joaopedro@conceptal.com.br')
  );

update public.access_review_requests
set
  name = 'João Pedro Menezes Silva',
  updated_at = now()
where lower(email) = lower('joaopedro@conceptal.com.br')
  or auth_user_id in (
    select id
    from auth.users
    where lower(email) = lower('joaopedro@conceptal.com.br')
  );

commit;
