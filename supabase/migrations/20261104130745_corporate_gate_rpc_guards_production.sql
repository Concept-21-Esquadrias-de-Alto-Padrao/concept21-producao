begin;
create function corporate_gate_private.reject_revoked_write()
returns trigger language plpgsql security definer
set search_path = ''
as $$
begin
  if not corporate_gate_private.is_allowed() then
    raise exception 'Vínculo corporativo revogado.' using errcode = '42501';
  end if;
  if TG_OP = 'DELETE' then return OLD; end if;
  return NEW;
end;
$$;
revoke all on function corporate_gate_private.reject_revoked_write() from public, anon, authenticated;

-- These tables are written by callable SECURITY DEFINER functions, which
-- bypass their RLS policies. A row trigger checks the original JWT subject.
create trigger corporate_gate_prod_write
before insert or update or delete on public.production_prods
for each row execute function corporate_gate_private.reject_revoked_write();
create trigger corporate_gate_notification_write
before insert or update or delete on public.platform_notifications
for each row execute function corporate_gate_private.reject_revoked_write();
create trigger corporate_gate_review_write
before insert or update or delete on public.access_review_requests
for each row execute function corporate_gate_private.reject_revoked_write();
commit;
