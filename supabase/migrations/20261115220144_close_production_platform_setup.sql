do $$begin if not exists(select 1 from public.platform_identity_config where key='central_login' and enabled and setup_claimed_at is not null) then raise exception 'Integration is not installed';end if;end$$;
update public.platform_identity_config set setup_expires_at=least(setup_expires_at,clock_timestamp()) where key='central_login';
