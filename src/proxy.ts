import { type NextRequest,NextResponse } from "next/server";
import { TRANSPORT_ENABLED,TRANSPORT_DISABLED_MESSAGE } from "./lib/transport-module";
import { checkPlatformMaintenance } from "@/lib/platform-maintenance-gate";
export async function proxy(request:NextRequest){
 // Preserve the existing isolation of the legacy transport module.
 if(/^\/(transport|freights|routes|extra-services)(\/|$)/.test(request.nextUrl.pathname)&&!TRANSPORT_ENABLED){
  return new NextResponse(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Área indisponível</title></head><body><main><h1>Área indisponível</h1><p>${TRANSPORT_DISABLED_MESSAGE}</p><a href="/">Voltar à Produção</a></main></body></html>`,{status:410,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","X-Robots-Tag":"noindex"}});
 }
 return await checkPlatformMaintenance(request)??NextResponse.next();
}
export const config={matcher:["/((?!_next/static|_next/image|brand/|icons/|favicon.ico$).*)"]};
