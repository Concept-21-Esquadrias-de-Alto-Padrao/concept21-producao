import { createServerClient } from "@supabase/ssr";
import { type NextRequest,NextResponse } from "next/server";
import { assertSupabasePublicConfig } from "@/lib/supabase/config";
import { centralLoginEnabled } from "@/lib/platform-auth";
import { secureOrigin,trustedReferrer } from "@/lib/portal-session-policy";
export async function GET(request:NextRequest){
 const portal=secureOrigin(process.env.NEXT_PUBLIC_PORTAL_ORIGIN),app=secureOrigin(process.env.NEXT_PUBLIC_APP_URL);
 const failure=()=>NextResponse.redirect((portal??"https://concept21-portal.vercel.app")+"/",{status:303});
 if(!portal||!app||request.nextUrl.origin!==app||!trustedReferrer(request.headers.get("referer"),[portal])||!await centralLoginEnabled())return failure();
 const response=failure();response.headers.set("Cache-Control","private, no-store");
 const {url,anonKey:publishableKey}=assertSupabasePublicConfig();
 const auth=createServerClient(url,publishableKey,{cookies:{getAll:()=>request.cookies.getAll(),setAll:items=>{items.forEach(({name,value,options})=>response.cookies.set(name,value,options));}}});
 const {data,error}=await auth.auth.signInWithOAuth({provider:"custom:concept21-portal" as Parameters<typeof auth.auth.signInWithOAuth>[0]["provider"],options:{redirectTo:app+"/auth/complete",scopes:"openid email profile",skipBrowserRedirect:true}});
 if(!error&&data.url)response.headers.set("Location",data.url);return response;
}
