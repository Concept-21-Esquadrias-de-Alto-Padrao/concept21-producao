"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { endBrowserSession } from "@/lib/portal-session-policy";
import { createBrowserClient } from "@supabase/ssr";
function browserAuth(){
 const url=process.env.NEXT_PUBLIC_SUPABASE_URL,key=process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
 if(!url||!key)throw new Error("Saída indisponível.");return createBrowserClient(url,key).auth;
}

export function PortalLogoutProgress({ autoStart, nextUrl, restartUrl }: {
  autoStart: boolean; nextUrl: string; restartUrl: string;
}) {
  const started = useRef(false);
  const [error, setError] = useState("");
  const run = useCallback(async () => {
    setError("");
    try {
      await endBrowserSession(browserAuth());
      window.location.replace(nextUrl);
    } catch {
      setError("Não foi possível encerrar a sessão. Verifique sua conexão e tente novamente.");
    }
  }, [nextUrl]);
  useEffect(() => {
    if (autoStart && !started.current) {
      started.current = true;
      void run();
    }
  }, [autoStart, run]);

  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", padding: 24, background: "#f6f7f8", color: "#20252a" }}>
      <section style={{ maxWidth: 440, background: "white", padding: 32, borderRadius: 16 }}>
        <p style={{ color: "#f97316", fontWeight: 700 }}>CONCEPT21</p>
        <h1 style={{ fontSize: 26, fontWeight: 700 }}>Saída do Portal</h1>
        <p role="status">{error || (autoStart ? "Encerrando seu acesso ao Portal e aos módulos…" : "Encerre o Portal e os módulos neste navegador.")}</p>
        {error ? <button type="button" onClick={() => void run()}>Tentar novamente</button> : !autoStart ?
          <a href={restartUrl}>Sair do Portal e dos módulos</a> : null}
      </section>
    </main>
  );
}
