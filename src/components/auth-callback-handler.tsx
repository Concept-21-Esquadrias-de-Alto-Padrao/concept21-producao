"use client";

import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseCallbackBrowserClient } from "@/lib/supabase/client";

function getSafeNext(value: string | null) {
  return value === "/" ? value : "/login?confirmed=1";
}

function getHashParams() {
  const hash = window.location.hash.startsWith("#")
    ? window.location.hash.slice(1)
    : window.location.hash;

  return new URLSearchParams(hash);
}

export function AuthCallbackHandler() {
  const [message, setMessage] = useState("Confirmando e-mail...");

  useEffect(() => {
    let active = true;

    async function finishAuthCallback() {
      const url = new URL(window.location.href);
      const searchParams = url.searchParams;
      const hashParams = getHashParams();
      const next = getSafeNext(searchParams.get("next") ?? hashParams.get("next"));
      const supabase = createSupabaseCallbackBrowserClient();

      const redirectWithError = (error?: unknown) => {
        if (error) {
          console.error("Auth callback failed", error);
        }

        window.location.replace("/login?auth_error=callback");
      };

      const redirectWithSuccess = () => {
        window.history.replaceState(null, "", window.location.pathname);
        window.location.replace(next);
      };

      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");

      if (accessToken && refreshToken) {
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });

        if (!error) {
          redirectWithSuccess();
          return;
        }

        redirectWithError(error);
        return;
      }

      const code = searchParams.get("code");

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (!error) {
          redirectWithSuccess();
          return;
        }

        redirectWithError(error);
        return;
      }

      const tokenHash = searchParams.get("token_hash") ?? hashParams.get("token_hash");
      const type = searchParams.get("type") ?? hashParams.get("type");

      if (tokenHash && type) {
        const { error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: type as EmailOtpType,
        });

        if (!error) {
          redirectWithSuccess();
          return;
        }

        redirectWithError(error);
        return;
      }

      if (active) {
        setMessage("Não foi possível identificar o link de confirmação.");
      }

      redirectWithError();
    }

    void finishAuthCallback();

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="grid min-h-screen place-items-center bg-charcoal px-4 py-10">
      <section className="w-full max-w-md rounded-md border border-white/10 bg-white p-6 text-center shadow-2xl">
        <div className="mx-auto mb-4 grid size-12 place-items-center rounded-md bg-accent font-semibold text-accent-foreground">
          C21
        </div>
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
          Concept21 Aluminium
        </p>
        <h1 className="mt-2 text-2xl font-semibold text-zinc-950">Verificação de e-mail</h1>
        <p className="mt-3 text-sm text-zinc-500">{message}</p>
      </section>
    </main>
  );
}
