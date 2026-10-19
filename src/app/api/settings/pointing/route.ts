import { NextResponse } from "next/server";
import {
  getErrorMessage,
  getHttpStatus,
  HttpError,
  requireAuthenticatedProfile,
  type AuthenticatedProfileContext,
} from "@/lib/server-access";
import { isValidOperatorPin, isValidOperatorRegistration } from "@/lib/operator-credentials";
import { getPointingStages } from "@/lib/pointing";
import type {
  PointingReasonKind,
  ProductionOperator,
  ProductionOperatorStage,
  ProductionIndirectActivityReason,
  ProductionPointingBreak,
  ProductionPointingSettings,
  ProductionPointingReason,
  ProductionReworkReason,
  ProductionStage,
  ReworkReasonKind,
} from "@/lib/types";

type PointingSettingsBody = Record<string, unknown> & {
  action?: string;
};

type PointingSettingsAccess = {
  canManageOperators: boolean;
  canManageReasons: boolean;
  canManageCalendar: boolean;
  canManageRework: boolean;
};

const pointingSettingsPermissions = [
  "production.pointing.manage_operators",
  "production.pointing.manage_reasons",
  "production.pointing.manage_calendar",
  "production.rework.manage",
] as const;

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown) {
  const normalized = text(value);
  return normalized || null;
}

function bool(value: unknown, fallback = true) {
  return typeof value === "boolean" ? value : fallback;
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : [];
}

function numberArray(value: unknown) {
  return Array.isArray(value)
    ? value.map(Number).filter((item) => Number.isInteger(item))
    : [];
}

function isTimeValue(value: string) {
  return /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
}

function timeToMinutes(value: string) {
  const [hours = "0", minutes = "0"] = value.split(":");
  return Number(hours) * 60 + Number(minutes);
}

function pointingBreaks(value: unknown): ProductionPointingBreak[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      return {
        label: text(record.label),
        start: text(record.start),
        end: text(record.end),
      };
    })
    .filter((item): item is ProductionPointingBreak => Boolean(item?.label && item.start && item.end));
}

function pointingReasonKind(value: unknown): PointingReasonKind | null {
  return value === "pausa" || value === "pendencia" ? value : null;
}

function reworkReasonKind(value: unknown): ReworkReasonKind | null {
  return value === "motivo" || value === "origem" ? value : null;
}

function jsonError(error: unknown, fallback: string) {
  return NextResponse.json(
    { error: getErrorMessage(error, fallback) },
    { status: getHttpStatus(error) },
  );
}

async function getPointingSettingsAccess(
  context: AuthenticatedProfileContext,
): Promise<PointingSettingsAccess> {
  if (context.profile.is_master) {
    return {
      canManageOperators: true,
      canManageReasons: true,
      canManageCalendar: true,
      canManageRework: true,
    };
  }

  const { data: userRoleData, error: userRoleError } = await context.admin
    .from("user_roles")
    .select("role_id")
    .eq("company_id", context.profile.company_id)
    .eq("profile_id", context.profile.id);

  if (userRoleError) throw new HttpError(500, userRoleError.message);

  const roleIds = Array.from(
    new Set(
      ((userRoleData ?? []) as Array<{ role_id: string | null }>)
        .map((userRole) => userRole.role_id)
        .filter((roleId): roleId is string => Boolean(roleId)),
    ),
  );

  if (!roleIds.length) {
    return {
      canManageOperators: false,
      canManageReasons: false,
      canManageCalendar: false,
      canManageRework: false,
    };
  }

  const { data: activeRoleData, error: activeRoleError } = await context.admin
    .from("roles")
    .select("id")
    .eq("company_id", context.profile.company_id)
    .eq("active", true)
    .in("id", roleIds);

  if (activeRoleError) throw new HttpError(500, activeRoleError.message);

  const activeRoleIds = ((activeRoleData ?? []) as Array<{ id: string }>).map((role) => role.id);
  if (!activeRoleIds.length) {
    return {
      canManageOperators: false,
      canManageReasons: false,
      canManageCalendar: false,
      canManageRework: false,
    };
  }

  const { data: permissionData, error: permissionError } = await context.admin
    .from("permissions")
    .select("id, key")
    .in("key", [...pointingSettingsPermissions]);

  if (permissionError) throw new HttpError(500, permissionError.message);

  const permissions = (permissionData ?? []) as Array<{ id: string; key: string }>;
  if (!permissions.length) {
    return {
      canManageOperators: false,
      canManageReasons: false,
      canManageCalendar: false,
      canManageRework: false,
    };
  }

  const permissionById = new Map(permissions.map((permission) => [permission.id, permission.key]));
  const { data: grantData, error: grantError } = await context.admin
    .from("role_permissions")
    .select("permission_id")
    .eq("company_id", context.profile.company_id)
    .in("role_id", activeRoleIds)
    .in(
      "permission_id",
      permissions.map((permission) => permission.id),
    );

  if (grantError) throw new HttpError(500, grantError.message);

  const grantedKeys = new Set(
    ((grantData ?? []) as Array<{ permission_id: string | null }>)
      .map((grant) => (grant.permission_id ? permissionById.get(grant.permission_id) : null))
      .filter((key): key is string => Boolean(key)),
  );

  return {
    canManageOperators: grantedKeys.has("production.pointing.manage_operators"),
    canManageReasons: grantedKeys.has("production.pointing.manage_reasons"),
    canManageCalendar: grantedKeys.has("production.pointing.manage_calendar"),
    canManageRework: grantedKeys.has("production.rework.manage"),
  };
}

function assertCanAccessPointingSettings(access: PointingSettingsAccess) {
  if (
    !access.canManageOperators &&
    !access.canManageReasons &&
    !access.canManageCalendar &&
    !access.canManageRework
  ) {
    throw new HttpError(
      403,
      "Você não possui permissão para gerenciar configurações de apontamento.",
    );
  }
}

async function loadPointingSettings(
  context: AuthenticatedProfileContext,
  access: PointingSettingsAccess,
) {
  const [
    stages,
    operators,
    operatorStages,
    reasons,
    settings,
    indirectReasons,
    reworkReasons,
  ] = await Promise.all([
    context.admin
      .from("production_stages")
      .select("*")
      .eq("company_id", context.profile.company_id)
      .order("sort_order", { ascending: true }),
    access.canManageOperators
      ? context.admin
          .from("production_operators")
          .select("id, company_id, name, registration, active, notes, created_by, created_at, updated_at")
          .eq("company_id", context.profile.company_id)
          .order("name", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    access.canManageOperators
      ? context.admin
          .from("production_operator_stages")
          .select("*")
          .eq("company_id", context.profile.company_id)
      : Promise.resolve({ data: [], error: null }),
    access.canManageReasons
      ? context.admin
          .from("production_pointing_reasons")
          .select("*")
          .eq("company_id", context.profile.company_id)
          .order("kind", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    access.canManageCalendar
      ? context.admin
          .from("production_pointing_settings")
          .select("*")
          .eq("company_id", context.profile.company_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    access.canManageReasons
      ? context.admin
          .from("production_indirect_activity_reasons")
          .select("*")
          .eq("company_id", context.profile.company_id)
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    access.canManageRework
      ? context.admin
          .from("production_rework_reasons")
          .select("*")
          .eq("company_id", context.profile.company_id)
          .order("kind", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
  ]);

  const queryError = [
    stages.error,
    operators.error,
    operatorStages.error,
    reasons.error,
    settings.error,
    indirectReasons.error,
    reworkReasons.error,
  ].find(Boolean);
  if (queryError) throw new HttpError(500, queryError.message);

  const stageLinks = (operatorStages.data ?? []) as ProductionOperatorStage[];
  const pointingStages = getPointingStages((stages.data ?? []) as ProductionStage[]);
  const pointingStageIds = new Set(pointingStages.map((stage) => stage.id));

  return {
    canManageOperators: access.canManageOperators,
    canManageReasons: access.canManageReasons,
    canManageCalendar: access.canManageCalendar,
    canManageRework: access.canManageRework,
    stages: pointingStages,
    operators: ((operators.data ?? []) as ProductionOperator[]).map((operator) => ({
      ...operator,
      stage_ids: stageLinks
        .filter((link) => link.operator_id === operator.id && pointingStageIds.has(link.stage_id))
        .map((link) => link.stage_id),
    })),
    operatorStages: stageLinks,
    reasons: (reasons.data ?? []) as ProductionPointingReason[],
    settings: (settings.data ?? null) as ProductionPointingSettings | null,
    indirectReasons: (indirectReasons.data ?? []) as ProductionIndirectActivityReason[],
    reworkReasons: (reworkReasons.data ?? []) as ProductionReworkReason[],
  };
}

async function hashPin(context: AuthenticatedProfileContext, pin: string) {
  const { data, error } = await context.admin.rpc("hash_production_operator_pin", {
    plain_pin: pin,
  });

  if (error) throw new HttpError(500, error.message);
  if (!data) throw new HttpError(500, "Não foi possível proteger a senha do operador.");
  return String(data);
}

async function replaceOperatorStages(
  context: AuthenticatedProfileContext,
  operatorId: string,
  stageIds: string[],
) {
  const uniqueStageIds = Array.from(new Set(stageIds));

  const { data: stages, error: stagesError } = await context.admin
    .from("production_stages")
    .select("id, active, sort_order")
    .eq("company_id", context.profile.company_id)
    .in("id", uniqueStageIds);

  if (stagesError) throw new HttpError(500, stagesError.message);

  const pointingStageIds = new Set(
    getPointingStages(
      (stages ?? []) as Array<{ id: string; active: boolean; sort_order: number }>,
    ).map((stage) => stage.id),
  );

  if (uniqueStageIds.some((stageId) => !pointingStageIds.has(stageId))) {
    throw new HttpError(400, "Selecione apenas etapas de Corte a Expedição para apontamento.");
  }

  const { error: deleteError } = await context.admin
    .from("production_operator_stages")
    .delete()
    .eq("company_id", context.profile.company_id)
    .eq("operator_id", operatorId);

  if (deleteError) throw new HttpError(500, deleteError.message);

  if (!uniqueStageIds.length) return;

  const { error } = await context.admin.from("production_operator_stages").insert(
    uniqueStageIds.map((stageId) => ({
      company_id: context.profile.company_id,
      operator_id: operatorId,
      stage_id: stageId,
    })),
  );

  if (error) throw new HttpError(500, error.message);
}

async function createReason(
  context: AuthenticatedProfileContext,
  body: PointingSettingsBody,
) {
  const kind = pointingReasonKind(body.kind);
  const label = text(body.label);
  const description = nullableText(body.description);
  const sortOrder = Math.max(0, Math.trunc(numberValue(body.sortOrder, 0)));

  if (!kind || !label) {
    throw new HttpError(400, "Informe o tipo e o motivo de apontamento.");
  }

  const { error } = await context.admin.from("production_pointing_reasons").insert({
    company_id: context.profile.company_id,
    kind,
    label,
    description,
    active: bool(body.active),
    counts_as_downtime: bool(body.countsAsDowntime),
    sort_order: sortOrder,
    created_by: context.authUserId,
  });

  if (error) throw new HttpError(500, error.message);
}

async function updateReason(
  context: AuthenticatedProfileContext,
  body: PointingSettingsBody,
) {
  const id = text(body.id);
  const kind = pointingReasonKind(body.kind);
  const label = text(body.label);
  const description = nullableText(body.description);
  const sortOrder = Math.max(0, Math.trunc(numberValue(body.sortOrder, 0)));

  if (!id || !kind || !label) {
    throw new HttpError(400, "Informe o motivo, tipo e descrição principal.");
  }

  const { error } = await context.admin
    .from("production_pointing_reasons")
    .update({
      kind,
      label,
      description,
      active: bool(body.active),
      counts_as_downtime: bool(body.countsAsDowntime),
      sort_order: sortOrder,
    })
    .eq("company_id", context.profile.company_id)
    .eq("id", id);

  if (error) throw new HttpError(500, error.message);
}

async function inactivateReason(
  context: AuthenticatedProfileContext,
  body: PointingSettingsBody,
) {
  const id = text(body.id);
  if (!id) throw new HttpError(400, "Motivo inválido.");

  const { error } = await context.admin
    .from("production_pointing_reasons")
    .update({ active: false })
    .eq("company_id", context.profile.company_id)
    .eq("id", id);

  if (error) throw new HttpError(500, error.message);
}

async function createIndirectReason(
  context: AuthenticatedProfileContext,
  body: PointingSettingsBody,
) {
  const label = text(body.label);
  const description = nullableText(body.description);
  const sortOrder = Math.max(0, Math.trunc(numberValue(body.sortOrder, 0)));

  if (!label) {
    throw new HttpError(400, "Informe o motivo da atividade indireta.");
  }

  const { error } = await context.admin.from("production_indirect_activity_reasons").insert({
    company_id: context.profile.company_id,
    label,
    description,
    active: bool(body.active),
    sort_order: sortOrder,
    created_by: context.authUserId,
  });

  if (error) throw new HttpError(500, error.message);
}

async function updateIndirectReason(
  context: AuthenticatedProfileContext,
  body: PointingSettingsBody,
) {
  const id = text(body.id);
  const label = text(body.label);
  const description = nullableText(body.description);
  const sortOrder = Math.max(0, Math.trunc(numberValue(body.sortOrder, 0)));

  if (!id || !label) {
    throw new HttpError(400, "Informe o motivo da atividade indireta.");
  }

  const { error } = await context.admin
    .from("production_indirect_activity_reasons")
    .update({
      label,
      description,
      active: bool(body.active),
      sort_order: sortOrder,
    })
    .eq("company_id", context.profile.company_id)
    .eq("id", id);

  if (error) throw new HttpError(500, error.message);
}

async function inactivateIndirectReason(
  context: AuthenticatedProfileContext,
  body: PointingSettingsBody,
) {
  const id = text(body.id);
  if (!id) throw new HttpError(400, "Motivo de atividade indireta inválido.");

  const { error } = await context.admin
    .from("production_indirect_activity_reasons")
    .update({ active: false })
    .eq("company_id", context.profile.company_id)
    .eq("id", id);

  if (error) throw new HttpError(500, error.message);
}

async function updatePointingCalendar(
  context: AuthenticatedProfileContext,
  body: PointingSettingsBody,
) {
  const timezone = text(body.timezone) || "America/Sao_Paulo";
  const workdayStart = text(body.workdayStart);
  const workdayEnd = text(body.workdayEnd);
  const workdays = Array.from(
    new Set(numberArray(body.workdays).filter((day) => day >= 0 && day <= 6)),
  ).sort((left, right) => left - right);
  const breaks = pointingBreaks(body.breaks);

  if (!isTimeValue(workdayStart) || !isTimeValue(workdayEnd)) {
    throw new HttpError(400, "Informe início e fim da jornada em formato válido.");
  }

  if (timeToMinutes(workdayEnd) <= timeToMinutes(workdayStart)) {
    throw new HttpError(400, "O fim da jornada deve ser maior que o início.");
  }

  if (!workdays.length) {
    throw new HttpError(400, "Selecione ao menos um dia de trabalho.");
  }

  for (const item of breaks) {
    if (!isTimeValue(item.start) || !isTimeValue(item.end)) {
      throw new HttpError(400, "Todos os intervalos devem ter horários válidos.");
    }

    if (timeToMinutes(item.end) <= timeToMinutes(item.start)) {
      throw new HttpError(400, "O fim do intervalo deve ser maior que o início.");
    }
  }

  const { error } = await context.admin
    .from("production_pointing_settings")
    .upsert(
      {
        company_id: context.profile.company_id,
        timezone,
        workday_start: workdayStart,
        workday_end: workdayEnd,
        workdays,
        breaks,
        updated_by: context.authUserId,
      },
      { onConflict: "company_id" },
    );

  if (error) throw new HttpError(500, error.message);
}

async function createReworkReason(
  context: AuthenticatedProfileContext,
  body: PointingSettingsBody,
) {
  const kind = reworkReasonKind(body.kind);
  const label = text(body.label);
  const description = nullableText(body.description);
  const sortOrder = Math.max(0, Math.trunc(numberValue(body.sortOrder, 0)));

  if (!kind || !label) {
    throw new HttpError(400, "Informe o tipo e o motivo de retrabalho.");
  }

  const { error } = await context.admin.from("production_rework_reasons").insert({
    company_id: context.profile.company_id,
    kind,
    label,
    description,
    active: bool(body.active),
    sort_order: sortOrder,
    created_by: context.authUserId,
  });

  if (error) throw new HttpError(500, error.message);
}

async function updateReworkReason(
  context: AuthenticatedProfileContext,
  body: PointingSettingsBody,
) {
  const id = text(body.id);
  const kind = reworkReasonKind(body.kind);
  const label = text(body.label);
  const description = nullableText(body.description);
  const sortOrder = Math.max(0, Math.trunc(numberValue(body.sortOrder, 0)));

  if (!id || !kind || !label) {
    throw new HttpError(400, "Informe o retrabalho, tipo e descrição principal.");
  }

  const { error } = await context.admin
    .from("production_rework_reasons")
    .update({
      kind,
      label,
      description,
      active: bool(body.active),
      sort_order: sortOrder,
    })
    .eq("company_id", context.profile.company_id)
    .eq("id", id);

  if (error) throw new HttpError(500, error.message);
}

async function inactivateReworkReason(
  context: AuthenticatedProfileContext,
  body: PointingSettingsBody,
) {
  const id = text(body.id);
  if (!id) throw new HttpError(400, "Motivo de retrabalho inválido.");

  const { error } = await context.admin
    .from("production_rework_reasons")
    .update({ active: false })
    .eq("company_id", context.profile.company_id)
    .eq("id", id);

  if (error) throw new HttpError(500, error.message);
}

export async function GET() {
  try {
    const context = await requireAuthenticatedProfile();
    const access = await getPointingSettingsAccess(context);
    assertCanAccessPointingSettings(access);

    return NextResponse.json(await loadPointingSettings(context, access));
  } catch (error) {
    return jsonError(error, "Não foi possível carregar as configurações de apontamento.");
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireAuthenticatedProfile();
    const access = await getPointingSettingsAccess(context);
    assertCanAccessPointingSettings(access);
    const body = (await request.json().catch(() => ({}))) as PointingSettingsBody;

    switch (body.action) {
      case "createOperator": {
        if (!access.canManageOperators) {
          throw new HttpError(403, "Você não possui permissão para gerenciar operadores.");
        }
        const name = text(body.name);
        const registration = text(body.registration);
        const pin = text(body.pin);
        const stageIds = stringArray(body.stageIds);

        if (!name || !isValidOperatorRegistration(registration) || !isValidOperatorPin(pin)) {
          throw new HttpError(400, "Informe nome, matrícula com 3 dígitos e senha com 4 dígitos.");
        }

        if (!stageIds.length) {
          throw new HttpError(400, "Selecione ao menos uma etapa liberada para o operador.");
        }

        const pinHash = await hashPin(context, pin);
        const { data: operator, error } = await context.admin
          .from("production_operators")
          .insert({
            company_id: context.profile.company_id,
            name,
            registration,
            pin_hash: pinHash,
            active: bool(body.active),
            notes: nullableText(body.notes),
            created_by: context.authUserId,
          })
          .select("id")
          .single();

        if (error) throw new HttpError(500, error.message);
        await replaceOperatorStages(context, operator.id, stageIds);
        break;
      }

      case "updateOperator": {
        if (!access.canManageOperators) {
          throw new HttpError(403, "Você não possui permissão para gerenciar operadores.");
        }
        const id = text(body.id);
        const name = text(body.name);
        const registration = text(body.registration);
        const pin = text(body.pin);
        const stageIds = stringArray(body.stageIds);

        if (!id || !name || !isValidOperatorRegistration(registration)) {
          throw new HttpError(400, "Informe operador, nome e matrícula com 3 dígitos.");
        }

        if (!stageIds.length) {
          throw new HttpError(400, "Selecione ao menos uma etapa liberada para o operador.");
        }

        const updateValues: Record<string, unknown> = {
          name,
          registration,
          active: bool(body.active),
          notes: nullableText(body.notes),
        };

        if (pin) {
          if (!isValidOperatorPin(pin)) {
            throw new HttpError(400, "A nova senha deve possuir 4 dígitos.");
          }
          updateValues.pin_hash = await hashPin(context, pin);
        }

        const { error } = await context.admin
          .from("production_operators")
          .update(updateValues)
          .eq("company_id", context.profile.company_id)
          .eq("id", id);

        if (error) throw new HttpError(500, error.message);
        await replaceOperatorStages(context, id, stageIds);
        break;
      }

      case "deleteOperator": {
        if (!access.canManageOperators) {
          throw new HttpError(403, "Você não possui permissão para gerenciar operadores.");
        }
        const id = text(body.id);
        if (!id) throw new HttpError(400, "Operador inválido.");

        const { error } = await context.admin
          .from("production_operators")
          .update({ active: false })
          .eq("company_id", context.profile.company_id)
          .eq("id", id);

        if (error) throw new HttpError(500, error.message);
        break;
      }

      case "createReason": {
        if (!access.canManageReasons) {
          throw new HttpError(403, "Você não possui permissão para gerenciar motivos.");
        }
        await createReason(context, body);
        break;
      }

      case "updateReason": {
        if (!access.canManageReasons) {
          throw new HttpError(403, "Você não possui permissão para gerenciar motivos.");
        }
        await updateReason(context, body);
        break;
      }

      case "deleteReason": {
        if (!access.canManageReasons) {
          throw new HttpError(403, "Você não possui permissão para gerenciar motivos.");
        }
        await inactivateReason(context, body);
        break;
      }

      case "createIndirectReason": {
        if (!access.canManageReasons) {
          throw new HttpError(403, "Você não possui permissão para gerenciar motivos.");
        }
        await createIndirectReason(context, body);
        break;
      }

      case "updateIndirectReason": {
        if (!access.canManageReasons) {
          throw new HttpError(403, "Você não possui permissão para gerenciar motivos.");
        }
        await updateIndirectReason(context, body);
        break;
      }

      case "deleteIndirectReason": {
        if (!access.canManageReasons) {
          throw new HttpError(403, "Você não possui permissão para gerenciar motivos.");
        }
        await inactivateIndirectReason(context, body);
        break;
      }

      case "updateCalendar": {
        if (!access.canManageCalendar) {
          throw new HttpError(403, "Você não possui permissão para gerenciar a jornada.");
        }
        await updatePointingCalendar(context, body);
        break;
      }

      case "createReworkReason": {
        if (!access.canManageRework) {
          throw new HttpError(403, "Você não possui permissão para gerenciar retrabalhos.");
        }
        await createReworkReason(context, body);
        break;
      }

      case "updateReworkReason": {
        if (!access.canManageRework) {
          throw new HttpError(403, "Você não possui permissão para gerenciar retrabalhos.");
        }
        await updateReworkReason(context, body);
        break;
      }

      case "deleteReworkReason": {
        if (!access.canManageRework) {
          throw new HttpError(403, "Você não possui permissão para gerenciar retrabalhos.");
        }
        await inactivateReworkReason(context, body);
        break;
      }

      default:
        throw new HttpError(400, "Ação de apontamento inválida.");
    }

    return NextResponse.json(await loadPointingSettings(context, access));
  } catch (error) {
    return jsonError(error, "Não foi possível salvar as configurações de apontamento.");
  }
}
