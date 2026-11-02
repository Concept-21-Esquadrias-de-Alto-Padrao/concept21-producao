-- The bootstrap helper is intended for an administrative SQL session only.
-- Authenticated and anonymous API clients must not be able to promote users.
begin;

revoke execute on function public.promote_user_to_master(text)
  from public, anon, authenticated;

commit;
