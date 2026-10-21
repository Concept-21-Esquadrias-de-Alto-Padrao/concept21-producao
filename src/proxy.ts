import { NextResponse } from "next/server";
import { TRANSPORT_ENABLED, TRANSPORT_DISABLED_MESSAGE } from "./lib/transport-module";

// Block legacy URLs before rendering/streaming. Page and action guards remain
// in place as well, so navigation is never the only boundary.
export function proxy() {
  if (TRANSPORT_ENABLED) return NextResponse.next();
  return new NextResponse(
    `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Área indisponível</title></head><body><main><h1>Área indisponível</h1><p>${TRANSPORT_DISABLED_MESSAGE}</p><a href="/">Voltar à Produção</a></main></body></html>`,
    { status: 410, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } },
  );
}

export const config = {
  matcher: ["/transport/:path*", "/freights/:path*", "/routes/:path*", "/extra-services/:path*"],
};
