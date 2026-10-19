"use client";

import { AlertTriangle, LogIn, Wrench } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getCurrentUserAccess,
  isMaintenanceBlockingAccess,
  requestCurrentUserAccessReview,
  signOut,
  type CurrentUserAccess,
} from "@/lib/auth-client";
import { toUserFriendlyErrorMessage } from "@/lib/errors";
import {
  createSupabaseBrowserClient,
  hasSupabaseBrowserEnv,
} from "@/lib/supabase/client";
import type { SystemMaintenance } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

type AuthGateState =
  | { status: "loading" }
  | { status: "demo" }
  | { status: "ready"; access: CurrentUserAccess }
  | { status: "pending-access"; access: CurrentUserAccess; requestId: string | null }
  | { status: "unverified-email"; email?: string | null }
  | { status: "inactive-profile"; email?: string | null }
  | { status: "missing-profile"; email?: string | null }
  | { status: "maintenance"; maintenance: SystemMaintenance; email?: string | null }
  | { status: "error"; message: string };

type PublicMaintenanceStatus = {
  enabled: boolean;
  message: string;
  activated_at: string | null;
  updated_at: string;
};

async function getPublicMaintenanceStatus() {
  const response = await fetch("/api/system/maintenance-status", {
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("Não foi possível consultar o status da manutenção.");
  }

  const payload = (await response.json()) as {
    maintenance?: PublicMaintenanceStatus;
  };

  return payload.maintenance ?? null;
}

function AccessMessage({
  tone = "orange",
  title,
  children,
}: {
  tone?: "orange" | "red";
  title: string;
  children: React.ReactNode;
}) {
  const toneClass =
    tone === "red"
      ? "border-red-200 bg-red-50 text-red-800"
      : "border-orange-200 bg-orange-50 text-orange-900";

  return (
    <div className={`rounded-md border p-5 text-sm ${toneClass}`}>
      <div className="flex gap-3">
        <AlertTriangle className="mt-0.5 size-5 flex-none" />
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <div className="mt-2 leading-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

function MaintenanceMessage({
  maintenance,
  email,
}: {
  maintenance: SystemMaintenance;
  email?: string | null;
}) {
  return (
    <div className="grid min-h-[60vh] place-items-center">
      <section className="w-full max-w-2xl rounded-md border border-orange-200 bg-white shadow-sm">
        <div className="border-b border-orange-100 bg-orange-50 px-5 py-4">
          <div className="flex items-start gap-3">
            <span className="grid size-11 flex-none place-items-center rounded-md bg-accent text-accent-foreground">
              <Wrench className="size-5" />
            </span>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                Concept21 Aluminium
              </p>
              <h1 className="mt-1 text-xl font-semibold text-charcoal">
                Sistema em manutenção
              </h1>
            </div>
          </div>
        </div>

        <div className="space-y-4 px-5 py-5 text-sm leading-6 text-muted-foreground">
          <p className="text-base font-medium text-charcoal">
            A plataforma foi bloqueada temporariamente para uma atualização controlada.
          </p>
          <p>
            Sua sessão foi encerrada para evitar alterações durante a manutenção. Assim que o
            Administrador liberar o acesso novamente, entre com suas credenciais normalmente.
          </p>
          {maintenance.activated_at ? (
            <p className="rounded-md border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
              Início da manutenção: {formatDateTime(maintenance.activated_at)}
            </p>
          ) : null}
          {email ? (
            <p className="font-mono text-xs text-muted-foreground">Usuário: {email}</p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [state, setState] = useState<AuthGateState>({ status: "loading" });

  useEffect(() => {
    let active = true;
    let stoppedForMaintenance = false;
    let loading = false;
    let intervalId: number | null = null;
    let maintenanceIntervalId: number | null = null;

    function stopPolling() {
      if (intervalId !== null) {
        window.clearInterval(intervalId);
        intervalId = null;
      }
    }

    function stopMaintenancePolling() {
      if (maintenanceIntervalId !== null) {
        window.clearInterval(maintenanceIntervalId);
        maintenanceIntervalId = null;
      }
    }

    function redirectToLoginAfterMaintenance() {
      if (!active) return;

      stopPolling();
      stopMaintenancePolling();
      router.replace("/login");
      router.refresh();
    }

    function startMaintenancePolling() {
      if (maintenanceIntervalId !== null) return;

      async function loadPublicStatus() {
        try {
          const maintenance = await getPublicMaintenanceStatus();

          if (!active || !maintenance) return;

          if (!maintenance.enabled) {
            redirectToLoginAfterMaintenance();
          }
        } catch (error) {
          console.warn("Não foi possível consultar o status da manutenção.", error);
        }
      }

      void loadPublicStatus();
      maintenanceIntervalId = window.setInterval(loadPublicStatus, 3000);
    }

    async function loadAuthState({ silent = false }: { silent?: boolean } = {}) {
      if (stoppedForMaintenance || loading) return;
      loading = true;

      try {
        if (!hasSupabaseBrowserEnv()) {
          setState({ status: "demo" });
          return;
        }

        const supabase = createSupabaseBrowserClient();
        const session = await supabase.auth.getSession();

        if (!session.data.session) {
          if (!silent) router.replace("/login");
          return;
        }

        const access = await getCurrentUserAccess();

        if (!active) return;

        if (access?.maintenance?.enabled && isMaintenanceBlockingAccess(access)) {
          stoppedForMaintenance = true;
          stopPolling();
          await signOut().catch(() => undefined);

          if (!active) return;

          setState({
            status: "maintenance",
            maintenance: access.maintenance,
            email: access.profile?.email ?? access.email ?? session.data.session.user.email,
          });
          startMaintenancePolling();
          return;
        }

        if (!access?.emailConfirmed) {
          await signOut();
          if (!active) return;
          setState({
            status: "unverified-email",
            email: session.data.session.user.email,
          });
          return;
        }

        if (!access.profile) {
          setState({
            status: "missing-profile",
            email: session.data.session.user.email,
          });
          return;
        }

        if (access.profile.status !== "active") {
          await signOut();
          if (!active) return;
          setState({
            status: "inactive-profile",
            email: access.profile.email ?? access.email,
          });
          return;
        }

        if (access.roles.length === 0) {
          let requestId: string | null = null;

          if (!silent) {
            try {
              requestId = await requestCurrentUserAccessReview();
            } catch (requestError) {
              console.warn("Não foi possível registrar a revisão de acesso.", requestError);
            }
          }

          if (!active) return;
          if (!silent) setState({ status: "pending-access", access, requestId });
          return;
        }

        setState({ status: "ready", access });
      } catch (error) {
        if (!active) return;
        setState({
          status: "error",
          message: toUserFriendlyErrorMessage(error, "Não foi possível validar a sessão."),
        });
      } finally {
        loading = false;
      }
    }

    void loadAuthState();
    intervalId = window.setInterval(() => {
      void loadAuthState({ silent: true });
    }, 5000);

    return () => {
      active = false;
      stopPolling();
      stopMaintenancePolling();
    };
  }, [router]);

  async function exitToLogin() {
    try {
      await signOut();
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setState({
        status: "error",
        message: toUserFriendlyErrorMessage(error, "Não foi possível sair da plataforma."),
      });
    }
  }

  if (state.status === "demo" || state.status === "ready") {
    return <>{children}</>;
  }

  if (state.status === "loading") {
    return (
      <div className="rounded-md border border-border bg-white p-5 text-sm text-muted-foreground shadow-sm">
        Validando sessão...
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <AccessMessage tone="red" title="Não foi possível validar o acesso.">
        {state.message}
      </AccessMessage>
    );
  }

  if (state.status === "maintenance") {
    return <MaintenanceMessage maintenance={state.maintenance} email={state.email} />;
  }

  if (state.status === "unverified-email") {
    return (
      <AccessMessage title="Confirme seu e-mail para acessar.">
        <p>
          Sua sessão foi encerrada porque o e-mail ainda não foi confirmado. Use o link de
          verificação enviado para {state.email ?? "seu e-mail"} e tente entrar novamente.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500"
        >
          <LogIn className="size-4" />
          Voltar ao login
        </Link>
      </AccessMessage>
    );
  }

  if (state.status === "inactive-profile") {
    return (
      <AccessMessage tone="red" title="Cadastro sem acesso ativo.">
        <p>
          Este cadastro foi inativado ou recusado pelo Administrador. Entre com outro usuário ou
          solicite a revisão do acesso internamente.
        </p>
        <Link
          href="/login"
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500"
        >
          <LogIn className="size-4" />
          Entrar com outro usuário
        </Link>
      </AccessMessage>
    );
  }

  if (state.status === "missing-profile") {
    return (
      <AccessMessage title="Cadastro autenticado, aguardando vínculo no sistema.">
        <p>
          Seu login foi confirmado, mas ainda não existe um perfil interno vinculado ao seu
          cadastro. Peça a um usuário Administrador para revisar seu acesso em Configurações de
          Produção &gt; Segurança e acessos.
        </p>
        <div className="mt-3 rounded-md bg-white p-3 font-mono text-xs text-zinc-700">
          <p>E-mail: {state.email ?? "-"}</p>
        </div>
        <button
          type="button"
          onClick={exitToLogin}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500"
        >
          <LogIn className="size-4" />
          Entrar com outro usuário
        </button>
      </AccessMessage>
    );
  }

  if (state.status === "pending-access") {
    return (
      <AccessMessage title="Cadastro confirmado, aguardando liberação de acesso.">
        <p>
          Seu e-mail já foi confirmado, mas seu usuário ainda não possui um perfil de acesso. Peça a
          um usuário Administrador para liberar seu cadastro em Configurações de Produção &gt; Segurança
          e acessos.
        </p>
        {state.requestId ? (
          <p className="mt-2 font-mono text-xs text-orange-800">Solicitação: {state.requestId}</p>
        ) : (
          <p className="mt-2 text-xs text-orange-800">
            A solicitação automática não pode ser registrada agora. Avise o Administrador e informe
            seu e-mail de cadastro.
          </p>
        )}
        <button
          type="button"
          onClick={exitToLogin}
          className="mt-4 inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500"
        >
          <LogIn className="size-4" />
          Entrar com outro usuário
        </button>
      </AccessMessage>
    );
  }

  return null;
}
