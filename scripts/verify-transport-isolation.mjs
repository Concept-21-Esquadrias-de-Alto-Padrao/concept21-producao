// Runs only against an ephemeral PostgreSQL WASM database and synthetic rows.
// No project URL, service key, network connection or production data is used.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const tables = ['freights', 'freight_demands', 'freight_stops', 'freight_stop_prods', 'freight_route_helpers', 'logistics_recipients', 'logistics_drivers', 'logistics_vehicles', 'logistics_settings', 'extra_service_catalog', 'extra_service_requests'];
const db = new PGlite();
try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    grant usage on schema public to anon, authenticated, service_role;
    create table production_stages(id integer primary key, name text, required_permission text, active boolean);
    insert into production_stages values (9,'Expedicao','production.shipping.manage',true), (10,'Frete','production.freights.manage_route',true);
    create table production_prods(id integer primary key);
    create table production_prod_stages(prod_id integer,stage_id integer);
  `);
  for (const table of tables) {
    await db.exec(`
      create table ${table}(id integer primary key, notes text);
      alter table ${table} enable row level security;
      grant select,insert,update,delete on ${table} to anon,authenticated,service_role;
      create policy legacy_access on ${table} for all to anon,authenticated using(true) with check(true);
      insert into ${table} values(1,'preserved history');
    `);
  }
  await db.exec(`
    create function create_freight_demand_for_prod() returns trigger language plpgsql as $$
    begin insert into freight_demands values(new.id,'automatic demand'); return new; end $$;
    create trigger production_prods_create_freight_demand after insert on production_prods
      for each row execute function create_freight_demand_for_prod();
    create function initialize_prod_defaults() returns trigger language plpgsql as $$
    begin insert into production_prod_stages select new.id,id from production_stages where active; return new; end $$;
    create trigger production_prods_initialize_defaults after insert on production_prods
      for each row execute function initialize_prod_defaults();
  `);
  const migration = await readFile(new URL('../supabase/migrations/20261020202604_isolate_transport_module.sql', import.meta.url), 'utf8');
  await db.exec(migration);
  await db.exec(migration); // Idempotent, without deleting the original policies.
  await db.exec('insert into production_prods values(2)');
  assert.deepEqual((await db.query('select * from production_prod_stages')).rows, [{prod_id: 2, stage_id: 9}]);
  assert.equal((await db.query('select count(*)::int n from freight_demands')).rows[0].n, 1);
  for (const role of ['anon', 'authenticated']) {
    await db.exec(`set role ${role}`);
    for (const table of tables) {
      assert.deepEqual((await db.query(`select * from ${table}`)).rows, []);
      assert.equal((await db.query(`update ${table} set notes='changed' returning id`)).rows.length, 0);
      assert.equal((await db.query(`delete from ${table} returning id`)).rows.length, 0);
      await assert.rejects(db.exec(`insert into ${table} values(2,'forged')`), e => e.code === '42501');
    }
    await db.exec('reset role');
  }
  await db.exec('set role service_role');
  for (const table of tables) {
    assert.deepEqual((await db.query(`select * from ${table}`)).rows, [{id: 1, notes: 'preserved history'}]);
  }
  await db.exec('reset role');
  assert.equal((await db.query("select count(*)::int n from pg_policies where policyname='legacy_access'")).rows[0].n, 11);
  console.log('PASS: 11 tables retain history and original policies; anon/authenticated cannot read or mutate logistics; new PROD keeps expedition and creates no freight demand; migration is idempotent.');
} finally {
  await db.close();
}
