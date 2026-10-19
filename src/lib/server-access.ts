import { unstable_noStore as noStore } from "next/cache";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSystemMaintenanceState } from "@/lib/system-maintenance-server";
import type { Profile, Role, UserRole } from "@/lib/types";

export class HttpError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

export type AuthenticatedProfileContext = {
  admin: ReturnType<typeof getSupabaseAdminClient>;
  authUserId: string;
  email: string | null;
  profile: Profile;
};

export type MasterAccessContext = AuthenticatedProfileContext & {
  masterRoles: Role[];
};

export type PermissionFlags = {
  isMaster: boolean;
  permissions: Record<string, boolean>;
};

type QueryError = {
  code?: string;
  message?: string;
};

export function isMissingRelation(error?: QueryError | null) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

export function getHttpStatus(error: unknown) {
  return error instanceof HttpError ? error.status : 500;
}

export function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

export async function hasActiveMasterRole(
  admin: ReturnType<typeof getSupabaseAdminClient>,
  profile: Pick<Profile, "id" | "company_id" | "is_master">,
) {
  if (profile.is_master) return true;

  const { data: userRoleData, error: userRoleError } = await admin
    .from("user_roles")
    .select("role_id")
    .eq("company_id", profile.company_id)
    .eq("profile_id", profile.id);

  if (userRoleError) {
    throw new HttpError(500, userRoleError.message);
  }

  const roleIds = Array.from(
    new Set(
      ((userRoleData ?? []) as Array<{ role_id: string | null }>)
        .map((userRole) => userRole.role_id)
        .filter((roleId): roleId is string => Boolean(roleId)),
    ),
  );

  if (!roleIds.length) return false;

  const { data: roleData, error: roleError } = await admin
    .from("roles")
    .select("id")
    .eq("company_id", profile.company_id)
    .eq("active", true)
    .eq("is_master_role", true)
    .in("id", roleIds)
    .limit(1);

  if (roleError) {
    throw new HttpError(500, roleError.message);
  }

  return Boolean((roleData ?? []).length);
}

export async function requireAuthenticatedProfile(): Promise<AuthenticatedProfileContext> {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError) {
    const status = userError.message.toLowerCase().includes("auth session missing") ? 401 : 500;
    throw new HttpError(status, userError.message);
  }

  if (!user) {
    throw new HttpError(401, "Sessão não encontrada.");
  }

  const admin = getSupabaseAdminClient();
  const { data: profileData, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    throw new HttpError(500, profileError.message);
  }

  if (!profileData) {
    throw new HttpError(404, "Perfil de acesso não encontrado.");
  }

  const profile = profileData as Profile;

  if (profile.status !== "active") {
    throw new HttpError(403, "Cadastro inativo.");
  }

  const canBypassMaintenance = await hasActiveMasterRole(admin, profile);

  if (!canBypassMaintenance) {
    const maintenance = await getSystemMaintenanceState(admin, profile.company_id);

    if (maintenance.enabled) {
      throw new HttpError(
        503,
        "Sistema em manutenção. Sua sessão será encerrada para preservar a atualização em andamento.",
      );
    }
  }

  return {
    admin,
    authUserId: user.id,
    email: user.email ?? null,
    profile,
  };
}

export async function requireMasterAccess(): Promise<MasterAccessContext> {
  const context = await requireAuthenticatedProfile();

  if (context.profile.is_master) {
    return { ...context, masterRoles: [] };
  }

  const { data: userRoleData, error: userRoleError } = await context.admin
    .from("user_roles")
    .select("*")
    .eq("profile_id", context.profile.id);

  if (userRoleError) {
    throw new HttpError(500, userRoleError.message);
  }

  const userRoles = (userRoleData ?? []) as UserRole[];
  const roleIds = Array.from(new Set(userRoles.map((userRole) => userRole.role_id)));

  if (!roleIds.length) {
    throw new HttpError(403, "Somente usuários administradores podem alterar configurações.");
  }

  const { data: roleData, error: roleError } = await context.admin
    .from("roles")
    .select("*")
    .in("id", roleIds)
    .eq("company_id", context.profile.company_id)
    .eq("active", true)
    .eq("is_master_role", true);

  if (roleError) {
    throw new HttpError(500, roleError.message);
  }

  const masterRoles = (roleData ?? []) as Role[];

  if (!masterRoles.length) {
    throw new HttpError(403, "Somente usuários administradores podem alterar configurações.");
  }

  return {
    ...context,
    masterRoles,
  };
}

export async function requirePermissionAccess(
  permissionKey: string,
  message = "Você não possui permissão para alterar estas configurações.",
): Promise<AuthenticatedProfileContext> {
  const context = await requireAuthenticatedProfile();

  if (context.profile.is_master) {
    return context;
  }

  const { data: userRoleData, error: userRoleError } = await context.admin
    .from("user_roles")
    .select("role_id")
    .eq("company_id", context.profile.company_id)
    .eq("profile_id", context.profile.id);

  if (userRoleError) {
    throw new HttpError(500, userRoleError.message);
  }

  const roleIds = Array.from(
    new Set(
      ((userRoleData ?? []) as Array<{ role_id: string | null }>)
        .map((userRole) => userRole.role_id)
        .filter((roleId): roleId is string => Boolean(roleId)),
    ),
  );

  if (!roleIds.length) {
    throw new HttpError(403, message);
  }

  const { data: activeRoleData, error: activeRoleError } = await context.admin
    .from("roles")
    .select("id")
    .eq("company_id", context.profile.company_id)
    .eq("active", true)
    .in("id", roleIds);

  if (activeRoleError) {
    throw new HttpError(500, activeRoleError.message);
  }

  const activeRoleIds = ((activeRoleData ?? []) as Array<{ id: string }>).map((role) => role.id);
  if (!activeRoleIds.length) {
    throw new HttpError(403, message);
  }

  const { data: permissionData, error: permissionError } = await context.admin
    .from("permissions")
    .select("id")
    .eq("key", permissionKey)
    .maybeSingle();

  if (permissionError) {
    throw new HttpError(500, permissionError.message);
  }

  if (!permissionData) {
    throw new HttpError(403, message);
  }

  const { data: grantData, error: grantError } = await context.admin
    .from("role_permissions")
    .select("id")
    .eq("company_id", context.profile.company_id)
    .eq("permission_id", (permissionData as { id: string }).id)
    .in("role_id", activeRoleIds)
    .limit(1);

  if (grantError) {
    throw new HttpError(500, grantError.message);
  }

  if (!(grantData ?? []).length) {
    throw new HttpError(403, message);
  }

  return context;
}

function buildPermissionFlags(
  permissionKeys: readonly string[],
  isMaster: boolean,
  grantedKeys: Set<string> = new Set(),
): PermissionFlags {
  const permissions = Object.fromEntries(
    permissionKeys.map((permissionKey) => [
      permissionKey,
      isMaster || grantedKeys.has(permissionKey),
    ]),
  );

  return {
    isMaster,
    permissions,
  };
}

export async function getCurrentPermissionFlags(
  permissionKeys: readonly string[],
): Promise<PermissionFlags> {
  noStore();

  const uniqueKeys = Array.from(new Set(permissionKeys));

  if (!uniqueKeys.length) {
    return { isMaster: false, permissions: {} };
  }

  if (!hasSupabaseEnv()) {
    return buildPermissionFlags(uniqueKeys, true);
  }

  try {
    const context = await requireAuthenticatedProfile();
    const isMaster = await hasActiveMasterRole(context.admin, context.profile);

    if (isMaster) {
      return buildPermissionFlags(uniqueKeys, true);
    }

    const { data: userRoleData, error: userRoleError } = await context.admin
      .from("user_roles")
      .select("role_id")
      .eq("company_id", context.profile.company_id)
      .eq("profile_id", context.profile.id);

    if (userRoleError) {
      throw new HttpError(500, userRoleError.message);
    }

    const roleIds = Array.from(
      new Set(
        ((userRoleData ?? []) as Array<{ role_id: string | null }>)
          .map((userRole) => userRole.role_id)
          .filter((roleId): roleId is string => Boolean(roleId)),
      ),
    );

    if (!roleIds.length) {
      return buildPermissionFlags(uniqueKeys, false);
    }

    const { data: activeRoleData, error: activeRoleError } = await context.admin
      .from("roles")
      .select("id")
      .eq("company_id", context.profile.company_id)
      .eq("active", true)
      .in("id", roleIds);

    if (activeRoleError) {
      throw new HttpError(500, activeRoleError.message);
    }

    const activeRoleIds = ((activeRoleData ?? []) as Array<{ id: string }>).map(
      (role) => role.id,
    );

    if (!activeRoleIds.length) {
      return buildPermissionFlags(uniqueKeys, false);
    }

    const { data: permissionData, error: permissionError } = await context.admin
      .from("permissions")
      .select("id, key")
      .in("key", uniqueKeys);

    if (permissionError) {
      throw new HttpError(500, permissionError.message);
    }

    const permissions = (permissionData ?? []) as Array<{ id: string; key: string }>;
    const permissionById = new Map(permissions.map((permission) => [permission.id, permission]));

    if (!permissions.length) {
      return buildPermissionFlags(uniqueKeys, false);
    }

    const { data: grantData, error: grantError } = await context.admin
      .from("role_permissions")
      .select("permission_id")
      .eq("company_id", context.profile.company_id)
      .in("role_id", activeRoleIds)
      .in(
        "permission_id",
        permissions.map((permission) => permission.id),
      );

    if (grantError) {
      throw new HttpError(500, grantError.message);
    }

    const grantedKeys = new Set(
      ((grantData ?? []) as Array<{ permission_id: string | null }>)
        .map((grant) => (grant.permission_id ? permissionById.get(grant.permission_id)?.key : null))
        .filter((key): key is string => Boolean(key)),
    );

    return buildPermissionFlags(uniqueKeys, false, grantedKeys);
  } catch (error) {
    if (!(error instanceof HttpError && error.status === 401)) {
      console.error("Falha ao carregar permissões do usuário atual", error);
    }
    return buildPermissionFlags(uniqueKeys, false);
  }
}
