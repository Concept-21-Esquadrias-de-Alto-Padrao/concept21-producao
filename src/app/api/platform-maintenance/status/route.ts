import { type NextRequest,NextResponse } from "next/server";
import { platformMaintenanceStatus,type MaintenanceCookie } from "@/lib/platform-maintenance-gate";
export const dynamic="force-dynamic";
export async function GET(request:NextRequest){
 try{const refreshed:MaintenanceCookie[]=[];const status=await platformMaintenanceStatus(request,items=>refreshed.push(...items));const response=NextResponse.json(status,{headers:{"Cache-Control":"no-store"}});refreshed.forEach(({name,value,options})=>response.cookies.set(name,value,options));return response;}
 catch{return NextResponse.json({unavailable:true},{status:503,headers:{"Cache-Control":"no-store"}});}
}
