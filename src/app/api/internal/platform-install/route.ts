import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { platformAdmin } from "@/lib/platform-auth";
import { secureOrigin } from "@/lib/portal-session-policy";
import { parsePlatformInstall,PLATFORM_PROVIDER } from "@/lib/platform-install-policy";
function denied(status:number){return NextResponse.json({ok:false},{status,headers:{"Cache-Control":"no-store"}});}
export async function POST(request:Request){
 const portal="https://afvksywshuumfibwpqmt.supabase.co",key=process.env.PLATFORM_IDENTITY_PUBLISHABLE_KEY;
 if(!portal||!key)return denied(404);
 const token=request.headers.get("authorization")?.match(/^Bearer ([A-Za-z0-9._~-]+)$/)?.[1];if(!token)return denied(401);
 const central=createClient(portal,key,{auth:{persistSession:false,autoRefreshToken:false}});
 const [{data:claims,error:ce},{data:{user},error}]=await Promise.all([central.auth.getClaims(token),central.auth.getUser(token)]);
 if(error||ce||!claims||claims.claims.client_id||!user?.id||!user.email_confirmed_at)return denied(403);
 const authorization=await fetch("https://concept21-portal.vercel.app/api/internal/production-setup/authorize",{method:"POST",headers:{Authorization:"Bearer "+token},cache:"no-store",signal:AbortSignal.timeout(7000)});
 if(!authorization.ok)return denied(403);
 const admin=platformAdmin();
 const {data:adminBinding}=await admin.from("platform_account_bindings").select("auth_user_id").eq("portal_auth_user_id",user.id).eq("allowed",true).maybeSingle();
 if(!adminBinding)return denied(403);
 const {data:profile}=await admin.from("profiles").select("id,is_master,status").eq("user_id",adminBinding.auth_user_id).maybeSingle();
 if(!profile||!profile.is_master||profile.status!=="active")return denied(403);
 const {data:config,error:configError}=await admin.from("platform_identity_config").select("enabled,setup_expires_at,setup_claimed_at").eq("key","central_login").maybeSingle();
 if(configError||!config)return denied(503);if(config.enabled||config.setup_claimed_at||Date.parse(config.setup_expires_at)<=Date.now())return denied(409);
 const {data:approved,error:reviewError}=await admin.from("platform_account_bindings").select("auth_user_id,portal_auth_user_id,portal_link_id").eq("allowed",true);
 if(reviewError||!approved?.length)return denied(403);
 if(Number(request.headers.get("content-length")??"0")>16000)return denied(413);
 const text=await request.text();if(text.length>16000)return denied(413);
 let body:unknown;try{body=JSON.parse(text);}catch{return denied(400);}
 const payload=parsePlatformInstall(body,approved.map(r=>r.auth_user_id));
 if(!payload||payload.bindings.some(b=>!approved.some(r=>r.auth_user_id===b.authUserId&&r.portal_auth_user_id===b.portalAuthUserId&&r.portal_link_id===b.portalLinkId)))return denied(400);
 const now=new Date().toISOString();
 const {data:claim,error:claimError}=await admin.from("platform_identity_config").update({setup_claimed_at:now}).eq("key","central_login").eq("enabled",false).is("setup_claimed_at",null).gt("setup_expires_at",now).select("key").maybeSingle();
 if(claimError||!claim)return denied(409);
 const provider={name:"Concept21 · Conta central",client_id:payload.clientId,client_secret:payload.clientSecret,issuer:portal+"/auth/v1",scopes:["openid","email","profile"],enabled:true,pkce_enabled:true};
 const {data:existing}=await admin.auth.admin.customProviders.getProvider(PLATFORM_PROVIDER);
 const result=existing?await admin.auth.admin.customProviders.updateProvider(PLATFORM_PROVIDER,provider):await admin.auth.admin.customProviders.createProvider({...provider,identifier:PLATFORM_PROVIDER,provider_type:"oidc"});
 if(result.error){await admin.from("platform_identity_config").update({setup_claimed_at:null}).eq("key","central_login").eq("enabled",false);return denied(503);}
 const {error:enableError}=await admin.from("platform_identity_config").update({enabled:true,setup_expires_at:new Date().toISOString()}).eq("key","central_login");
 return enableError?denied(503):NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
}
