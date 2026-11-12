import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
const MODULE="production";
const ENDPOINT="https://loqmvdiegizwmpzjthhm.supabase.co/functions/v1/concept21-maintenance";
const PORTAL="https://concept21-portal.vercel.app";
export type PlatformMaintenanceStatus={enabled:boolean;globalEnabled:boolean;moduleEnabled:boolean;legacyEnabled:boolean;message:string;admin:boolean;canAccess:boolean;unavailable?:boolean};
const transitions=new Set(["/auth/portal-entry","/auth/complete","/auth/callback","/auth/confirm","/auth/portal-logout","/auth/logout"]);
export type MaintenanceCookie={name:string;value:string;options?:CookieOptions};
export async function platformMaintenanceStatus(request:NextRequest,onCookies?:(items:MaintenanceCookie[])=>void):Promise<PlatformMaintenanceStatus>{
 const result=await fetch(ENDPOINT,{cache:"no-store",signal:AbortSignal.timeout(7000)});
 if(!result.ok)throw new Error("Manutenção indisponível");
 const status=await result.json() as Omit<PlatformMaintenanceStatus,"admin"|"canAccess">;
 if(typeof status.enabled!=="boolean")throw new Error("Resposta inválida");
 if(!status.enabled)return {...status,admin:false,canAccess:true};
 let authorization=request.headers.get("authorization")??"";
 if(!/^Bearer [A-Za-z0-9._~-]+$/.test(authorization)){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY??process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(url&&key){
   const auth=createServerClient(url,key,{cookies:{getAll:()=>request.cookies.getAll(),setAll:items=>{items.forEach(({name,value})=>request.cookies.set(name,value));onCookies?.(items);}}});
   // Forward the token for server-side verification. No cookie claims are trusted.
   const {data:{session}}=await auth.auth.getSession();
   if(session?.access_token)authorization="Bearer "+session.access_token;
  }
 }
 if(!/^Bearer [A-Za-z0-9._~-]+$/.test(authorization))return {...status,admin:false,canAccess:false};
 const access=await fetch(ENDPOINT,{method:"POST",headers:{Authorization:authorization,"Content-Type":"application/json"},body:JSON.stringify({action:"access"}),cache:"no-store",signal:AbortSignal.timeout(7000)});
 if(access.status===401||access.status===403)return {...status,admin:false,canAccess:false};
 if(!access.ok)throw new Error("Verificação indisponível");
 const verified=await access.json();return {...status,admin:verified.admin===true,canAccess:verified.canAccess===true};
}
export async function checkPlatformMaintenance(request:NextRequest){
 const path=request.nextUrl.pathname;
 if(path==="/api/platform-maintenance/status"||transitions.has(path))return null;
 if((path==="/login"||path==="/auth/login")&&request.nextUrl.searchParams.get("admin")==="1")return null;
 try{
  const refreshed:MaintenanceCookie[]=[];
  const status=await platformMaintenanceStatus(request,items=>refreshed.push(...items));
  if(!status.enabled)return null;
  if(status.canAccess){const pass=NextResponse.next({request});refreshed.forEach(({name,value,options})=>pass.cookies.set(name,value,options));return pass;}
  if(path.startsWith("/api/"))return NextResponse.json({maintenance:true,message:status.message},{status:503,headers:{"Cache-Control":"no-store","Retry-After":"30"}});
  return NextResponse.redirect(PORTAL+"/manutencao?modulo="+MODULE,{status:303,headers:{"Cache-Control":"no-store"}});
 }catch{
  return new NextResponse("Verificação de disponibilidade temporariamente indisponível. Tente novamente em instantes.",{status:503,headers:{"Content-Type":"text/plain; charset=utf-8","Cache-Control":"no-store","Retry-After":"15"}});
 }
}
