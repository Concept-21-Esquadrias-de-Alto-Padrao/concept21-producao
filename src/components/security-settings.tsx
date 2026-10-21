"use client";

import { isTransportPermission, TRANSPORT_ENABLED } from "@/lib/transport-module";

import { FloatingMessage } from "@/components/floating-feedback";

import {
  AlertTriangle,
  Check,
  KeyRound,
  Pencil,
  Loader2,
  Plus,
  Power,
  RotateCcw,
  Save,
  ShieldPlus,
  Trash2,
  UserRound,
  UserX,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { inputClass } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { toUserFriendlyErrorMessage } from "@/lib/errors";
import type {
  AccessReviewRequest,
  Permission,
  Profile,
  Role,
  RolePermission,
  UserRole,
} from "@/lib/types";
import { accentDisplayText, cn } from "@/lib/utils";

type SystemUser = Profile & {
  user_roles?: Array<UserRole & { role: Role | null }>;
  access_review_requests?: AccessReviewRequest[];
};

type SecurityData = {
  roles: Role[];
  permissions: Permission[];
  rolePermissions: RolePermission[];
  users: SystemUser[];
  isMaster: boolean;
  currentProfileId: string | null;
};

type SecurityResponse = Partial<SecurityData> & {
  error?: string;
};

type SecurityActionPayload =
  | { action: "createRole"; name: string; description: string }
  | { action: "updateRole"; roleId: string; name: string; description: string }
  | { action: "deleteRole"; roleId: string }
  | { action: "toggleRole"; roleId: string; active: boolean }
  | { action: "saveRolePermissions"; roleId: string; permissionIds: string[] }
  | { action: "assignRole"; profileId: string; roleId: string }
  | { action: "removeUserRole"; userRoleId: string }
  | { action: "updateProfile"; profileId: string; name: string; email: string; title: string }
  | { action: "resetUserPassword"; profileId: string; password: string }
  | { action: "setProfileStatus"; profileId: string; status: "active" | "inactive" };

type ProfileDraft = {
  name: string;
  email: string;
  title: string;
};

type RoleDraft = {
  name: string;
  description: string;
};

const permissionGroupLabels: Record<string, string> = {
  clients: "Clientes",
  contracts: "Contratos",
  cutting: "Corte",
  dashboard: "Dashboard",
  documents: "Documentos",
  freights: "Fretes",
  geral: "Geral",
  machining: "Usinagem",
  materials: "Materiais",
  packaging: "Embalagem",
  permissions: "Permissões",
  pointing: "Apontamentos",
  preparation_assembly: "Preparação e montagem",
  prods: "PRODs",
  reports: "Relatórios",
  rework: "Retrabalhos",
  settings: "Configurações",
  shipping: "Expedição",
  transport: "Transporte",
};

function permissionGroup(permissionKey: string) {
  const [, group = "geral"] = permissionKey.split(".");
  return permissionGroupLabels[group] ?? accentDisplayText(group.replaceAll("_", " "));
}

function isUserPending(user: SystemUser) {
  const hasRole = user.user_roles?.some(
    (userRole) => userRole.active !== false && userRole.role?.active,
  );
  const hasPendingRequest = user.access_review_requests?.some(
    (request) => request.status === "pending",
  );

  return user.status === "active" && Boolean(user.user_id) && !hasRole && hasPendingRequest;
}

function roleNames(user: SystemUser) {
  const roles = user.user_roles
    ?.filter((userRole) => userRole.active !== false)
    ?.map((userRole) => userRole.role)
    .filter((role): role is Role => Boolean(role));

  return roles?.length
    ? roles.map((role) => roleDisplayName(role)).join(", ")
    : "Nenhum perfil vinculado";
}

function roleDisplayName(role?: Role | null) {
  return accentDisplayText(role?.name ?? "Perfil");
}

function roleDisplayDescription(role?: Role | null) {
  return accentDisplayText(role?.description ?? "Sem descrição");
}

async function postSecurityAction(payload: SecurityActionPayload) {
  const response = await fetch("/api/settings/security", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = (await response.json().catch(() => ({}))) as SecurityResponse;

  if (!response.ok) {
    throw new Error(result.error ?? "Não foi possível salvar as configurações de segurança.");
  }
}

async function loadSecurityData(): Promise<SecurityData> {
  const response = await fetch("/api/settings/security", {
    headers: {
      Accept: "application/json",
    },
  });
  const loadedData = (await response.json().catch(() => ({}))) as SecurityResponse;

  if (!response.ok) {
    throw new Error(loadedData.error ?? "Não foi possível carregar as configurações de segurança.");
  }

  return loadedData as SecurityData;
}

export function SecuritySettings() {
  const resource = useAsyncResource<SecurityData>("settings:security", loadSecurityData);
  const data = resource.data;
  const loading = resource.loading && !data;
  const resourceError = resource.error
    ? toUserFriendlyErrorMessage(resource.error, "Não foi possível carregar as configurações de segurança.")
    : null;
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedRoleId, setSelectedRoleId] = useState("");
  const [draftPermissions, setDraftPermissions] = useState<Record<string, boolean>>({});
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<SystemUser | null>(null);
  const [passwordDraft, setPasswordDraft] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [profileDrafts, setProfileDrafts] = useState<Record<string, ProfileDraft>>({});
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [roleDrafts, setRoleDrafts] = useState<Record<string, RoleDraft>>({});
  const [newRoleName, setNewRoleName] = useState("");
  const [newRoleDescription, setNewRoleDescription] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!data) return;

    const timeout = window.setTimeout(() => {
      setProfileDrafts(
        Object.fromEntries(
          data.users.map((user) => [
            user.id,
            {
              name: accentDisplayText(user.name),
              email: user.email,
              title: accentDisplayText(user.title ?? ""),
            },
          ]),
        ),
      );
      setRoleDrafts(
        Object.fromEntries(
          data.roles.map((role) => [
            role.id,
            {
              name: roleDisplayName(role),
              description: accentDisplayText(role.description ?? ""),
            },
          ]),
        ),
      );
      setSelectedRoleId((currentRoleId) =>
        currentRoleId && data.roles.some((role) => role.id === currentRoleId)
          ? currentRoleId
          : data.roles[0]?.id || "",
      );
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const timeout = window.setTimeout(() => {
      setDraftPermissions(getRolePermissionDraft(data.rolePermissions, selectedRoleId));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [data, selectedRoleId]);

  async function load() {
    setError(null);
    await resource.reload();
  }

  const selectedRole = data?.roles.find((role) => role.id === selectedRoleId) ?? null;
  const pendingUsers = data?.users.filter(isUserPending) ?? [];

  const groupedPermissions = useMemo(() => {
    return (data?.permissions ?? []).reduce<Record<string, Permission[]>>((groups, permission) => {
      if (!TRANSPORT_ENABLED && isTransportPermission(permission.key)) return groups;
      const group = permissionGroup(permission.key);
      groups[group] = [...(groups[group] ?? []), permission];
      return groups;
    }, {});
  }, [data?.permissions]);

  function profileDraftFor(user: SystemUser): ProfileDraft {
    return (
      profileDrafts[user.id] ?? {
        name: accentDisplayText(user.name),
        email: user.email,
        title: accentDisplayText(user.title ?? ""),
      }
    );
  }

  function updateProfileDraft(userId: string, field: keyof ProfileDraft, value: string) {
    setProfileDrafts((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] ?? { name: "", email: "", title: "" }),
        [field]: value,
      },
    }));
  }

  function resetProfileDraft(user: SystemUser) {
    setProfileDrafts((current) => ({
      ...current,
      [user.id]: {
        name: accentDisplayText(user.name),
        email: user.email,
        title: accentDisplayText(user.title ?? ""),
      },
    }));
    setEditingProfileId(null);
  }

  function startProfileEdit(user: SystemUser) {
    setProfileDrafts((current) => ({
      ...current,
      [user.id]: {
        name: accentDisplayText(user.name),
        email: user.email,
        title: accentDisplayText(user.title ?? ""),
      },
    }));
    setEditingProfileId(user.id);
  }

  function roleDraftFor(role: Role): RoleDraft {
    return (
      roleDrafts[role.id] ?? {
        name: roleDisplayName(role),
        description: accentDisplayText(role.description ?? ""),
      }
    );
  }

  function updateRoleDraft(roleId: string, field: keyof RoleDraft, value: string) {
    setRoleDrafts((current) => ({
      ...current,
      [roleId]: {
        ...(current[roleId] ?? { name: "", description: "" }),
        [field]: value,
      },
    }));
  }

  function resetRoleDraft(role: Role) {
    setRoleDrafts((current) => ({
      ...current,
      [role.id]: {
        name: roleDisplayName(role),
        description: accentDisplayText(role.description ?? ""),
      },
    }));
    setEditingRoleId(null);
  }

  function startRoleEdit(role: Role) {
    setRoleDrafts((current) => ({
      ...current,
      [role.id]: {
        name: roleDisplayName(role),
        description: accentDisplayText(role.description ?? ""),
      },
    }));
    setEditingRoleId(role.id);
    selectRole(role.id);
  }

  function selectRole(roleId: string) {
    setSelectedRoleId(roleId);
    setDraftPermissions(getRolePermissionDraft(data?.rolePermissions ?? [], roleId));
  }

  async function runMutation(action: () => Promise<void>, successMessage: string) {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await action();
      setMessage(successMessage);
      await load();
    } catch (mutationError) {
      setError(toUserFriendlyErrorMessage(mutationError, "Não foi possível salvar."));
    } finally {
      setSaving(false);
    }
  }

  async function createRole() {
    if (!data?.isMaster) {
      setError("Somente usuários administradores podem criar perfis de acesso.");
      return;
    }

    if (!newRoleName.trim()) {
      setError("Informe o nome do perfil de acesso.");
      return;
    }

    await runMutation(async () => {
      await postSecurityAction({
        action: "createRole",
        name: newRoleName.trim(),
        description: newRoleDescription.trim(),
      });
      setNewRoleName("");
      setNewRoleDescription("");
    }, "Perfil de acesso criado.");
  }

  async function updateRole(role: Role) {
    if (!data?.isMaster) {
      setError("Somente usuários administradores podem alterar perfis de acesso.");
      return;
    }

    if (role.is_master_role) {
      setError("O perfil Administrador é protegido.");
      return;
    }

    const draft = roleDraftFor(role);

    if (!draft.name.trim()) {
      setError("Informe o nome do perfil de acesso.");
      return;
    }

    await runMutation(async () => {
      await postSecurityAction({
        action: "updateRole",
        roleId: role.id,
        name: draft.name.trim(),
        description: draft.description.trim(),
      });
      setEditingRoleId(null);
    }, "Perfil de acesso atualizado.");
  }

  async function deleteRole(role: Role) {
    if (!data?.isMaster) {
      setError("Somente usuários administradores podem excluir perfis de acesso.");
      return;
    }

    if (role.is_master_role) {
      setError("O perfil Administrador é protegido.");
      return;
    }

    const confirmed = window.confirm(
      `Excluir o perfil de acesso "${roleDisplayName(role)}"? Os vínculos e permissões desse perfil também serão removidos.`,
    );

    if (!confirmed) return;

    await runMutation(async () => {
      await postSecurityAction({
        action: "deleteRole",
        roleId: role.id,
      });
      if (selectedRoleId === role.id) {
        setSelectedRoleId("");
      }
      setEditingRoleId(null);
    }, "Perfil de acesso excluído.");
  }

  async function toggleRole(role: Role) {
    if (!data?.isMaster) {
      setError("Somente usuários administradores podem alterar perfis de acesso.");
      return;
    }

    if (role.is_master_role) {
      setError("O perfil Administrador é protegido.");
      return;
    }

    await runMutation(async () => {
      await postSecurityAction({
        action: "toggleRole",
        roleId: role.id,
        active: !role.active,
      });
    }, role.active ? "Perfil inativado." : "Perfil reativado.");
  }

  async function saveRolePermissions() {
    if (!selectedRole) return;

    if (!data?.isMaster) {
      setError("Somente usuários administradores podem alterar a matriz de permissões.");
      return;
    }

    if (selectedRole.is_master_role) {
      setError("O perfil Administrador é protegido.");
      return;
    }

    await runMutation(async () => {
      const permissionIds = Object.entries(draftPermissions)
        .filter(([, granted]) => granted)
        .map(([permissionId]) => permissionId);

      await postSecurityAction({
        action: "saveRolePermissions",
        roleId: selectedRole.id,
        permissionIds,
      });
    }, "Matriz de permissões salva.");
  }

  async function assignRole(user: SystemUser, roleId: string) {
    if (!roleId) return;

    await runMutation(async () => {
      await postSecurityAction({
        action: "assignRole",
        profileId: user.id,
        roleId,
      });
    }, "Perfil vinculado ao usuário.");
  }

  async function removeUserRole(userRoleId: string) {
    await runMutation(async () => {
      await postSecurityAction({
        action: "removeUserRole",
        userRoleId,
      });
    }, "Perfil removido do usuário.");
  }

  async function updateProfile(user: SystemUser) {
    if (!data?.isMaster) {
      setError("Somente usuários administradores podem alterar usuários.");
      return;
    }

    const draft = profileDraftFor(user);

    if (!draft.name.trim() || !draft.email.trim()) {
      setError("Informe nome e e-mail do usuário.");
      return;
    }

    await runMutation(async () => {
      await postSecurityAction({
        action: "updateProfile",
        profileId: user.id,
        name: draft.name.trim(),
        email: draft.email.trim(),
        title: draft.title.trim(),
      });
      setEditingProfileId(null);
    }, "Usuário atualizado.");
  }

  function closePasswordReset() {
    setPasswordResetUser(null);
    setPasswordDraft("");
    setPasswordConfirmation("");
  }

  function startPasswordReset(user: SystemUser) {
    if (!data?.isMaster) {
      setError("Somente usuários administradores podem redefinir senhas.");
      return;
    }

    if (!user.user_id) {
      setError("Este cadastro não possui usuário Auth vinculado.");
      return;
    }

    setError(null);
    setPasswordDraft("");
    setPasswordConfirmation("");
    setPasswordResetUser(user);
  }

  async function resetUserPassword() {
    if (!data?.isMaster || !passwordResetUser) {
      setError("Somente usuários administradores podem redefinir senhas.");
      return;
    }

    if (!passwordResetUser.user_id) {
      setError("Este cadastro não possui usuário Auth vinculado.");
      return;
    }

    if (passwordDraft.length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    if (passwordDraft !== passwordConfirmation) {
      setError("A confirmação de senha não confere.");
      return;
    }

    const targetUser = passwordResetUser;

    await runMutation(async () => {
      await postSecurityAction({
        action: "resetUserPassword",
        profileId: targetUser.id,
        password: passwordDraft,
      });
      closePasswordReset();
    }, "Senha redefinida. O usuário já pode entrar com a nova senha.");
  }

  async function setProfileStatus(user: SystemUser, status: "active" | "inactive") {
    await runMutation(async () => {
      await postSecurityAction({
        action: "setProfileStatus",
        profileId: user.id,
        status,
      });
    }, status === "active" ? "Usuário reativado." : "Usuário inativado.");
  }

  async function deleteUser(user: SystemUser) {
    const pending = isUserPending(user);
    const confirmed = window.confirm(
      pending
        ? `Recusar e excluir o cadastro de ${user.name}? Esta ação remove o usuário do Auth e apaga o profile vinculado.`
        : `Excluir definitivamente o cadastro de ${user.name}? Esta ação remove o usuário do Auth e apaga o profile vinculado.`,
    );

    if (!confirmed) return;

    await runMutation(async () => {
      const response = await fetch("/api/access-requests/reject", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ profileId: user.id }),
      });

      const payload = (await response.json().catch(() => ({}))) as { error?: string };

      if (!response.ok) {
        throw new Error(
          toUserFriendlyErrorMessage(payload.error, "Não foi possível excluir o cadastro."),
        );
      }
    }, pending ? "Cadastro recusado e excluído." : "Cadastro excluído.");
  }

  if (loading) {
    return (
      <Panel>
        <PanelBody className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando segurança e acessos...
        </PanelBody>
      </Panel>
    );
  }

  if (!data) {
    return (
      <Panel>
        <PanelBody>
          <EmptyState
            icon={AlertTriangle}
            title="Segurança indisponível"
            description={error ?? resourceError ?? "Não foi possível carregar os dados de acesso."}
          />
        </PanelBody>
      </Panel>
    );
  }

  return (
    <div className="space-y-5">
      <FloatingMessage message={error ?? resourceError} />

      <FloatingMessage message={message} kind="success" />

      {passwordResetUser ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/35 p-4">
          <div className="w-full max-w-lg rounded-md border border-border bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-border p-4">
              <div>
                <p className="text-lg font-semibold text-charcoal">Redefinir senha</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {accentDisplayText(passwordResetUser.name)} · {passwordResetUser.email}
                </p>
              </div>
              <button
                type="button"
                onClick={closePasswordReset}
                disabled={saving}
                className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground hover:border-orange-200 hover:text-accent disabled:opacity-60"
                title="Fechar"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-4 p-4">
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                Defina uma senha temporária e informe ao usuário por um canal seguro. A senha não será exibida nem armazenada no sistema.
              </div>
              <label className="space-y-1 text-sm font-semibold text-charcoal">
                Nova senha
                <input
                  className={inputClass}
                  type="password"
                  value={passwordDraft}
                  onChange={(event) => setPasswordDraft(event.target.value)}
                  placeholder="Mínimo de 6 caracteres"
                  autoComplete="new-password"
                />
              </label>
              <label className="space-y-1 text-sm font-semibold text-charcoal">
                Confirmar nova senha
                <input
                  className={inputClass}
                  type="password"
                  value={passwordConfirmation}
                  onChange={(event) => setPasswordConfirmation(event.target.value)}
                  placeholder="Repita a nova senha"
                  autoComplete="new-password"
                />
              </label>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <button
                  type="button"
                  onClick={closePasswordReset}
                  disabled={saving}
                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-border px-4 text-sm font-semibold text-muted-foreground hover:border-orange-200 hover:text-accent disabled:opacity-60"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={resetUserPassword}
                  disabled={saving}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-foreground hover:bg-orange-500 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}
                  Redefinir senha
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <Panel>
        <PanelHeader
          title="Usuários do sistema"
          description="Cadastros confirmados sem perfil ficam pendentes até o Administrador vincular um perfil de acesso."
        />
        <PanelBody className="space-y-4">
          {pendingUsers.length ? (
            <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
              <div className="flex gap-3">
                <AlertTriangle className="mt-0.5 size-5 flex-none" />
                <div>
                  <p className="font-semibold">
                    {pendingUsers.length} cadastro(s) aguardando perfil de acesso.
                  </p>
                  <p className="mt-1">
                    Vincule um perfil para liberar acesso ou recuse para excluir o cadastro.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-separate border-spacing-0 text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="border-b border-border px-3 py-2 font-semibold">Usuário</th>
                  <th className="border-b border-border px-3 py-2 font-semibold">Perfis</th>
                  <th className="border-b border-border px-3 py-2 font-semibold">Status</th>
                  <th className="border-b border-border px-3 py-2 font-semibold">Vincular</th>
                  <th className="border-b border-border px-3 py-2 font-semibold">Ações</th>
                </tr>
              </thead>
              <tbody>
                {data.users.map((user) => {
                  const profileDraft = profileDraftFor(user);
                  const isEditingProfile = editingProfileId === user.id;

                  return (
                  <tr key={user.id} className="align-top">
                    <td className="border-b border-border px-3 py-3">
                      <div className="flex items-start gap-3">
                        <div className="grid size-9 flex-none place-items-center rounded-full bg-zinc-100 text-zinc-600">
                          <UserRound className="size-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-semibold text-charcoal">{user.name}</p>
                            {isUserPending(user) ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[11px] font-semibold text-orange-800">
                                <AlertTriangle className="size-3" />
                                Pendente
                              </span>
                            ) : null}
                          </div>
                          <p className="text-xs text-muted-foreground">{user.email}</p>
                          {user.title ? (
                            <p className="text-xs text-muted-foreground">
                              {accentDisplayText(user.title)}
                            </p>
                          ) : null}
                          <p className="break-all font-mono text-[11px] text-zinc-400">
                            {user.user_id ? `Auth: ${user.user_id}` : "Sem usuário Auth vinculado"}
                          </p>
                          {isEditingProfile ? (
                            <div className="mt-3 grid gap-2 sm:grid-cols-2">
                              <label className="space-y-1 text-xs font-semibold text-charcoal">
                                Nome
                                <input
                                  className={inputClass}
                                  value={profileDraft.name}
                                  onChange={(event) =>
                                    updateProfileDraft(user.id, "name", event.target.value)
                                  }
                                />
                              </label>
                              <label className="space-y-1 text-xs font-semibold text-charcoal">
                                E-mail
                                <input
                                  className={inputClass}
                                  type="email"
                                  value={profileDraft.email}
                                  onChange={(event) =>
                                    updateProfileDraft(user.id, "email", event.target.value)
                                  }
                                />
                              </label>
                              <label className="space-y-1 text-xs font-semibold text-charcoal sm:col-span-2">
                                Cargo/função
                                <input
                                  className={inputClass}
                                  value={profileDraft.title}
                                  onChange={(event) =>
                                    updateProfileDraft(user.id, "title", event.target.value)
                                  }
                                />
                              </label>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-border px-3 py-3">
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground">{roleNames(user)}</p>
                        <div className="flex flex-wrap gap-2">
                          {user.user_roles?.map((userRole) => (
                            <button
                              key={userRole.id}
                              type="button"
                              onClick={() => removeUserRole(userRole.id)}
                              disabled={saving}
                              className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-1 text-xs font-medium text-zinc-700 transition hover:border-red-200 hover:text-red-700 disabled:opacity-60"
                              title="Remover perfil"
                            >
                              {roleDisplayName(userRole.role)}
                              <Trash2 className="size-3" />
                            </button>
                          ))}
                        </div>
                      </div>
                    </td>
                    <td className="border-b border-border px-3 py-3">
                      <span
                        className={cn(
                          "inline-flex rounded-md px-2 py-1 text-xs font-semibold ring-1",
                          user.status === "active"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-zinc-100 text-zinc-700 ring-zinc-200",
                        )}
                      >
                        {isUserPending(user)
                          ? "Pendente"
                          : user.status === "active"
                            ? "Ativo"
                            : "Inativo"}
                      </span>
                    </td>
                    <td className="border-b border-border px-3 py-3">
                      <select
                        className="min-h-10 w-full rounded-md border border-border bg-white px-3 text-sm outline-none focus:border-accent"
                        defaultValue=""
                        disabled={saving || user.status !== "active"}
                        onChange={(event) => {
                          const roleId = event.target.value;
                          event.target.value = "";
                          void assignRole(user, roleId);
                        }}
                      >
                        <option value="">Selecionar perfil</option>
                        {data.roles
                          .filter((role) => role.active)
                          .map((role) => (
                            <option key={role.id} value={role.id}>
                              {roleDisplayName(role)}
                            </option>
                          ))}
                      </select>
                    </td>
                    <td className="border-b border-border px-3 py-3">
                      <div className="flex gap-2">
                        {isEditingProfile ? (
                          <>
                            <button
                              type="button"
                              onClick={() => updateProfile(user)}
                              disabled={saving}
                              className="grid size-9 place-items-center rounded-md border border-emerald-200 text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                              title="Salvar usuário"
                            >
                              <Save className="size-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => resetProfileDraft(user)}
                              disabled={saving}
                              className="grid size-9 place-items-center rounded-md border border-zinc-200 text-zinc-600 hover:border-orange-200 hover:text-accent disabled:opacity-60"
                              title="Cancelar edição"
                            >
                              <X className="size-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            onClick={() => startProfileEdit(user)}
                            disabled={saving || !data.isMaster}
                            className="grid size-9 place-items-center rounded-md border border-zinc-200 text-zinc-600 hover:border-orange-200 hover:text-accent disabled:opacity-60"
                            title="Editar usuário"
                          >
                            <Pencil className="size-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => startPasswordReset(user)}
                          disabled={saving || !data.isMaster || !user.user_id}
                          className="grid size-9 place-items-center rounded-md border border-zinc-200 text-zinc-600 hover:border-orange-200 hover:text-accent disabled:opacity-60"
                          title={
                            user.user_id
                              ? "Redefinir senha"
                              : "Cadastro sem usuário Auth vinculado"
                          }
                        >
                          <KeyRound className="size-4" />
                        </button>
                        {data.isMaster && user.id !== data.currentProfileId ? (
                          <button
                            type="button"
                            onClick={() => deleteUser(user)}
                            disabled={saving}
                            className="grid size-9 place-items-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
                            title={isUserPending(user) ? "Recusar e excluir cadastro" : "Excluir cadastro"}
                          >
                            <UserX className="size-4" />
                          </button>
                        ) : null}
                        <button
                          type="button"
                          onClick={() =>
                            setProfileStatus(user, user.status === "active" ? "inactive" : "active")
                          }
                          disabled={saving || (user.id === data.currentProfileId && user.status === "active")}
                          className="grid size-9 place-items-center rounded-md border border-zinc-200 text-zinc-600 hover:border-orange-200 hover:text-accent disabled:opacity-60"
                          title={
                            user.id === data.currentProfileId && user.status === "active"
                              ? "Você não pode inativar o próprio cadastro"
                              : user.status === "active"
                                ? "Inativar usuário"
                                : "Reativar usuário"
                          }
                        >
                          {user.status === "active" ? (
                            <Power className="size-4" />
                          ) : (
                            <RotateCcw className="size-4" />
                          )}
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </PanelBody>
      </Panel>

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <Panel>
          <PanelHeader
            title="Perfis de acesso"
            description="Crie perfis operacionais e vincule permissões na matriz."
          />
          <PanelBody className="space-y-4">
            <div className="space-y-2">
              {data.roles.map((role) => {
                const roleDraft = roleDraftFor(role);
                const isEditingRole = editingRoleId === role.id;

                return (
                  <div
                    key={role.id}
                    className={cn(
                      "rounded-md border border-border bg-white p-2",
                      selectedRoleId === role.id && "border-accent ring-2 ring-orange-100",
                    )}
                  >
                    {isEditingRole ? (
                      <div className="space-y-2">
                        <input
                          className={inputClass}
                          value={roleDraft.name}
                          onChange={(event) =>
                            updateRoleDraft(role.id, "name", event.target.value)
                          }
                          placeholder="Nome do perfil"
                        />
                        <textarea
                          className={`${inputClass} min-h-16 resize-y`}
                          value={roleDraft.description}
                          onChange={(event) =>
                            updateRoleDraft(role.id, "description", event.target.value)
                          }
                          placeholder="Descrição"
                        />
                        <div className="flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => updateRole(role)}
                            disabled={saving}
                            className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-emerald-200 px-3 text-sm font-semibold text-emerald-700 hover:bg-emerald-50 disabled:opacity-60"
                          >
                            <Save className="size-4" />
                            Salvar
                          </button>
                          <button
                            type="button"
                            onClick={() => resetRoleDraft(role)}
                            disabled={saving}
                            className="grid size-9 place-items-center rounded-md border border-zinc-200 text-zinc-600 hover:border-orange-200 hover:text-accent disabled:opacity-60"
                            title="Cancelar edição"
                          >
                            <X className="size-4" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => selectRole(role.id)}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-sm font-semibold text-charcoal">
                            {roleDisplayName(role)}
                          </p>
                          <p className="truncate text-xs text-muted-foreground">
                            {roleDisplayDescription(role)}
                          </p>
                        </button>
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => startRoleEdit(role)}
                            disabled={saving || role.is_master_role || !data.isMaster}
                            className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground hover:border-orange-200 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                            title="Editar perfil"
                          >
                            <Pencil className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteRole(role)}
                            disabled={saving || role.is_master_role || !data.isMaster}
                            className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground hover:border-red-200 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-50"
                            title="Excluir perfil"
                          >
                            <Trash2 className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => toggleRole(role)}
                            disabled={saving || role.is_master_role || !data.isMaster}
                            className="grid size-9 place-items-center rounded-md border border-border text-muted-foreground hover:border-orange-200 hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                            title={role.active ? "Inativar perfil" : "Reativar perfil"}
                          >
                            {role.active ? (
                              <Power className="size-4" />
                            ) : (
                              <RotateCcw className="size-4" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="rounded-md border border-border bg-muted/30 p-3">
              <p className="mb-3 text-sm font-semibold text-charcoal">Novo perfil de acesso</p>
              <div className="space-y-3">
                <input
                  className={inputClass}
                  value={newRoleName}
                  onChange={(event) => setNewRoleName(event.target.value)}
                  placeholder="Nome do perfil"
                />
                <textarea
                  className={`${inputClass} min-h-20 resize-y`}
                  value={newRoleDescription}
                  onChange={(event) => setNewRoleDescription(event.target.value)}
                  placeholder="Descrição"
                />
                <button
                  type="button"
                  onClick={createRole}
                  disabled={saving || !data.isMaster}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500 disabled:opacity-60"
                >
                  <Plus className="size-4" />
                  Criar perfil
                </button>
              </div>
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Matriz de permissões"
            description="Marque as permissões liberadas para o perfil selecionado. O perfil Administrador permanece protegido."
            actions={
              <button
                type="button"
                onClick={saveRolePermissions}
                disabled={saving || !selectedRole || selectedRole.is_master_role || !data.isMaster}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                {!data.isMaster
                  ? "Somente Administrador"
                  : selectedRole?.is_master_role
                    ? "Administrador protegido"
                    : "Salvar matriz"}
              </button>
            }
          />
          <PanelBody className="space-y-5">
            {selectedRole ? (
              <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                <div className="flex items-center gap-2 font-semibold text-charcoal">
                  <ShieldPlus className="size-4 text-accent" />
                  {roleDisplayName(selectedRole)}
                </div>
                <p className="mt-1 text-muted-foreground">
                  {accentDisplayText(selectedRole.description ?? "Perfil sem descrição.")}
                </p>
              </div>
            ) : null}

            <div className="space-y-4">
              {Object.entries(groupedPermissions).map(([group, permissions]) => (
                <div key={group} className="rounded-md border border-border">
                  <div className="border-b border-border bg-muted/40 px-3 py-2">
                    <p className="text-xs font-semibold uppercase text-accent">{group}</p>
                  </div>
                  <div className="divide-y divide-border">
                    {permissions.map((permission) => {
                      const lockedPermission =
                        permission.key === "production.permissions.manage" &&
                        !selectedRole?.is_master_role;

                      return (
                        <label
                          key={permission.id}
                          className={cn(
                            "grid gap-3 px-3 py-3 text-sm sm:grid-cols-[1fr_auto]",
                            lockedPermission && "bg-zinc-50 opacity-70",
                          )}
                        >
                          <span>
                            <span className="block font-medium text-charcoal">{permission.key}</span>
                            <span className="block text-xs text-muted-foreground">
                              {accentDisplayText(permission.description)}
                            </span>
                          </span>
                          <span className="inline-flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={Boolean(draftPermissions[permission.id])}
                              disabled={
                                !selectedRole ||
                                selectedRole.is_master_role ||
                                lockedPermission ||
                                saving ||
                                !data.isMaster
                              }
                              onChange={(event) =>
                                setDraftPermissions((current) => ({
                                  ...current,
                                  [permission.id]: event.target.checked,
                                }))
                              }
                              className="size-4 rounded border-border"
                            />
                            <span className="text-xs font-semibold text-muted-foreground">
                              {draftPermissions[permission.id] ? (
                                <span className="inline-flex items-center gap-1 text-emerald-700">
                                  <Check className="size-3" />
                                  Liberado
                                </span>
                              ) : (
                                "Restrito"
                              )}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}

function getRolePermissionDraft(rolePermissions: RolePermission[], roleId: string) {
  return Object.fromEntries(
    rolePermissions
      .filter((rolePermission) => rolePermission.role_id === roleId)
      .map((rolePermission) => [rolePermission.permission_id, true] as const),
  );
}
