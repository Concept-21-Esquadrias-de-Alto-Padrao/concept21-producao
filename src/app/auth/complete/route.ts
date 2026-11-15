import { createServerClient } from "@supabase/ssr";
import { type NextRequest,NextResponse } from "next/server";
import { assertSupabasePublicConfig } from "@/lib/supabase/config";
import { portalSessionAllowed } from "@/lib/platform-auth";
import { secureOrigin } from "@/lib/portal-session-policy";
export async function GET(request:NextRequest){
 const app=secureOrigin(process.env.NEXT_PUBLIC_APP_URL),portal=secureOrigin(process.env.NEXT_PUBLIC_PORTAL_ORIGIN);
 const response=NextResponse.redirect((portal??"https://concept21-portal.vercel.app")+"/",{status:303});response.headers.set("Cache-Control","private, no-store");
 const code=request.nextUrl.searchParams.get("code");if(!app||request.nextUrl.origin!==app||!code||code.length>2048)return response;
 const {url,anonKey:publishableKey}=assertSupabasePublicConfig();const auth=createServerClient(url,publishableKey,{cookies:{getAll:()=>request.cookies.getAll(),setAll:items=>items.forEach(({name,value,options})=>response.cookies.set(name,value,options))}});
 const {data,error}=await auth.auth.exchangeCodeForSession(code);
 if(!error&&data.user&&data.session&&await portalSessionAllowed(data.user,data.session.access_token))response.headers.set("Location",app+"/");
 else await auth.auth.signOut({scope:"local"});
 return response;
}
