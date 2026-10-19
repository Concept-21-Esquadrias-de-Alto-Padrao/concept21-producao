import { NextResponse } from "next/server";
import {
  getErrorMessage,
  getHttpStatus,
  HttpError,
  isMissingRelation,
  requireMasterAccess,
  type MasterAccessContext,
} from "@/lib/server-access";
import type {
  AccessReviewRequest,
  Permission,
  Profile,
  Role,
  RolePermission,
  UserRole,
} from "@/lib/types";

type SystemUser = Profile & {
  user_roles: Array<UserRole & { role: Role | null }>;
  access_review_requests: AccessReviewRequest[];
};

type SecurityActionBody = Record<string, unknown> & {
  action?: string;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function bool(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function jsonError(error: unknown, fallback: string) {
  return NextResponse.json(
    { error: getErrorMessage(error, fallback) },
    { status: getHttpStatus(error) },
  );
}

function sortUsers(users: SystemUser[]) {
  return [...users].sort((left, right) => {
    const leftPending = isUserPending(left) ? 0 : 1;
    const rightPending = isUserPending(right) ? 0 : 1;
    if (leftPending !== rightPending) return leftPending - rightPending;
    return left.name.localeCompare(right.name, "pt-BR");
  });
}

function isUserPending(user: SystemUser) {
  const hasRole = user.user_roles.some((userRole) => userRole.role?.active);
  const hasPendingRequest = user.access_review_requests.some(
    (request) => request.status === "pending",
  );

  return user.status === "active" && Boolean(user.user_id) && !hasRole && hasPendingRequest;
}

async function loadSecurityData(context: MasterAccessContext) {
  const [
    roles,
    permissions,
    rolePermissions,
    profiles,
    userRoles,
    accessRequests,
  ] = await Promise.all([
    context.admin
      .from("roles")
      .select("*")
      .eq("company_id", context.profile.company_id)
      .order("name", { ascending: true }),
    context.admin.from("permissions").select("*").order("key", { ascending: true }),
    context.admin
      .from("role_permissions")
      .select("*")
      .eq("company_id", context.profile.company_id),
    context.admin
      .from("profiles")
      .select("*")
      .eq("company_id", context.profile.company_id)
      .order("name", { ascending: true }),
    context.admin
      .from("user_roles")
      .select("*")
      .eq("company_id", context.profile.company_id),
    context.admin
      .from("access_review_requests")
      .select("*")
      .eq("company_id", context.profile.company_id),
  ]);

  const queryError = [
    roles.error,
    permissions.error,
    rolePermissions.error,
    profiles.error,
    userRoles.error,
    accessRequests.error && !isMissingRelation(accessRequests.error)
      ? accessRequests.error
      : null,
  ].find(Boolean);

  if (queryError) {
    throw new HttpError(500, queryError.message);
  }

  const loadedRoles = (roles.data ?? []) as Role[];
  const rolesById = new Map(loadedRoles.map((role) => [role.id, role]));

  const userRolesByProfile = new Map<string, Array<UserRole & { role: Role | null }>>();
  ((userRoles.data ?? []) as UserRole[]).forEach((userRole) => {
    const existing = userRolesByProfile.get(userRole.profile_id) ?? [];
    existing.push({
      ...userRole,
      role: rolesById.get(userRole.role_id) ?? null,
    });
    userRolesByProfile.set(userRole.profile_id, existing);
  });

  const requestsByProfile = new Map<string, AccessReviewRequest[]>();
  ((accessRequests.data ?? []) as AccessReviewRequest[]).forEach((requestItem) => {
    const existing = requestsByProfile.get(requestItem.profile_id) ?? [];
    existing.push(requestItem);
    requestsByProfile.set(requestItem.profile_id, existing);
  });

  const users = ((profiles.data ?? []) as Profile[]).map<SystemUser>((profile) => ({
    ...profile,
    user_roles: userRolesByProfile.get(profile.id) ?? [],
    access_review_requests: requestsByProfile.get(profile.id) ?? [],
  }));

  return {
    roles: loadedRoles,
    permissions: (permissions.data ?? []) as Permission[],
    rolePermissions: (rolePermissions.data ?? []) as RolePermission[],
    users: sortUsers(users),
    isMaster: true,
    currentProfileId: context.profile.id,
  };
}

async function findRole(context: MasterAccessContext, roleId: string) {
  const { data, error } = await context.admin
    .from("roles")
    .select("*")
    .eq("company_id", context.profile.company_id)
    .eq("id", roleId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Perfil de acesso não encontrado.");

  return data as Role;
}

async function findProfile(context: MasterAccessContext, profileId: string) {
  const { data, error } = await context.admin
    .from("profiles")
    .select("*")
    .eq("company_id", context.profile.company_id)
    .eq("id", profileId)
    .maybeSingle();

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(404, "Usuário não encontrado.");

  return data as Profile;
}

async function approvePendingAccessRequest(context: MasterAccessContext, profileId: string) {
  const { data, error } = await context.admin
    .from("access_review_requests")
    .update({
      status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: context.authUserId,
    })
    .eq("company_id", context.profile.company_id)
    .eq("profile_id", profileId)
    .eq("status", "pending")
    .select("id");

  if (error) {
    if (isMissingRelation(error)) return;
    throw new HttpError(500, error.message);
  }

  const requestIds = ((data ?? []) as Array<{ id: string }>).map((requestItem) => requestItem.id);

  if (!requestIds.length) return;

  const { error: notificationError } = await context.admin
    .from("platform_notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("entity", "access_review_request")
    .in("entity_id", requestIds);

  if (notificationError && !isMissingRelation(notificationError)) {
    throw new HttpError(500, notificationError.message);
  }
}

export async function GET() {
  try {
    const context = await requireMasterAccess();
    const data = await loadSecurityData(context);

    return NextResponse.json(data);
  } catch (error) {
    return jsonError(error, "Não foi possível carregar as configurações de segurança.");
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireMasterAccess();
    const body = (await request.json().catch(() => ({}))) as SecurityActionBody;

    switch (body.action) {
      case "createRole": {
        const name = text(body.name);
        const description = text(body.description);

        if (!name) throw new HttpError(400, "Informe o nome do perfil de acesso.");

        const { error } = await context.admin.from("roles").insert({
          company_id: context.profile.company_id,
          name,
          description: description || null,
          is_master_role: false,
          active: true,
        });

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "updateRole": {
        const roleId = text(body.roleId);
        const name = text(body.name);
        const description = text(body.description);

        if (!roleId || !name) {
          throw new HttpError(400, "Informe o perfil de acesso e o nome atualizado.");
        }

        const role = await findRole(context, roleId);

        if (role.is_master_role) {
          throw new HttpError(400, "O perfil Administrador é protegido.");
        }

        const { error } = await context.admin
          .from("roles")
          .update({
            name,
            description: description || null,
          })
          .eq("id", role.id);

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "toggleRole": {
        const roleId = text(body.roleId);
        const active = bool(body.active);

        if (!roleId || active === null) {
          throw new HttpError(400, "Dados inválidos para alterar o perfil.");
        }

        const role = await findRole(context, roleId);

        if (role.is_master_role) {
          throw new HttpError(400, "O perfil Administrador é protegido.");
        }

        const { error } = await context.admin
          .from("roles")
          .update({ active })
          .eq("id", role.id);

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "deleteRole": {
        const roleId = text(body.roleId);
        if (!roleId) throw new HttpError(400, "Perfil de acesso inválido.");

        const role = await findRole(context, roleId);

        if (role.is_master_role) {
          throw new HttpError(400, "O perfil Administrador é protegido.");
        }

        const { error } = await context.admin.from("roles").delete().eq("id", role.id);
        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "saveRolePermissions": {
        const roleId = text(body.roleId);
        const permissionIds = Array.isArray(body.permissionIds)
          ? body.permissionIds.filter((permissionId): permissionId is string => typeof permissionId === "string")
          : [];

        if (!roleId) throw new HttpError(400, "Perfil de acesso inválido.");

        const role = await findRole(context, roleId);

        if (role.is_master_role) {
          throw new HttpError(400, "O perfil Administrador é protegido.");
        }

        const { error: deleteError } = await context.admin
          .from("role_permissions")
          .delete()
          .eq("role_id", role.id);

        if (deleteError) throw new HttpError(500, deleteError.message);

        if (permissionIds.length) {
          const grants = permissionIds.map((permissionId) => ({
            company_id: context.profile.company_id,
            role_id: role.id,
            permission_id: permissionId,
          }));

          const { error: insertError } = await context.admin
            .from("role_permissions")
            .insert(grants);

          if (insertError) throw new HttpError(500, insertError.message);
        }
        break;
      }

      case "assignRole": {
        const profileId = text(body.profileId);
        const roleId = text(body.roleId);

        if (!profileId || !roleId) {
          throw new HttpError(400, "Informe o usuário e o perfil de acesso.");
        }

        const [targetProfile, targetRole] = await Promise.all([
          findProfile(context, profileId),
          findRole(context, roleId),
        ]);

        if (!targetRole.active) {
          throw new HttpError(400, "Este perfil de acesso está inativo.");
        }

        const { error } = await context.admin.from("user_roles").upsert(
          {
            company_id: context.profile.company_id,
            profile_id: targetProfile.id,
            role_id: targetRole.id,
          },
          { onConflict: "profile_id,role_id" },
        );

        if (error) throw new HttpError(500, error.message);

        await approvePendingAccessRequest(context, targetProfile.id);
        break;
      }

      case "removeUserRole": {
        const userRoleId = text(body.userRoleId);
        if (!userRoleId) throw new HttpError(400, "Vínculo de perfil inválido.");

        const { data: userRoleData, error: userRoleError } = await context.admin
          .from("user_roles")
          .select("*")
          .eq("company_id", context.profile.company_id)
          .eq("id", userRoleId)
          .maybeSingle();

        if (userRoleError) throw new HttpError(500, userRoleError.message);
        if (!userRoleData) throw new HttpError(404, "Vínculo de perfil não encontrado.");

        const userRole = userRoleData as UserRole;
        const role = await findRole(context, userRole.role_id);

        if (userRole.profile_id === context.profile.id && role.is_master_role) {
          throw new HttpError(400, "Você não pode remover o próprio perfil Administrador.");
        }

        const { error } = await context.admin.from("user_roles").delete().eq("id", userRole.id);
        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "updateProfile": {
        const profileId = text(body.profileId);
        const name = text(body.name);
        const email = text(body.email);
        const title = text(body.title);

        if (!profileId || !name || !email) {
          throw new HttpError(400, "Informe o usuário, nome e e-mail atualizados.");
        }

        const targetProfile = await findProfile(context, profileId);

        const { error } = await context.admin
          .from("profiles")
          .update({
            name,
            email,
            title: title || null,
          })
          .eq("id", targetProfile.id);

        if (error) throw new HttpError(500, error.message);

        const { error: requestError } = await context.admin
          .from("access_review_requests")
          .update({ name, email })
          .eq("company_id", context.profile.company_id)
          .eq("profile_id", targetProfile.id);

        if (requestError && !isMissingRelation(requestError)) {
          throw new HttpError(500, requestError.message);
        }

        break;
      }

      case "resetUserPassword": {
        const profileId = text(body.profileId);
        const password = text(body.password);

        if (!profileId || password.length < 6) {
          throw new HttpError(400, "Informe o usuário e uma senha com pelo menos 6 caracteres.");
        }

        const targetProfile = await findProfile(context, profileId);

        if (!targetProfile.user_id) {
          throw new HttpError(400, "Este cadastro não possui usuário Auth vinculado.");
        }

        const { error } = await context.admin.auth.admin.updateUserById(targetProfile.user_id, {
          password,
        });

        if (error) throw new HttpError(500, error.message);

        const { error: auditError } = await context.admin.from("audit_logs").insert({
          company_id: context.profile.company_id,
          entity: "profiles",
          entity_id: targetProfile.id,
          action: "password_reset",
          user_id: context.authUserId,
          after_data: {
            profile_id: targetProfile.id,
            auth_user_id: targetProfile.user_id,
            email: targetProfile.email,
          },
          notes: `Senha redefinida pelo Administrador para ${targetProfile.name}.`,
        });

        if (auditError && !isMissingRelation(auditError)) {
          throw new HttpError(500, auditError.message);
        }

        break;
      }

      case "setProfileStatus": {
        const profileId = text(body.profileId);
        const status = text(body.status);

        if (!profileId || (status !== "active" && status !== "inactive")) {
          throw new HttpError(400, "Dados inválidos para alterar o usuário.");
        }

        const targetProfile = await findProfile(context, profileId);

        if (targetProfile.id === context.profile.id && status === "inactive") {
          throw new HttpError(400, "Você não pode inativar o próprio cadastro.");
        }

        const { error } = await context.admin
          .from("profiles")
          .update({ status })
          .eq("id", targetProfile.id);

        if (error) throw new HttpError(500, error.message);
        break;
      }

      default:
        throw new HttpError(400, "Ação de segurança inválida.");
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, "Não foi possível salvar as configurações de segurança.");
  }
}
