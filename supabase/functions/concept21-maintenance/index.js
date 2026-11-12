import { createClient } from "npm:@supabase/supabase-js@2.110.3";
const MODULE = "production";
const PORTAL = "https://concept21-portal.vercel.app";
const json = (body, status=200) => new Response(JSON.stringify(body), {status,headers:{"Content-Type":"application/json","Cache-Control":"no-store"}});
const url = Deno.env.get("SUPABASE_URL");
// These runtime-owned secrets never leave the function and are never logged.
const admin = createClient(url,Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),{auth:{persistSession:false,autoRefreshToken:false}});
async function publicStatus(){
 const {data,error}=await admin.rpc("platform_maintenance_status");
 if(error||!data)throw new Error("status unavailable");
 return {enabled:data.enabled===true,globalEnabled:data.globalEnabled===true,moduleEnabled:data.moduleEnabled===true,legacyEnabled:data.legacyEnabled===true,message:data.message};
}
Deno.serve(async request=>{
 try{
  if(request.method==="GET")return json({moduleKey:MODULE,...await publicStatus()});
  if(request.method!=="POST")return json({error:"Método inválido."},405);
  const authorization=request.headers.get("authorization")??"";
  if(!/^Bearer [A-Za-z0-9._~-]+$/.test(authorization))return json({error:"Acesso restrito."},401);
  const body=await request.json().catch(()=>null);
  if(body?.action==="access"){
   const token=authorization.slice(7);
   const {data:{user},error}=await admin.auth.getUser(token);
   if(error||!user?.email_confirmed_at)return json({canAccess:false,admin:false},403);
   const native=createClient(url,Deno.env.get("SUPABASE_ANON_KEY"),{auth:{persistSession:false,autoRefreshToken:false},global:{headers:{Authorization:authorization}}});
   const status=await native.rpc("platform_maintenance_status");
   if(status.error||!status.data)return json({error:"Verificação indisponível."},503);
   return json({canAccess:status.data.canAccess===true,admin:status.data.admin===true});
  }
  if(typeof body?.operationId!=="string")return json({error:"Comando inválido."},400);
  const auth=await fetch(PORTAL+"/api/internal/maintenance/authorize",{method:"POST",headers:{Authorization:authorization,"Content-Type":"application/json"},body:JSON.stringify({operationId:body.operationId,moduleKey:MODULE}),signal:AbortSignal.timeout(10000)});
  if(!auth.ok)return json({error:"Comando não autorizado."},auth.status===401||auth.status===403?403:503);
  const command=await auth.json();
  if(command.moduleKey!==MODULE||command.actor===undefined||!Number.isSafeInteger(command.version)||command.version<=0||typeof command.enabled!=="boolean"||!["global","module"].includes(command.scope)||typeof command.message!=="string")return json({error:"Comando inválido."},403);
  const {data,error}=await admin.rpc("platform_maintenance_apply",{p_scope:command.scope,p_enabled:command.enabled,p_version:command.version,p_actor:command.actor,p_message:command.message});
  if(error||!data||data.stale)return json({error:"Não foi possível aplicar este comando."},409);
  return json({ok:true,moduleKey:MODULE,version:command.version,...await publicStatus()});
 }catch{return json({error:"Controle de manutenção temporariamente indisponível."},503);}
});
