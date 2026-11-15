import { createServerClient } from "@supabase/ssr";
import { NextResponse,type NextRequest } from "next/server";
import { assertSupabasePublicConfig } from "@/lib/supabase/config";
import { hasSupabaseEnv } from "@/lib/supabase/server";
import { secureOrigin } from "@/lib/portal-session-policy";
import { isLocalAuthPath,portalTransitions } from "@/lib/portal-identity-policy";
import { portalSessionAllowed } from "@/lib/platform-auth";
export async function updateSession(request:NextRequest){
 const path=request.nextUrl.pathname;
 const portal=secureOrigin(process.env.NEXT_PUBLIC_PORTAL_ORIGIN);
 const toPortal=()=>{const r=NextResponse.redirect((portal??"https://concept21-portal.vercel.app")+"/",{status:303});r.headers.set("Cache-Control","private, no-store");return r;};
 if(isLocalAuthPath(path))return toPortal();
 if((portalTransitions.has(path)&&["GET","HEAD"].includes(request.method))||path==="/api/internal/platform-install"||path==="/api/platform-session/status"||path==="/api/platform-maintenance/status")return NextResponse.next();
 if(path==="/"&&request.nextUrl.searchParams.has("code")){
  const target=request.nextUrl.clone();target.pathname="/auth/complete";return NextResponse.rewrite(target);
 }
 if(!hasSupabaseEnv())return new NextResponse("Autenticação indisponível.",{status:503});
 const {anonKey:publishableKey,url}=assertSupabasePublicConfig();let response=NextResponse.next({request});
 response.headers.set("Cache-Control","private, no-store");
 const auth=createServerClient(url,publishableKey,{cookies:{getAll:()=>request.cookies.getAll(),setAll:items=>{
  items.forEach(({name,value})=>request.cookies.set(name,value));response=NextResponse.next({request});response.headers.set("Cache-Control","private, no-store");items.forEach(({name,value,options})=>response.cookies.set(name,value,options));
 }}});
 try{
  const {data:{user},error}=await auth.auth.getUser();
  if(!error&&user){const {data:{session}}=await auth.auth.getSession();if(session&&await portalSessionAllowed(user,session.access_token))return response;}
 }catch{/* A session is never accepted when its authority cannot be verified. */}
 const denied=path.startsWith("/api/")?NextResponse.json({allowed:false},{status:401,headers:{"Cache-Control":"no-store"}}):toPortal();
 response.cookies.getAll().forEach(cookie=>denied.cookies.set(cookie));return denied;
}
