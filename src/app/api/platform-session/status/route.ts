import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { portalSessionAllowed } from "@/lib/platform-auth";
export async function GET(){
 try{const auth=await createSupabaseServerClient();const {data:{user}}=await auth.auth.getUser();const {data:{session}}=await auth.auth.getSession();
 const allowed=Boolean(user&&session&&await portalSessionAllowed(user,session.access_token));
 return NextResponse.json({allowed},{status:allowed?200:401,headers:{"Cache-Control":"private, no-store"}});
 }catch{return NextResponse.json({allowed:false},{status:503,headers:{"Cache-Control":"private, no-store"}});}
}
