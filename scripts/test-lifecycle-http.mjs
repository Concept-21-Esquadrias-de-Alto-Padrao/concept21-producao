// Checks HTTP + server payload (including RSC); does not hydrate client session guards.
// Local demo only. Starts and stops its own server in the same network namespace.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
assert(!process.env.NEXT_PUBLIC_SUPABASE_URL, 'HTTP smoke test must run without a real Supabase environment');
const server=spawn(process.execPath,[require.resolve('next/dist/bin/next'),'start','--hostname','127.0.0.1','--port','3102'],{stdio:['ignore','pipe','pipe']});
let output='';
try {
 await new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>reject(new Error('Local server did not start')),15000);
  const onData=chunk=>{output+=chunk.toString();if(output.includes('Ready in')){clearTimeout(timer);resolve();}};
  server.stdout.on('data',onData);server.stderr.on('data',onData);
  server.on('exit',code=>{clearTimeout(timer);reject(new Error(`Local server exited ${code}: ${output.slice(-500)}`));});
 });
 const routes=[
  ['/prods','Em andamento'],['/prods?view=concluidos','Conclusão a partir de'],['/prods?view=cancelados','Cancelados'],
  ['/contracts','Contratos e obras'],['/contracts?view=concluidos','Conclusão a partir de'],['/archives','consulta administrativa'],
  ['/prods/prod-260064-2','ProdLifecyclePanel'],['/contracts/contract-260064','Escopo técnico'],
 ];
 for(const [path,text] of routes){const response=await fetch('http://127.0.0.1:3102'+path,{redirect:'manual'});const body=await response.text();assert.equal(response.status,200,path);assert(body.includes(text),path+' expected text absent');assert(!body.includes('NEXT_HTTP_ERROR_FALLBACK'),path+' render error');console.log('PASS HTTP 200 + server payload: '+path);}
 for(const path of ['/transport','/freights','/routes','/extra-services','/api/settings/logistics']){assert.equal((await fetch('http://127.0.0.1:3102'+path)).status,410,path);}
 console.log('PASS transport endpoints remain 410. Demo HTTP only; not browser/auth/database E2E.');
} catch(e){console.error('FAIL',e.message,output.slice(-4000));process.exitCode=1;} finally {server.kill('SIGTERM');}
