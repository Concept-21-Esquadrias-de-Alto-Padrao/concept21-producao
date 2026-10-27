// Ephemeral PostgreSQL with synthetic contracts. No production connection.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

const db = new PGlite();
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const company = id(1), actor = id(2), client = id(3), contract = id(4), prod = id(5);
const piece1 = id(6), piece2 = id(7), stage = id(8), row1 = id(9), row2 = id(10);
const migration = name => readFile(new URL(`../supabase/migrations/${name}`, import.meta.url), 'utf8');

try {
  await db.exec(`
    create role anon; create role authenticated; create role service_role bypassrls;
    create function public.current_company_id() returns uuid language sql as $$ select '${company}'::uuid $$;
    create function public.production_lifecycle_is_admin() returns boolean language sql as $$ select true $$;
    create function public.has_permission(text) returns boolean language sql as $$ select false $$;
    create table public.companies(id uuid primary key);
    create table public.profiles(id uuid primary key, company_id uuid, status text, is_master boolean);
    create table public.roles(id uuid primary key, company_id uuid, active boolean, is_master_role boolean);
    create table public.user_roles(profile_id uuid, role_id uuid, company_id uuid);
    create table public.permissions(id uuid primary key, key text);
    create table public.role_permissions(role_id uuid, permission_id uuid, company_id uuid);
    create table public.clients(id uuid primary key, company_id uuid);
    create table public.production_contracts(
      id uuid primary key, company_id uuid, client_id uuid, street text, block text, lot text,
      sector text, full_address text, zip_code text, site_contact text, site_contact_phone text
    );
    create table public.production_contract_lifecycle(contract_id uuid primary key, archived_at timestamptz);
    create table public.production_prods(id uuid primary key, company_id uuid, contract_id uuid);
    create table public.production_prod_lifecycle(prod_id uuid primary key, archived_at timestamptz);
    create table public.production_stages(id uuid primary key, company_id uuid, sort_order integer);
    create table public.production_prod_pieces(id uuid primary key, company_id uuid, prod_id uuid, quantity integer);
    create table public.production_prod_piece_stages(
      id uuid primary key, company_id uuid, prod_id uuid, piece_id uuid, stage_id uuid, load_volume_count integer
    );
    create table public.production_piece_dispositions(piece_id uuid primary key, cancelled_at timestamptz);
    create table public.production_expedition_archives(piece_stage_id uuid, restored_at timestamptz);
    insert into public.companies(id) values('${company}');
    insert into public.profiles values('${actor}','${company}','active',true);
    insert into public.clients values('${client}','${company}');
    insert into public.production_contracts(id,company_id,client_id,street,block,lot,sector,full_address)
      values('${contract}','${company}','${client}','Rua SB','44','13','Portal do Sol',
             'Rua Rua SB, Quadra 44, Lote 13, Setor Portal do Sol');
    insert into public.production_prods values('${prod}','${company}','${contract}');
    insert into public.production_stages values('${stage}','${company}',9);
    insert into public.production_prod_pieces values('${piece1}','${company}','${prod}',1),('${piece2}','${company}','${prod}',1);
    insert into public.production_prod_piece_stages values
      ('${row1}','${company}','${prod}','${piece1}','${stage}',2),
      ('${row2}','${company}','${prod}','${piece2}','${stage}',3);
  `);
  await db.exec(await migration('20260715173000_contract_address_parts.sql'));
  await db.exec(await migration('20261023134500_contract_logradouro.sql'));
  const address = (await db.query(`select street,full_address from production_contracts where id='${contract}'`)).rows[0];
  assert.equal(address.street, 'Rua SB');
  assert.equal(address.full_address, 'Rua SB, Quadra 44, Lote 13, Setor Portal do Sol');
  assert.equal((await db.query("select build_contract_full_address('Avenida Brasil','1','2','Centro','') address")).rows[0].address,
    'Avenida Brasil, Quadra 1, Lote 2, Setor Centro');

  await db.exec(await migration('20261023135000_numbered_romaneios.sql'));
  const report1 = JSON.stringify({ rows: [{}], totalVolumes: 2, totalItems: 1 });
  const issue = (ids, report = report1, who = actor) => db.query(
    'select public.production_romaneio_issue($1,$2,$3,$4::jsonb) id',
    [who, prod, ids, report],
  );
  const first = (await issue([row1])).rows[0].id;
  const firstDoc = (await db.query('select number,report from production_romaneios where id=$1', [first])).rows[0];
  assert.match(firstDoc.number, /^ROM-\d{4}-000001$/);
  assert.equal(firstDoc.report.romaneioNumber, firstDoc.number);
  await assert.rejects(issue([row1]), /já constam de um romaneio/);
  await assert.rejects(issue([row2], report1), /Peças ou volumes mudaram/);
  const second = (await issue([row2], JSON.stringify({ rows: [{}], totalVolumes: 3, totalItems: 1 }))).rows[0].id;
  assert.match((await db.query('select number from production_romaneios where id=$1', [second])).rows[0].number, /^ROM-\d{4}-000002$/);
  await assert.rejects(issue([row1], report1, id(99)), /Perfil ativo obrigatório/);
  assert.equal((await db.query('select count(*)::int n from production_romaneio_items')).rows[0].n, 2);
  await db.exec(`alter table production_prod_lifecycle add column historical_recorded_at timestamptz;
    insert into production_prod_lifecycle(prod_id,historical_recorded_at) values('${prod}',now());
    insert into production_prod_pieces values('${id(11)}','${company}','${prod}',1);
    insert into production_prod_piece_stages values('${id(12)}','${company}','${prod}','${id(11)}','${stage}',1);`);
  const closureMigration = await migration('20261027150000_historical_production_closure.sql');
  const issueFunction = closureMigration.match(/create or replace function public\.production_romaneio_issue\([\s\S]*?end \$\$;/)?.[0];
  assert(issueFunction);
  await db.exec(issueFunction);
  await assert.rejects(issue([id(12)], JSON.stringify({ rows: [{}], totalVolumes: 1, totalItems: 1 })), /historicamente/);
  console.log('PASS: logradouro antigo corrigido; duas emissões sequenciais e estáveis; duplicidade, dados divergentes e ator inválido rejeitados.');
} finally {
  await db.close();
}
