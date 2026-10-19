"use client";

import type { User } from "@supabase/supabase-js";
import {
  createSupabaseBrowserClient,
  createSupabaseSignupClient,
  hasSupabaseBrowserEnv,
} from "@/lib/supabase/client";
import { getPublicAppOrigin } from "@/lib/supabase/config";
import type {
  AccessReviewRequest,
  Profile,
  Role,
  SystemMaintenance,
  UserRole,
} from "@/lib/types";

type SupabaseUserWithConfirmedAt = User & {
  confirmed_at?: string | null;
};

export type CurrentUserAccess = {
  authUserId: string;
  email: string | null;
  emailConfirmed: boolean;
  profile:
    | (Profile & {
        user_roles?: Array<
          UserRole & {
            role: Role | null;
          }
        >;
        access_review_requests?: AccessReviewRequest[];
      })
    | null;
  roles: Role[];
  permissions: Record<string, boolean>;
  maintenance: SystemMaintenance | null;
};

const currentAccessCacheTtlMs = 2500;
let currentAccessCache:
  | {
      data: CurrentUserAccess | null;
      updatedAt: number;
    }
  | null = null;
let currentAccessPromise: Promise<CurrentUserAccess | null> | null = null;

export function clearCurrentUserAccessCache() {
  currentAccessCache = null;
  currentAccessPromise = null;
}

export function isAuthUserEmailConfirmed(user?: User | null) {
  if (!user) return false;
  const confirmedAt = user.email_confirmed_at ?? (user as SupabaseUserWithConfirmedAt).confirmed_at;
  return Boolean(confirmedAt);
}

export function isCurrentUserMaster(access?: CurrentUserAccess | null) {
  if (!access) return false;
  return Boolean(
    access.profile?.is_master || access.roles.some((role) => role.is_master_role),
  );
}

export function isMaintenanceBlockingAccess(access?: CurrentUserAccess | null) {
  return Boolean(access?.maintenance?.enabled && !isCurrentUserMaster(access));
}

function getSignupEmailRedirectTo() {
  const callbackUrl = new URL("/auth/callback", getPublicAppOrigin());
  callbackUrl.searchParams.set("next", "/login?confirmed=1");
  return callbackUrl.toString();
}

export async function signInWithEmail(email: string, password: string) {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim(),
    password,
  });

  if (error) throw new Error(error.message);

  if (!isAuthUserEmailConfirmed(data.user)) {
    await supabase.auth.signOut();
    throw new Error("Confirme seu e-mail antes de acessar a plataforma.");
  }

  const access = await getCurrentUserAccess();

  if (isMaintenanceBlockingAccess(access)) {
    await supabase.auth.signOut();
    throw new Error(
      "Sistema em manutenção. A plataforma está temporariamente bloqueada para usuários que não são administradores.",
    );
  }

  return data;
}

export async function signUpWithEmail(input: {
  fullName: string;
  email: string;
  phone?: string;
  password: string;
}) {
  const supabase = createSupabaseSignupClient();
  const { data, error } = await supabase.auth.signUp({
    email: input.email.trim(),
    password: input.password,
    options: {
      emailRedirectTo: getSignupEmailRedirectTo(),
      data: {
        name: input.fullName.trim(),
        full_name: input.fullName.trim(),
        phone: input.phone?.trim() || null,
        module: "production",
      },
    },
  });

  if (error) throw new Error(error.message);

  if (data.user && data.session) {
    await supabase.auth.signOut();
    throw new Error(
      "A confirmação de e-mail precisa estar habilitada no Supabase antes de liberar novos cadastros.",
    );
  }

  return data;
}

export async function signOut() {
  if (!hasSupabaseBrowserEnv()) return;
  clearCurrentUserAccessCache();
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(error.message);
}

export async function getCurrentUserAccess(): Promise<CurrentUserAccess | null> {
  if (!hasSupabaseBrowserEnv()) return null;

  if (
    currentAccessCache &&
    Date.now() - currentAccessCache.updatedAt < currentAccessCacheTtlMs
  ) {
    return currentAccessCache.data;
  }

  if (!currentAccessPromise) {
    currentAccessPromise = (async () => {
      const response = await fetch("/api/auth/current-access", {
        headers: {
          Accept: "application/json",
        },
      });

      if (response.status === 401) {
        currentAccessCache = {
          data: null,
          updatedAt: Date.now(),
        };
        return null;
      }

      const payload = (await response.json().catch(() => null)) as
        | (CurrentUserAccess & { error?: string })
        | null;

      if (!response.ok) {
        throw new Error(payload?.error ?? "Não foi possível validar a sessão.");
      }

      currentAccessCache = {
        data: payload,
        updatedAt: Date.now(),
      };
      return payload;
    })().finally(() => {
      currentAccessPromise = null;
    });
  }

  return currentAccessPromise;
}

export async function requestCurrentUserAccessReview() {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.rpc("request_access_review");

  if (error) throw new Error(error.message);
  const requestId = typeof data === "string" ? data : null;

  if (requestId && typeof window !== "undefined") {
    void fetch("/api/access-requests/notify", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ requestId }),
    }).catch(() => undefined);
  }

  return requestId;
}
