import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { appNavigationPermissionKeys } from "@/lib/module-access";
import { getSystemMaintenanceState } from "@/lib/system-maintenance-server";
import type {
  AccessReviewRequest,
  Profile,
  Role,
  SystemMaintenance,
  UserRole,
} from "@/lib/types";

type SupabaseAuthUser = {
  id: string;
  email?: string | null;
  email_confirmed_at?: string | null;
  confirmed_at?: string | null;
};

type CurrentUserAccessResponse = {
  authUserId: string;
  email: string | null;
  emailConfirmed: boolean;
  profile:
    | (Profile & {
        user_roles?: Array<UserRole & { role: Role | null }>;
        access_review_requests?: AccessReviewRequest[];
      })
    | null;
  roles: Role[];
  permissions: Record<string, boolean>;
  maintenance: SystemMaintenance | null;
};

const accessProbePermissions = appNavigationPermissionKeys;

function isServerUserEmailConfirmed(user: SupabaseAuthUser) {
  return Boolean(user.email_confirmed_at ?? user.confirmed_at);
}

function isMissingRelation(error?: { code?: string; message?: string } | null) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

export async function GET() {
  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await authClient.auth.getUser();

  if (userError) {
    const status = userError.message.toLowerCase().includes("auth session missing") ? 401 : 500;
    return NextResponse.json({ error: userError.message }, { status });
  }

  if (!user) {
    return NextResponse.json({ error: "Sessão não encontrada." }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: profileData, error: profileError } = await admin
    .from("profiles")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  const profile = profileData as Profile | null;
  let userRoles: Array<UserRole & { role: Role | null }> = [];
  let accessReviewRequests: AccessReviewRequest[] = [];
  let maintenance: SystemMaintenance | null = null;
  let permissions = Object.fromEntries(
    accessProbePermissions.map((permissionKey) => [permissionKey, false]),
  ) as Record<string, boolean>;

  if (profile?.id) {
    maintenance = await getSystemMaintenanceState(admin, profile.company_id);

    const { data: userRoleData, error: userRoleError } = await admin
      .from("user_roles")
      .select("*")
      .eq("profile_id", profile.id);

    if (userRoleError) {
      return NextResponse.json({ error: userRoleError.message }, { status: 500 });
    }

    const rawUserRoles = (userRoleData ?? []) as UserRole[];
    const roleIds = Array.from(new Set(rawUserRoles.map((userRole) => userRole.role_id)));
    let rolesById = new Map<string, Role>();

    if (roleIds.length) {
      const { data: roleData, error: roleError } = await admin
        .from("roles")
        .select("*")
        .in("id", roleIds);

      if (roleError) {
        return NextResponse.json({ error: roleError.message }, { status: 500 });
      }

      rolesById = new Map(((roleData ?? []) as Role[]).map((role) => [role.id, role]));
    }

    userRoles = rawUserRoles.map((userRole) => ({
      ...userRole,
      role: rolesById.get(userRole.role_id) ?? null,
    }));

    const { data: requestData, error: requestError } = await admin
      .from("access_review_requests")
      .select("*")
      .eq("profile_id", profile.id);

    if (requestError && !isMissingRelation(requestError)) {
      return NextResponse.json({ error: requestError.message }, { status: 500 });
    }

    accessReviewRequests = (requestData ?? []) as AccessReviewRequest[];
  }

  const profileWithRelations = profile
    ? {
        ...profile,
        user_roles: userRoles,
        access_review_requests: accessReviewRequests,
      }
    : null;

  let roles =
    profileWithRelations?.user_roles
      ?.filter((userRole) => userRole.active !== false && userRole.role?.active)
      .map((userRole) => userRole.role as Role)
      .sort((left, right) => left.name.localeCompare(right.name, "pt-BR")) ?? [];

  if (profileWithRelations?.is_master && roles.length === 0) {
    roles = [
      {
        id: "master-profile",
        company_id: profileWithRelations.company_id,
        name: "Administrador",
        description: "Acesso total",
        is_master_role: true,
        active: true,
      },
    ];
  }

  const isMasterAccess = Boolean(
    profileWithRelations?.is_master || roles.some((role) => role.is_master_role),
  );

  if (isMasterAccess) {
    permissions = Object.fromEntries(
      accessProbePermissions.map((permissionKey) => [permissionKey, true]),
    ) as Record<string, boolean>;
  } else if (profileWithRelations?.status === "active") {
    const checks = await Promise.all(
      accessProbePermissions.map((permissionKey) =>
        authClient.rpc("has_permission", { permission_key: permissionKey }),
      ),
    );

    permissions = Object.fromEntries(
      accessProbePermissions.map((permissionKey, index) => [
        permissionKey,
        Boolean(checks[index].data) && !checks[index].error,
      ]),
    ) as Record<string, boolean>;
  }

  if (profileWithRelations && roles.length === 0) {
    const hasAnyPermission = Object.values(permissions).some(Boolean);

    if (hasAnyPermission) {
      roles = [
        {
          id: "permission-derived",
          company_id: profileWithRelations.company_id,
          name: "Perfil ativo",
          description: "Acesso validado por permissão",
          is_master_role: false,
          active: true,
        },
      ];
    }
  }

  const payload: CurrentUserAccessResponse = {
    authUserId: user.id,
    email: user.email ?? null,
    emailConfirmed: isServerUserEmailConfirmed(user),
    profile: profileWithRelations,
    roles,
    permissions,
    maintenance,
  };

  return NextResponse.json(payload);
}
