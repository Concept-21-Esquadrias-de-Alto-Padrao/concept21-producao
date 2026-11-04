-- Use only for reverting the homologation pilot after verifying gate status.
begin;
do $$
declare target record;
begin
  for target in
    select n.nspname, c.relname
    from pg_policy p
    join pg_class c on c.oid = p.polrelid
    join pg_namespace n on n.oid = c.relnamespace
    where p.polname = 'corporate_link_required'
      and (n.nspname = 'public' or (n.nspname = 'storage' and c.relname = 'objects'))
  loop
    execute format('drop policy corporate_link_required on %I.%I', target.nspname, target.relname);
  end loop;
end $$;
drop function if exists corporate_gate_private.is_allowed();
drop table if exists public.corporate_gate_subjects;
drop schema if exists corporate_gate_private;
commit;
