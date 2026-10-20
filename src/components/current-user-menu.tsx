"use client";
import { FloatingMessage } from "@/components/floating-feedback";

import { LogIn, LogOut, ShieldCheck, UserRound } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getCurrentUserAccess,
  signOut,
  type CurrentUserAccess,
} from "@/lib/auth-client";
import { toUserFriendlyErrorMessage } from "@/lib/errors";
import {
  createSupabaseBrowserClient,
  hasSupabaseBrowserEnv,
} from "@/lib/supabase/client";
import { accentDisplayText } from "@/lib/utils";

type UserMenuState =
  | { status: "loading" }
  | { status: "signed-out" }
  | { status: "unverified-email"; email: string | null }
  | { status: "inactive-profile"; email: string | null }
  | { status: "missing-profile"; email: string | null }
  | { status: "ready"; access: CurrentUserAccess }
  | { status: "error"; message: string };

function getInitials(name?: string | null, email?: string | null) {
  const source = name?.trim() || email?.trim() || "Usuário";
  const parts = source.split(/\s+/).filter(Boolean);

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toLocaleUpperCase("pt-BR");
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toLocaleUpperCase("pt-BR");
}

export function CurrentUserMenu() {
  const router = useRouter();
  const [state, setState] = useState<UserMenuState>({ status: "loading" });
  const [signingOut, setSigningOut] = useState(false);

  useEffect(() => {
    let active = true;

    async function loadUserAccess() {
      if (!hasSupabaseBrowserEnv()) {
        setState({ status: "signed-out" });
        return;
      }

      try {
        const access = await getCurrentUserAccess();

        if (!active) return;

        if (!access) {
          setState({ status: "signed-out" });
          return;
        }

        if (!access.emailConfirmed) {
          setState({ status: "unverified-email", email: access.email });
          return;
        }

        if (!access.profile) {
          setState({ status: "missing-profile", email: access.email });
          return;
        }

        if (access.profile.status !== "active") {
          setState({ status: "inactive-profile", email: access.profile.email ?? access.email });
          return;
        }

        setState({ status: "ready", access });
      } catch (error) {
        if (!active) return;
        setState({
          status: "error",
          message: toUserFriendlyErrorMessage(error, "Não foi possível carregar o usuário atual."),
        });
      }
    }

    void loadUserAccess();

    if (!hasSupabaseBrowserEnv()) {
      return () => {
        active = false;
      };
    }

    const supabase = createSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setState({ status: "signed-out" });
        return;
      }

      void loadUserAccess();
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  const userLabel =
    state.status === "ready" && state.access.profile
      ? {
          name: state.access.profile.name || state.access.email || "Usuário",
          email: state.access.profile.email || state.access.email,
          initials: getInitials(state.access.profile.name, state.access.profile.email),
          accessLevel: state.access.roles.length
            ? state.access.roles.map((role) => accentDisplayText(role.name)).join(", ")
            : "Aguardando perfil",
        }
      : null;

  async function handleSignOut() {
    try {
      setSigningOut(true);
      await signOut();
      setState({ status: "signed-out" });
      router.replace("/login");
      router.refresh();
    } catch (error) {
      setState({
        status: "error",
        message: toUserFriendlyErrorMessage(error, "Não foi possível sair da plataforma."),
      });
      setSigningOut(false);
    }
  }

  if (state.status === "loading") {
    return (
      <div className="flex min-h-10 items-center gap-3">
        <div className="h-9 w-9 animate-pulse rounded-full bg-zinc-200" />
        <div className="hidden space-y-2 sm:block">
          <div className="h-3 w-32 animate-pulse rounded bg-zinc-200" />
          <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
        </div>
      </div>
    );
  }

  if (state.status === "signed-out") {
    return (
      <Link
        href="/login"
        className="inline-flex h-9 items-center gap-2 rounded-md border border-orange-200 bg-orange-50 px-3 text-sm font-semibold text-orange-700 transition hover:bg-orange-100"
      >
        <LogIn className="size-4" />
        Entrar
      </Link>
    );
  }

  if (state.status === "missing-profile") {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-orange-100 text-orange-700">
            <UserRound className="size-4" />
          </div>
          <div className="hidden min-w-0 text-right sm:block">
            <p className="truncate text-sm font-semibold text-zinc-900">Perfil não vinculado</p>
            <p className="truncate text-xs text-zinc-500">{state.email ?? "Sessão ativa"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 transition hover:border-orange-200 hover:text-orange-700 disabled:cursor-wait disabled:opacity-60"
          title="Sair da plataforma"
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">{signingOut ? "Saindo..." : "Sair"}</span>
        </button>
      </div>
    );
  }

  if (state.status === "unverified-email" || state.status === "inactive-profile") {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <div className="flex min-w-0 items-center gap-3">
          <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-orange-100 text-orange-700">
            <UserRound className="size-4" />
          </div>
          <div className="hidden min-w-0 text-right sm:block">
            <p className="truncate text-sm font-semibold text-zinc-900">
              {state.status === "unverified-email" ? "E-mail não confirmado" : "Cadastro inativo"}
            </p>
            <p className="truncate text-xs text-zinc-500">{state.email ?? "Sessão ativa"}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 transition hover:border-orange-200 hover:text-orange-700 disabled:cursor-wait disabled:opacity-60"
          title="Sair da plataforma"
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">{signingOut ? "Saindo..." : "Sair"}</span>
        </button>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="flex items-center gap-2">
        <FloatingMessage message={state.message} />
        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 transition hover:border-orange-200 hover:text-orange-700 disabled:cursor-wait disabled:opacity-60"
          title="Sair da plataforma"
        >
          <LogOut className="size-4" />
          <span className="hidden sm:inline">{signingOut ? "Saindo..." : "Sair"}</span>
        </button>
      </div>
    );
  }

  return (
    <div className="flex min-w-0 items-center gap-2">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-9 w-9 flex-none place-items-center rounded-full bg-[#111316] text-xs font-bold text-white">
          {userLabel?.initials}
        </div>
        <div className="hidden min-w-0 text-right sm:block">
          <p className="truncate text-sm font-semibold text-zinc-900">{userLabel?.name}</p>
          <p className="flex min-w-0 items-center justify-end gap-1 truncate text-xs text-zinc-500">
            <ShieldCheck className="size-3.5 flex-none text-accent" />
            <span className="truncate">{userLabel?.accessLevel}</span>
          </p>
        </div>
      </div>
      <button
        type="button"
        onClick={handleSignOut}
        disabled={signingOut}
        className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-200 px-3 text-sm font-semibold text-zinc-700 transition hover:border-orange-200 hover:text-orange-700 disabled:cursor-wait disabled:opacity-60"
        title="Sair da plataforma"
      >
        <LogOut className="size-4" />
        <span className="hidden sm:inline">{signingOut ? "Saindo..." : "Sair"}</span>
      </button>
    </div>
  );
}
