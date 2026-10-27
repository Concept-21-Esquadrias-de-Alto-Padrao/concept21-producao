// Ephemeral PostgreSQL WASM, synthetic records only. No credentials/network.
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
const db = new PGlite();
const checks = [];
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const company=id(1), actor=id(2), client=id(3), contract=id(4), prod=id(5), piece=id(6), otherCompany=id(7), otherActor=id(8);
const q = async sql => (await db.query(sql)).rows;
const one = async sql => (await q(sql))[0];
const ok = (name) => checks.push(name);
async function reject(sql, pattern) { await assert.rejects(db.exec(sql),e => pattern.test(e.message)); }
async function command(name,entity=prod,ids=[],reason='Motivo de teste',reference='ROM-001',who=actor) {
 return db.query('select public.production_lifecycle_command($1,$2,$3,$4,$5,$6)',[who,entity,name,reason,ids,reference]);
}
async function makeProd(n) {
 const p=id(n),x=id(n+1);
 await db.exec(`insert into production_prods(id,company_id,contract_id,prod_number) values('${p}','${company}','${contract}',${n});
 insert into production_prod_pieces(id,company_id,prod_id,piece_code,quantity,released_to_production) values('${x}','${company}','${p}','P-${n}',2,true);`);
 for(let stage=5;stage<=9;stage++) await db.exec(`insert into production_prod_piece_stages(company_id,prod_id,piece_id,stage_id,status,completed_at,load_volume_count) values('${company}','${p}','${x}','${id(100+stage)}','aguardando',null,0) on conflict(company_id,piece_id,stage_id) do nothing`);
 return [p,x];
}
async function finish(x) {await db.exec(`update production_prod_piece_stages set status='concluida',completed_at='2026-10-20T12:00:00Z',load_volume_count=2 where piece_id='${x}'`);}
try {
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key,email_confirmed_at timestamptz);
 create function auth.uid() returns uuid language sql as $$ select nullif(current_setting('test.uid',true),'')::uuid $$;
 create function public.current_company_id() returns uuid language sql as $$ select nullif(current_setting('test.company',true),'')::uuid $$;
 create function public.is_master() returns boolean language sql as $$ select coalesce(current_setting('test.master',true),'false')='true' $$;
 create function public.has_permission(text) returns boolean language sql as $$ select coalesce(current_setting('test.read',true),'false')='true' $$;
 grant usage on schema public,auth to authenticated,anon,service_role;`);
 // Original table definitions (constraints/defaults/FKs retained). Auth/RLS helpers are isolated stubs.
 const files = await readdir(new URL('../supabase/migrations/',import.meta.url));
 const definitions=new Map();
 for(const file of files.sort()) {
  const sql=await readFile(new URL('../supabase/migrations/'+file,import.meta.url),'utf8');
  for(const match of sql.matchAll(/create table (?:if not exists )?public\.(\w+)\s*\([\s\S]*?\n\);/g)) if(!definitions.has(match[1])) definitions.set(match[1],match[0]);
 }
 const tables=['companies','departments','profiles','roles','permissions','role_permissions','user_roles','clients','production_contracts','production_stages','production_prods','production_prod_stages','production_material_groups','production_prod_materials','production_document_checklist_items','production_prod_document_checks','production_selectable_items','production_prod_selected_items','production_shipping_records','production_piece_imports','production_prod_pieces','production_prod_piece_stages','production_rework_reasons','production_piece_reworks','production_operators','production_stage_time_entries','production_pointing_sessions','audit_logs'];
 for(const t of tables) {assert(definitions.has(t),t);await db.exec(definitions.get(t));}
 await db.exec(`alter table production_prods add column pieces_count integer default 0, add column pieces_area_m2 numeric default 0, add column pieces_weight_kg numeric default 0;
 alter table production_prod_pieces add column released_to_production boolean not null default false;
 alter table production_prod_piece_stages add column load_volume_count integer not null default 0;
 create table production_expedition_archives(id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),piece_stage_id uuid unique not null references production_prod_piece_stages(id),archived_at timestamptz default now(),restored_at timestamptz,reason text);
 grant all on all tables in schema public to service_role;
 insert into companies(id,name,slug) values('${company}','Fictícia A','a'),('${otherCompany}','Fictícia B','b');
 insert into profiles(id,company_id,name,email,is_master) values('${actor}','${company}','Administrador fictício','a@example.invalid',true),('${otherActor}','${otherCompany}','Outro administrador','b@example.invalid',true);
 insert into clients(id,company_id,name) values('${client}','${company}','Cliente fictício');
 insert into production_contracts(id,company_id,client_id,contract_number,work_name,full_address,city,state) values('${contract}','${company}','${client}','TEST-1','Teste','Rua fictícia','Goiânia','GO');
 insert into production_prods(id,company_id,contract_id,prod_number,status,actual_end_date) values('${prod}','${company}','${contract}',1,'concluida','2020-01-01');`);
 for(let n=5;n<=9;n++) await db.exec(`insert into production_stages(id,company_id,name,sort_order) values('${id(100+n)}','${company}','Etapa ${n}',${n})`);
 await db.exec(await readFile(new URL('./fixtures/production-source-triggers.sql',import.meta.url),'utf8'));
 const before=await one(`select to_jsonb(p) v from production_prods p where id='${prod}'`);
 await db.exec(await readFile(new URL('../supabase/migrations/20261021173007_production_lifecycle.sql',import.meta.url),'utf8'));
 assert.deepEqual(await one(`select to_jsonb(p) v from production_prods p where id='${prod}'`),before);
 assert.equal((await one(`select count(*)::int n from production_prod_lifecycle where completed_at is not null`)).n,0);ok('Legacy data unchanged and not admitted as official completion');
 await db.exec('set role service_role');
 await assert.rejects(command('close_contract',contract),/Técnico/);ok('Cannot close contract without technical scope');
 await reject(`update production_prods set status='planejamento' where id='${prod}'; update production_prods set status='concluida' where id='${prod}'`,/calculados/);ok('Direct manual completion rejected');
 await reject(`delete from production_prods where id='${prod}'`,/Preserve/);ok('Deletion cannot shrink scope');
 await db.exec(`insert into production_prod_pieces(id,company_id,prod_id,piece_code,quantity,released_to_production) values('${piece}','${company}','${prod}','P1',3,true)`);
 await assert.rejects(command('dispatch',prod,[piece]),/sem fabricação/);ok('Missing stages cannot pass dispatch');
 for(let n=5;n<=9;n++) await db.exec(`insert into production_prod_piece_stages(company_id,prod_id,piece_id,stage_id,status,completed_at,load_volume_count) values('${company}','${prod}','${piece}','${id(100+n)}','concluida','2026-10-20T12:00:00Z',2) on conflict(company_id,piece_id,stage_id) do update set status=excluded.status,completed_at=excluded.completed_at,load_volume_count=excluded.load_volume_count`);
 assert.equal((await one(`select state from production_prod_lifecycle where prod_id='${prod}'`)).state,'em_andamento');ok('Completed load alone does not conclude PROD');
 await assert.rejects(command('dispatch',prod,[piece],'Motivo','ROM',otherActor),/não encontrado/);ok('Cross-company command denied');
 await db.exec(`insert into production_expedition_archives(company_id,piece_stage_id,reason) select '${company}',id,'Antigo' from production_prod_piece_stages where piece_id='${piece}' and stage_id='${id(105)}'`);
 await assert.rejects(command('dispatch',prod,[piece]),/sem fabricação/);ok('Archived manufacturing stage blocks official completion');
 await db.exec(`update production_expedition_archives set restored_at=now()`);
 await command('dispatch',prod,[piece]);
 assert.equal((await one(`select state from production_prod_lifecycle where prod_id='${prod}'`)).state,'concluida');ok('Manufactured and physically dispatched PROD completes automatically');
 await assert.rejects(command('dispatch',prod,[piece]),/já registrada/);ok('Duplicate dispatch rejected');
 await db.exec(`update production_prod_pieces set released_to_production=false where id='${piece}'`);
 await assert.rejects(command('confirm_scope',contract),/não liberadas/);ok('Technical scope cannot certify an unreleased piece');
 await db.exec(`update production_prod_pieces set released_to_production=true where id='${piece}'`);
 await command('dispatch',prod,[piece]);
 await command('confirm_scope',contract);
 await command('close_contract',contract);
 assert((await one(`select completed_at from production_contract_lifecycle where contract_id='${contract}'`)).completed_at);ok('Technical confirmation and authorized contract close');
 await command('return_dispatch',prod,[piece]);
 assert.equal((await one(`select state from production_prod_lifecycle where prod_id='${prod}'`)).state,'em_andamento');
 assert.equal((await one(`select completed_at from production_contract_lifecycle where contract_id='${contract}'`)).completed_at,null);ok('Return reopens PROD and contract and preserves original events');
 await command('dispatch',prod,[piece]);
 await command('close_contract',contract);
 const [p2,x2]=await makeProd(20);
 assert.equal((await one(`select scope_confirmed_at from production_contract_lifecycle where contract_id='${contract}'`)).scope_confirmed_at,null);ok('New PROD invalidates technical sign-off and reopens contract');
 await command('archive_prod',p2,[]);
 await reject(`update production_prod_piece_stages set status='concluida' where piece_id='${x2}'`,/arquivado/);
 await assert.rejects(command('confirm_scope',contract),/arquivados/);ok('Archived PROD cannot mutate or disappear from closure checks');
 await command('restore_prod',p2);
 assert.equal((await one(`select state from production_prod_lifecycle where prod_id='${p2}'`)).state,'em_andamento');ok('Restore does not invent completion');
 await command('cancel_pieces',p2,[x2]);
 assert.equal((await one(`select state from production_prod_lifecycle where prod_id='${p2}'`)).state,'cancelada');ok('Fully cancelled PROD is cancelled, not completed');
 await command('restore_pieces',p2,[x2]);
 await finish(x2);
 await db.exec(`insert into production_prod_pieces(id,company_id,prod_id,piece_code,quantity,released_to_production) values('${id(22)}','${company}','${p2}','P-extra',1,true)`);
 await command('dispatch',p2,[x2]);
 assert.equal((await one(`select expedition_state from production_prod_lifecycle where prod_id='${p2}'`)).expedition_state,'parcial');ok('Partial dispatch remains open');
 await command('cancel_pieces',p2,[id(22)]);
 assert.equal((await one(`select state from production_prod_lifecycle where prod_id='${p2}'`)).state,'concluida');ok('Formal cancellation excludes quantity without counting it produced');
 await db.exec(`insert into production_piece_reworks(company_id,prod_id,piece_id,status) values('${company}','${p2}','${x2}','registrado')`);
 assert.equal((await one(`select state from production_prod_lifecycle where prod_id='${p2}'`)).state,'em_andamento');
 assert((await one(`select voided_at from production_piece_dispatches where piece_id='${x2}'`)).voided_at);ok('Rework invalidates previous departure and reopens');
 await assert.rejects(command('archive_prod',p2),/pendências/);ok('Unresolved real rework cannot be hidden in archives');
 await assert.rejects(command('dispatch',p2,[x2]),/impedimento/);
 await db.exec(`update production_piece_reworks set status='concluido' where prod_id='${p2}'`);
 assert.equal((await one(`select state from production_prod_lifecycle where prod_id='${p2}'`)).state,'em_andamento');ok('Resolving rework still requires new physical dispatch');
 await command('dispatch',p2,[x2]);
 await db.exec(`insert into production_piece_reworks(company_id,prod_id,piece_id,status) values('${company}','${p2}','${x2}','concluido')`);
 assert.equal((await one(`select state from production_prod_lifecycle where prod_id='${p2}'`)).state,'concluida');ok('Recording terminal rework does not invent a return');
 // Losing execution evidence must invalidate an existing departure even when the
 // stage's status text stays terminal. Restoring evidence is not a new departure.
 for (const [label,stage,mutation] of [
  ['Expedition completion date removed',9,'completed_at=null'],
  ['Load volumes cleared',9,'load_volume_count=0'],
  ['Expedition changed to not applicable',9,"status='nao_aplicavel'"],
  ['Manufacturing completion date removed',5,'completed_at=null'],
 ]) {
  await db.exec(`update production_prod_piece_stages set ${mutation} where piece_id='${x2}' and stage_id='${id(100+stage)}'`);
  assert.equal((await one(`select state from production_prod_lifecycle where prod_id='${p2}'`)).state,'em_andamento',label);
  assert.equal((await one(`select count(*)::int n from production_piece_dispatches where piece_id='${x2}' and voided_at is null`)).n,0,label);
  await finish(x2);
  assert.equal((await one(`select state from production_prod_lifecycle where prod_id='${p2}'`)).state,'em_andamento','Restoring evidence must not recreate departure');
  await command('dispatch',p2,[x2]);
  ok(label+' reopens and requires a new physical dispatch');
 }
 await db.exec(`insert into production_stages(id,company_id,name,sort_order) values('${id(111)}','${company}','Outra etapa fictícia',11)`);
 await reject(`update production_prod_piece_stages set stage_id='${id(111)}' where piece_id='${x2}' and stage_id='${id(105)}'`,/escopos/);ok('A recorded piece stage cannot be reassigned to another stage');
 await db.exec(`update production_prod_pieces set quantity=4 where id='${x2}'`);
 assert.equal((await one(`select state from production_prod_lifecycle where prod_id='${p2}'`)).state,'em_andamento');ok('Quantity change invalidates old departure');
 const [p3,x3]=await makeProd(40);
 await finish(x3);
 await db.exec(`insert into production_prod_pieces(id,company_id,prod_id,piece_code,quantity,released_to_production) values('${id(42)}','${company}','${p3}','Ainda incompleta',1,true)`);
 await assert.rejects(command('dispatch',p3,[x3,id(42)]),/sem fabricação/);
 assert.equal((await one(`select count(*)::int n from production_piece_dispatches where prod_id='${p3}'`)).n,0);ok('Mixed batch dispatch rolls back atomically');
 await db.exec(`update production_prod_piece_stages set status='em_andamento' where piece_id='${id(42)}' and stage_id='${id(105)}'`);
 await assert.rejects(command('archive_prod',p3),/apontamentos ativos/);ok('Running timer blocks archive');
 await reject(`delete from production_prod_pieces where id='${id(42)}'`,/Preserve/);ok('Deleting incomplete piece cannot complete the remainder');
 await db.exec(`update production_prod_piece_stages set status='aguardando' where piece_id='${id(42)}' and stage_id='${id(105)}'`);
 await command('archive_prod',p3);
 await reject(`insert into production_piece_imports(company_id,prod_id,file_name) values('${company}','${p3}','bloqueado.pdf')`,/arquivado/);ok('Archive rejects import before any partial record is created');
 await reject(`insert into production_pointing_sessions(company_id,prod_ids,stage_id,operator_id,action) values('${company}',array['${p3}']::uuid[],'${id(105)}','${id(999)}','iniciar')`,/arquivada/);ok('Stale pointing cannot create a session for an archived PROD');
 await reject(`update production_stages set sort_order=15 where id='${id(105)}'`,/identidade/);ok('Stage identity cannot be reassigned to falsify manufacture');
 await reject(`update production_lifecycle_events set reason='forjado'`,/imutáveis/);ok('Lifecycle event ledger cannot be rewritten');
 await db.exec('reset role');
 const ordinary=id(30);
 await db.exec(`insert into profiles(id,company_id,name,email) values('${ordinary}','${company}','Leitor fictício','reader@example.invalid')`);
 await db.exec('set role service_role');
 await assert.rejects(command('confirm_scope',contract,[],'Tentativa','ROM',ordinary),/Sem permissão/);ok('Ordinary user denied even via server RPC actor check');
 await db.exec(`reset role;
 alter table production_prods enable row level security;
 grant select on production_prods to authenticated;
 create policy original_read on production_prods for select to authenticated using(company_id=public.current_company_id());
 set role authenticated; set test.company='${company}'; set test.read='true';`);
 assert((await q('select * from production_prod_lifecycle')).length>0);ok('Authorized same-company lifecycle read');
 assert.equal((await q(`select * from production_prods where id='${p3}'`)).length,0);ok('Archived PROD is hidden by RLS from ordinary readers');
 assert.equal((await q(`select * from production_prod_lifecycle where prod_id='${p3}'`)).length,0);
 assert.equal((await q(`select * from production_lifecycle_events where prod_id='${p3}'`)).length,0);ok('Archived summary and event history are also administrator-only');
 await db.exec("set test.master='true'");
 assert.equal((await q(`select * from production_prods where id='${p3}'`)).length,1);ok('Administrator retains archive consultation');
 await db.exec("set test.master='false'");
 await reject(`select production_lifecycle_command('${actor}','${prod}','archive_prod','forjado','{}',null)`,/permission denied/);ok('Authenticated cannot call privileged RPC directly');
 await reject(`update production_prod_lifecycle set state='concluida'`,/permission denied/);ok('Direct lifecycle mutation denied');
 await db.exec(`set test.company='${otherCompany}'`);
 assert.equal((await q('select * from production_prod_lifecycle')).length,0);ok('Lifecycle reads isolate companies');
 await db.exec('reset role; set role anon');
 await reject('select * from production_piece_dispatches',/permission denied/);ok('Anonymous history access denied');
 await db.exec('reset role');
 const completedEvents=(await one(`select count(*)::int n from production_lifecycle_events where event='prod_concluida'`)).n;
 assert(completedEvents>=3);ok('Completion/reopening history retained across cycles');
 // Regression: archive visibility must be computed once per statement, while
 // preserving the old predicates for every existing contract/PROD.
 await db.exec(await readFile(new URL('../supabase/migrations/20261022131052_optimize_lifecycle_archive_reads.sql',import.meta.url),'utf8'));
 await db.exec(`set test.uid='${actor}'; set test.company='${company}'; set test.read='true'; set test.master='false';`);
 for (const master of [false,true]) {
  await db.exec(`set test.master='${master}'`);
  assert.deepEqual(await q('select id from production_prods where production_lifecycle_private.prod_visible(id) order by id'),
   await q('select id from production_prods where id in (select production_lifecycle_private.visible_prod_ids()) order by id'));
  assert.deepEqual(await q('select id from production_contracts where production_lifecycle_private.contract_visible(id) order by id'),
   await q('select id from production_contracts where id in (select production_lifecycle_private.visible_contract_ids()) order by id'));
  ok(`Set-based archive predicates equal original predicates for ${master?'administrator':'ordinary user'}`);
 }
 await db.exec(`set test.master='false'; set role authenticated`);
 assert.equal((await q(`select id from production_prods where id='${p3}'`)).length,0);
 assert.equal((await q(`select prod_id from production_prod_lifecycle where prod_id='${p3}'`)).length,0);
 assert.equal((await q(`select id from production_lifecycle_events where prod_id='${p3}'`)).length,0);
 ok('Optimized policies still hide archived records, summaries and events');
 assert((await q('select prod_id from production_prod_lifecycle')).length>0);ok('Optimized policies retain authorized current work');
 const plan=(await one('explain (analyze,verbose,format json) select prod_id from production_prod_lifecycle'))['QUERY PLAN'];
 const nodes=[]; const visit=n=>{nodes.push(n);for(const child of n.Plans??[])visit(child)};visit(plan[0].Plan);
 const scans=nodes.filter(n=>n['Node Type']==='ProjectSet' && n.Output?.some(output=>output.includes('visible_prod_ids()')));
 assert.equal(scans.length,1);assert.equal(scans[0]['Actual Loops'],1);
 ok('Archive visibility scope executes once per statement, not once per row');
 await db.exec(`set test.master='true'`);
 assert.equal((await q(`select id from production_prods where id='${p3}'`)).length,1);ok('Optimized administrator archive consultation retained');
 await db.exec(`reset role; set test.master='false'; update production_contract_lifecycle set archived_at=now() where contract_id='${contract}'; set role authenticated`);
 assert.equal((await q('select * from production_lifecycle_private.visible_prod_ids()')).length,0);
 assert.equal((await q('select * from production_lifecycle_private.visible_contract_ids()')).length,0);
 ok('Archived contract hides every child scope from ordinary users');
 await db.exec(`reset role; update production_contract_lifecycle set archived_at=null where contract_id='${contract}'; set test.master='true'; set role authenticated`);
 await db.exec(`set test.company='${otherCompany}'`);
 assert.equal((await q('select * from production_lifecycle_private.visible_prod_ids()')).length,0);
 assert.equal((await q('select * from production_prod_lifecycle')).length,0);ok('Optimized administrator access remains company-bound');
 await db.exec(`set test.company='${company}'; set test.uid=''`);
 assert.equal((await q('select * from production_lifecycle_private.visible_prod_ids()')).length,0);
 assert.equal((await q('select * from production_lifecycle_private.visible_contract_ids()')).length,0);ok('Missing identity cannot obtain a visible scope');
 await db.exec('reset role; set role anon');
 await reject('select * from production_lifecycle_private.visible_prod_ids()',/permission denied/);ok('Anonymous users cannot invoke private scope helpers');
 await db.exec('reset role');
 await db.exec(await readFile(new URL('../supabase/migrations/20261023110041_contract_scope_revisions.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261023183000_confirm_existing_contract_scope.sql',import.meta.url),'utf8'));
 await db.exec(await readFile(new URL('../supabase/migrations/20261023194500_scope_without_server_path.sql',import.meta.url),'utf8'));
 const scopeContract=id(201),scopeProd=id(202),scopeImport=id(203),scopePiece=id(204);
 await db.exec(`insert into production_contracts(id,company_id,client_id,contract_number,work_name,full_address,city,state)
 values('${scopeContract}','${company}','${client}','TEST-2','Obra fictícia','Rua fictícia','Goiânia','GO');
 insert into production_prods(id,company_id,contract_id,prod_number) values('${scopeProd}','${company}','${scopeContract}',1);
 insert into production_piece_imports(id,company_id,prod_id,file_name) values('${scopeImport}','${company}','${scopeProd}','itens.pdf');`);
 await db.exec('set role service_role');
 const register=async(kind,items)=>db.query('select public.production_contract_scope_register($1,$2,$3,$4,$5,$6::jsonb) n',
   [actor,scopeContract,kind,'X:/Contratos/TEST-2/Desenho.pdf','01',JSON.stringify(items)]);
 await assert.rejects(command('confirm_scope',scopeContract),/Lista integral vigente/);
 ok('Legacy manual confirmation cannot bypass missing contract baseline');
 await assert.rejects(db.query('select public.production_contract_scope_register($1,$2,$3,$4,$5,$6::jsonb)',
   [otherActor,scopeContract,'tecnico_integral','X:/Contratos/TEST-2/Desenho.pdf','01',JSON.stringify([{code:'J01',quantity:1}])]),/empresa/);
 ok('Cross-company baseline registration denied');
 assert.equal((await register('proposta',[{code:'J01',quantity:1}])).rows[0].n,1);
 assert.equal((await one(`select count(*)::int n from production_contract_lifecycle where contract_id='${scopeContract}' and scope_confirmed_at is not null`)).n,0);
 assert.equal((await register('tecnico_integral',[{code:'J01',quantity:1}])).rows[0].n,2);
 await db.exec(`insert into production_prod_pieces(id,company_id,prod_id,piece_code,quantity,released_to_production,import_batch_id)
 values('${scopePiece}','${company}','${scopeProd}','J01',1,true,'${scopeImport}')`);
 assert((await one(`select scope_confirmed_at from production_contract_lifecycle where contract_id='${scopeContract}'`)).scope_confirmed_at);
 ok('Current complete Technical list automatically reconciles imported PROD items');
 await db.exec(`update production_prod_pieces set quantity=2 where id='${scopePiece}'`);
 assert.equal((await one(`select scope_confirmed_at from production_contract_lifecycle where contract_id='${scopeContract}'`)).scope_confirmed_at,null);
 ok('Quantity mismatch reopens technical scope');
 await db.exec(`update production_prod_pieces set quantity=1 where id='${scopePiece}'`);
 assert((await one(`select scope_confirmed_at from production_contract_lifecycle where contract_id='${scopeContract}'`)).scope_confirmed_at);
 await register('tecnico_integral',[{code:'J01',quantity:1},{code:'J02',quantity:1}]);
 assert.equal((await one(`select scope_confirmed_at from production_contract_lifecycle where contract_id='${scopeContract}'`)).scope_confirmed_at,null);
 ok('New integral revision with missing item invalidates prior reconciliation');
 const existingContract=id(301), existingProd=id(302), existingImport=id(303);
 await db.exec(`insert into production_contracts(id,company_id,client_id,contract_number,work_name,full_address,city,state)
 values('${existingContract}','${company}','${client}','TEST-3','Obra conferida','Rua fictícia','Goiânia','GO');
 insert into production_prods(id,company_id,contract_id,prod_number) values('${existingProd}','${company}','${existingContract}',1);
 insert into production_piece_imports(id,company_id,prod_id,file_name) values('${existingImport}','${company}','${existingProd}','itens.pdf');
 insert into production_prod_pieces(id,company_id,prod_id,piece_code,quantity,released_to_production,import_batch_id)
 values ('${id(304)}','${company}','${existingProd}','J01',1,true,'${existingImport}'),
 ('${id(305)}','${company}','${existingProd}','J02',1,true,'${existingImport}'),
 ('${id(306)}','${company}','${existingProd}','P06',1,true,'${existingImport}'),
 ('${id(307)}','${company}','${existingProd}','P07',1,true,'${existingImport}');`);
 const proposalItems=[{code:'J01',quantity:1},{code:'J02',quantity:1},{code:'P06',quantity:1},{code:'P07',quantity:1}];
 await db.query('select public.production_contract_scope_register($1,$2,$3,$4,$5,$6::jsonb)',
   [actor,existingContract,'proposta','X:/Contratos/TEST-3/Desenho.pdf','01',JSON.stringify(proposalItems)]);
 const existingRevision=(await one(`select id from production_contract_scope_revisions where contract_id='${existingContract}'`)).id;
 const confirm=(who=actor,expected=existingRevision)=>db.query(
   'select public.production_contract_scope_confirm_existing($1,$2,$3,$4,$5) n',
   [who,existingContract,expected,null,'02']);
 assert.equal((await one(`select count(*)::int n from production_contract_lifecycle where contract_id='${existingContract}' and scope_confirmed_at is not null`)).n,0);
 await assert.rejects(confirm(actor,id(399)),/lista do contrato mudou/);
 await assert.rejects(confirm(otherActor),/lista do contrato mudou/);
 await db.exec(`update production_prod_pieces set released_to_production=false where id='${id(304)}'`);
 await assert.rejects(confirm(),/ainda não coincidem integralmente/);
 assert.equal((await one(`select count(*)::int n from production_contract_scope_revisions where contract_id='${existingContract}'`)).n,1);
 await db.exec(`update production_prod_pieces set released_to_production=true where id='${id(304)}'`);
 assert.equal((await confirm()).rows[0].n,2);
 const promoted=await one(`select source_kind,source_reference,items from production_contract_scope_revisions where contract_id='${existingContract}' order by revision_number desc limit 1`);
 assert.equal(promoted.source_kind,'tecnico_integral');
 assert.equal(promoted.source_reference,'Itens previamente lidos na revisão 1');
 assert.deepEqual(promoted.items,proposalItems);
 assert((await one(`select scope_confirmed_at from production_contract_lifecycle where contract_id='${existingContract}'`)).scope_confirmed_at);
 await assert.rejects(confirm(),/lista do contrato mudou/);
 ok('Existing four-piece proposal is attested once, atomically reconciled and protected from stale or divergent data');
 await db.exec('reset role');
 await db.exec(await readFile(new URL('../supabase/migrations/20261027150000_historical_production_closure.sql',import.meta.url),'utf8'));
 const historicalContract=id(401), historicalProd=id(402), historicalPiece=id(403), historicalNewProd=id(404);
 await db.exec(`insert into production_contracts(id,company_id,client_id,contract_number,work_name,full_address,city,state)
 values('${historicalContract}','${company}','${client}','OLD-1','Obra antiga','Rua fictícia','Goiânia','GO');
 insert into production_prods(id,company_id,contract_id,prod_number) values('${historicalProd}','${company}','${historicalContract}',1);
 insert into production_prod_pieces(id,company_id,prod_id,piece_code,quantity,released_to_production)
 values('${historicalPiece}','${company}','${historicalProd}','P1',1,true);
 insert into production_contract_lifecycle(contract_id,company_id) values('${historicalContract}','${company}') on conflict do nothing;
 update production_prod_lifecycle set historical_recorded_at=now(),historical_reviewed_on='2026-10-27',historical_declared_by='Gestor fictício',historical_statement='Concluída e entregue, revisão histórica.' where prod_id='${historicalProd}';
 update production_contract_lifecycle set historical_recorded_at=now(),historical_reviewed_on='2026-10-27',historical_declared_by='Gestor fictício',historical_statement='Concluída e entregue, revisão histórica.' where contract_id='${historicalContract}';`);
 assert.equal((await one(`select state,completed_at from production_prod_lifecycle where prod_id='${historicalProd}'`)).completed_at,null);
 await reject(`update production_prod_pieces set quantity=2 where id='${historicalPiece}'`,/histórica/);
 await db.exec('set role service_role');
 await assert.rejects(command('archive_prod',historicalProd),/histórica/);
 await reject(`insert into production_pointing_sessions(company_id,prod_ids,stage_id,operator_id,action) values('${company}',array['${historicalProd}']::uuid[],'${id(105)}','${id(999)}','iniciar')`,/historicamente/);
 await assert.rejects(db.query('select production_reopen_historical_prod($1,$2,$3)',[otherActor,historicalProd,'Nova peça']),/não encontrada|sem conclusão|Administrador|empresa/);
 ok('Historical completion stays distinct from physical dispatch and blocks edits/archives');
 await db.exec(`insert into production_prods(id,company_id,contract_id,prod_number) values('${historicalNewProd}','${company}','${historicalContract}',2)`);
 assert.equal((await one(`select historical_recorded_at from production_contract_lifecycle where contract_id='${historicalContract}'`)).historical_recorded_at,null);
 assert((await one(`select historical_recorded_at from production_prod_lifecycle where prod_id='${historicalProd}'`)).historical_recorded_at);
 ok('New PROD automatically reopens historical contract and retains old PROD history');
 await db.query('select production_reopen_historical_prod($1,$2,$3)',[actor,historicalProd,'Nova peça solicitada']);
 assert.equal((await one(`select historical_recorded_at from production_prod_lifecycle where prod_id='${historicalProd}'`)).historical_recorded_at,null);
 await db.exec(`update production_prod_pieces set quantity=2 where id='${historicalPiece}'`);
 ok('Master can reopen a historical PROD without inventing dispatch');
 await db.exec('reset role');
 const noProdContract=id(405),noProdNew=id(406);
 await db.exec(`insert into production_contracts(id,company_id,client_id,contract_number,work_name,full_address,city,state)
 values('${noProdContract}','${company}','${client}','OLD-2','Obra antiga sem PROD','Rua fictícia','Goiânia','GO');
 insert into production_contract_lifecycle(contract_id,company_id,historical_recorded_at,historical_reviewed_on,historical_declared_by,historical_statement)
 values('${noProdContract}','${company}',now(),'2026-10-27','Gestor fictício','Concluída e entregue, revisão histórica.');
 insert into production_prods(id,company_id,contract_id,prod_number) values('${noProdNew}','${company}','${noProdContract}',1);`);
 assert.equal((await one(`select historical_recorded_at from production_contract_lifecycle where contract_id='${noProdContract}'`)).historical_recorded_at,null);
 ok('Historical no-PROD contract reopens on first new PROD');
 console.log(`${checks.length} SQL scenarios passed:\n`+checks.map(c=>'PASS '+c).join('\n'));
} catch(error) { console.error("FAIL",error.message,error.code ?? "", error.where ?? ""); process.exitCode=1; } finally {await db.close();}
