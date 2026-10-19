"use server";

import { revalidatePath } from "next/cache";
import { calculateOwnVehicleRouteCosts } from "@/lib/production";
import { LOAD_CONTROL_ITEMS } from "@/lib/expedition";
import { isValidOperatorPin, isValidOperatorRegistration } from "@/lib/operator-credentials";
import { getPointingStages, isPieceStageUnlocked } from "@/lib/pointing";
import {
  clientUpdateSchema,
  clientSchema,
  contractSchema,
  contractUpdateSchema,
  extraServiceSchema,
  freightUpdateSchema,
  formDataToObject,
  freightSchema,
  prodDocumentCheckUpdateSchema,
  prodMaterialUpdateSchema,
  prodSelectedItemUpdateSchema,
  prodShippingUpdateSchema,
  prodStageUpdateSchema,
  prodUpdateSchema,
  prodSchema,
} from "@/lib/schemas";
import { toUserFriendlyErrorMessage } from "@/lib/errors";
import { hasActiveMasterRole } from "@/lib/server-access";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient, hasSupabaseEnv } from "@/lib/supabase/server";
import { getSystemMaintenanceState } from "@/lib/system-maintenance-server";

type ActionState = {
  ok: boolean;
  message: string;
};

type SupabaseServerClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type SupabaseAdminClient = ReturnType<typeof getSupabaseAdminClient>;

type ActionContext =
  | {
      ok: true;
      supabase: SupabaseServerClient;
      userId: string;
      profileId: string;
      companyId: string;
      isMaster: boolean;
    }
  | {
      ok: false;
      state: ActionState;
    };

function notConfigured(): ActionState {
  return {
    ok: false,
    message: "Configure o Supabase para gravar dados. A tela atual está usando dados demo.",
  };
}

async function getActionContext(): Promise<ActionContext> {
  if (!hasSupabaseEnv()) {
    return { ok: false, state: notConfigured() };
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false,
      state: {
        ok: false,
        message: "Faça login novamente para cadastrar dados de produção.",
      },
    };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("id, company_id, status, is_master")
    .eq("user_id", user.id)
    .maybeSingle();

  if (profileError) {
    return {
      ok: false,
      state: { ok: false, message: toUserFriendlyErrorMessage(profileError) },
    };
  }

  if (!profile?.company_id || profile.status !== "active") {
    return {
      ok: false,
      state: {
        ok: false,
        message: "Seu usuário ainda não possui perfil ativo vinculado a uma empresa.",
      },
    };
  }

  const admin = getSupabaseAdminClient();
  const hasMasterAccess = await hasActiveMasterRole(admin, {
    id: profile.id as string,
    company_id: profile.company_id as string,
    is_master: Boolean(profile.is_master),
  });

  if (!hasMasterAccess) {
    const maintenance = await getSystemMaintenanceState(admin, profile.company_id as string);

    if (maintenance.enabled) {
      await supabase.auth.signOut().catch(() => undefined);

      return {
        ok: false,
        state: {
          ok: false,
          message:
            "Sistema em manutenção. Sua sessão foi encerrada para preservar a atualização em andamento.",
        },
      };
    }
  }

  return {
    ok: true,
    supabase,
    userId: user.id,
    profileId: profile.id as string,
    companyId: profile.company_id as string,
    isMaster: hasMasterAccess,
  };
}

async function requireActionPermission(
  context: Extract<ActionContext, { ok: true }>,
  permissionKey: string,
  message: string,
) {
  if (context.isMaster) return null;

  const { data, error } = await context.supabase.rpc("has_permission", {
    permission_key: permissionKey,
  });

  if (error) return { ok: false, message: toUserFriendlyErrorMessage(error) };
  if (!data) return { ok: false, message };

  return null;
}

async function hasActionPermission(
  context: Extract<ActionContext, { ok: true }>,
  permissionKey: string,
) {
  if (context.isMaster) return true;

  const { data, error } = await context.supabase.rpc("has_permission", {
    permission_key: permissionKey,
  });

  if (error) throw error;
  return Boolean(data);
}

async function hasAnyActionPermission(
  context: Extract<ActionContext, { ok: true }>,
  permissionKeys: string[],
) {
  if (context.isMaster) return true;

  const results = await Promise.all(
    permissionKeys.map((permissionKey) => hasActionPermission(context, permissionKey)),
  );

  return results.some(Boolean);
}

function revalidateProds(prodId?: string) {
  revalidatePath("/prods");
  if (prodId) revalidatePath(`/prods/${prodId}`);
  revalidatePath("/");
  revalidatePath("/pointing");
  revalidateLogistics();
}

async function insertRow(table: string, values: Record<string, unknown>, path: string) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const { error } = await context.supabase.from(table).insert({
    ...values,
    company_id: context.companyId,
    created_by: context.userId,
  });

  if (error) return { ok: false, message: toUserFriendlyErrorMessage(error) };
  revalidatePath(path);
  revalidatePath("/");
  return { ok: true, message: "Registro salvo com sucesso." };
}

function idsFromForm(formData: FormData, key: string) {
  return formData
    .getAll(key)
    .map(String)
    .filter(Boolean);
}

function revalidateLogistics() {
  revalidatePath("/freights");
  revalidatePath("/extra-services");
  revalidatePath("/routes");
  revalidatePath("/transport");
  revalidatePath("/reports");
  revalidatePath("/");
}

function revalidatePointing(prodIds: string[] = []) {
  revalidatePath("/pointing");
  revalidatePath("/prods");
  prodIds.forEach((prodId) => revalidatePath(`/prods/${prodId}`));
  revalidatePath("/");
}

function parseJsonArray<T>(value: FormDataEntryValue | null): T[] {
  if (typeof value !== "string" || !value.trim()) return [];

  const parsed = JSON.parse(value) as unknown;
  return Array.isArray(parsed) ? (parsed as T[]) : [];
}

function numericValue(value: unknown) {
  const parsed =
    typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

type ImportPiecePayload = {
  piece_code?: unknown;
  system_code?: unknown;
  system_description?: unknown;
  quantity?: unknown;
  width_mm?: unknown;
  height_mm?: unknown;
  measure_a?: unknown;
  measure_b?: unknown;
  location?: unknown;
  area_m2?: unknown;
  unit_weight_kg?: unknown;
  total_weight_kg?: unknown;
  sort_order?: unknown;
  notes?: unknown;
};

function textOrNull(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableFormField(formData: FormData, name: string) {
  return textOrNull(formData.get(name));
}

function normalizeImportPiece(piece: ImportPiecePayload, index: number) {
  const pieceCode = textOrNull(piece.piece_code);

  if (!pieceCode) {
    throw new Error(`Peça ${index + 1} está sem código.`);
  }

  return {
    piece_code: pieceCode,
    system_code: textOrNull(piece.system_code),
    system_description: textOrNull(piece.system_description),
    quantity: Math.max(1, Math.trunc(numericValue(piece.quantity) || 1)),
    width_mm: piece.width_mm == null ? null : numericValue(piece.width_mm),
    height_mm: piece.height_mm == null ? null : numericValue(piece.height_mm),
    measure_a: piece.measure_a == null ? null : numericValue(piece.measure_a),
    measure_b: piece.measure_b == null ? null : numericValue(piece.measure_b),
    location: textOrNull(piece.location),
    area_m2: numericValue(piece.area_m2),
    unit_weight_kg: numericValue(piece.unit_weight_kg),
    total_weight_kg: numericValue(piece.total_weight_kg),
    sort_order: Math.max(1, Math.trunc(numericValue(piece.sort_order) || index + 1)),
    notes: textOrNull(piece.notes),
  };
}

function readPiecePayloadFromForm(formData: FormData, index = 0) {
  return normalizeImportPiece(
    {
      piece_code: formData.get("piece_code"),
      system_code: nullableFormField(formData, "system_code"),
      system_description: nullableFormField(formData, "system_description"),
      quantity: formData.get("quantity"),
      width_mm: nullableFormField(formData, "width_mm"),
      height_mm: nullableFormField(formData, "height_mm"),
      measure_a: nullableFormField(formData, "measure_a"),
      measure_b: nullableFormField(formData, "measure_b"),
      location: nullableFormField(formData, "location"),
      area_m2: formData.get("area_m2"),
      unit_weight_kg: formData.get("unit_weight_kg"),
      total_weight_kg: formData.get("total_weight_kg"),
      sort_order: nullableFormField(formData, "sort_order"),
      notes: nullableFormField(formData, "notes"),
    },
    index,
  );
}

type DbPieceStage = {
  id: string;
  prod_id: string;
  piece_id: string;
  stage_id: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  total_productive_seconds: number | null;
  total_paused_seconds: number | null;
  last_action: string | null;
  last_action_at: string | null;
  active_rework_id: string | null;
  notes: string | null;
};

type PointingActionType =
  | "iniciar"
  | "pausar"
  | "retomar"
  | "concluir"
  | "pendencia"
  | "nao_aplicavel"
  | "retornar"
  | "ajuste_tempo";

const pointingActions = new Set<PointingActionType>([
  "iniciar",
  "pausar",
  "retomar",
  "concluir",
  "pendencia",
  "nao_aplicavel",
  "retornar",
]);

type PointingSessionInsert = {
  prodIds: string[];
  stageId: string;
  operatorId: string;
  pointingReasonId: string | null;
  reworkId: string | null;
  action: PointingActionType;
  eventAt: string;
  productiveSecondsDelta: number;
  pausedSecondsDelta: number;
  pieceCount: number;
  notes: string | null;
  pauseReason: string | null;
};

async function createPointingSession(
  admin: SupabaseAdminClient,
  context: Extract<ActionContext, { ok: true }>,
  values: PointingSessionInsert,
) {
  const { data, error } = await admin
    .from("production_pointing_sessions")
    .insert({
      company_id: context.companyId,
      prod_ids: values.prodIds,
      stage_id: values.stageId,
      operator_id: values.operatorId,
      pointing_reason_id: values.pointingReasonId,
      rework_id: values.reworkId,
      session_profile_id: context.profileId,
      auth_user_id: context.userId,
      action: values.action,
      event_at: values.eventAt,
      productive_seconds_delta: values.productiveSecondsDelta,
      paused_seconds_delta: values.pausedSecondsDelta,
      piece_count: values.pieceCount,
      notes: values.notes,
      pause_reason: values.pauseReason,
    })
    .select("id")
    .single();

  if (error) throw error;
  return String(data.id);
}

function participantRegistrationsFromForm(formData: FormData) {
  const rawValues = [
    ...formData.getAll("participant_registration").map(String),
    String(formData.get("participant_registrations") ?? ""),
  ];

  return Array.from(
    new Set(
      rawValues
        .flatMap((value) => value.split(/[\s,;]+/g))
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
}

async function resolveParticipantOperatorIds(
  admin: SupabaseAdminClient,
  context: Extract<ActionContext, { ok: true }>,
  registrations: string[],
  mainOperatorId: string,
) {
  if (!registrations.length) return [];

  const invalidRegistration = registrations.find(
    (registration) => !isValidOperatorRegistration(registration),
  );
  if (invalidRegistration) {
    throw new Error(`Matrícula de participante inválida: ${invalidRegistration}.`);
  }

  const { data, error } = await admin
    .from("production_operators")
    .select("id, registration, active")
    .eq("company_id", context.companyId)
    .eq("active", true)
    .in("registration", registrations);

  if (error) throw error;

  const operators = (data ?? []) as Array<{ id: string; registration: string; active: boolean }>;
  const operatorByRegistration = new Map(
    operators.map((operator) => [String(operator.registration), operator]),
  );
  const missingRegistration = registrations.find(
    (registration) => !operatorByRegistration.has(registration),
  );

  if (missingRegistration) {
    throw new Error(`Participante com matrícula ${missingRegistration} não encontrado ou inativo.`);
  }

  const participantIds = registrations.map((registration) => {
    const operator = operatorByRegistration.get(registration);
    if (!operator) throw new Error(`Participante ${registration} inválido.`);
    return String(operator.id);
  });

  if (participantIds.includes(mainOperatorId)) {
    throw new Error("O responsável principal não deve ser repetido como participante.");
  }

  return Array.from(new Set(participantIds));
}

type AuthenticatedOperator = {
  id: string;
  name: string;
  registration: string;
};

async function authenticateProductionOperator(
  admin: SupabaseAdminClient,
  context: Extract<ActionContext, { ok: true }>,
  registration: string,
  pin: string,
): Promise<AuthenticatedOperator | ActionState> {
  if (!registration || !pin) {
    return { ok: false, message: "Informe a matrícula e a senha do operador." };
  }

  if (!isValidOperatorRegistration(registration) || !isValidOperatorPin(pin)) {
    return { ok: false, message: "Informe matrícula com 3 dígitos e senha com 4 dígitos." };
  }

  const { data: operator, error: operatorError } = await admin
    .from("production_operators")
    .select("id, name, registration, pin_hash, active")
    .eq("company_id", context.companyId)
    .eq("registration", registration)
    .eq("active", true)
    .maybeSingle();

  if (operatorError) throw operatorError;
  if (!operator) return { ok: false, message: "Operador não encontrado ou inativo." };

  const { data: validPin, error: pinError } = await admin.rpc(
    "verify_production_operator_pin",
    {
      stored_hash: operator.pin_hash,
      plain_pin: pin,
    },
  );

  if (pinError) throw pinError;
  if (!validPin) return { ok: false, message: "Matrícula ou senha inválida." };

  return {
    id: String(operator.id),
    name: String(operator.name),
    registration: String(operator.registration),
  };
}

async function insertPointingSessionParticipants(
  admin: SupabaseAdminClient,
  context: Extract<ActionContext, { ok: true }>,
  pointingSessionId: string,
  participantOperatorIds: string[],
) {
  if (!participantOperatorIds.length) return;

  const { error } = await admin.from("production_pointing_session_participants").insert(
    participantOperatorIds.map((operatorId) => ({
      company_id: context.companyId,
      pointing_session_id: pointingSessionId,
      operator_id: operatorId,
    })),
  );

  if (error) throw error;
}

const directPieceStageStatuses = new Set([
  "nao_iniciada",
  "aguardando",
  "em_andamento",
  "concluida",
  "concluida_parcialmente",
  "pausada",
  "com_pendencia",
  "nao_aplicavel",
]);

function secondsBetween(start: string | null, end: Date) {
  if (!start) return 0;
  const startDate = new Date(start);
  const delta = Math.floor((end.getTime() - startDate.getTime()) / 1000);
  return Number.isFinite(delta) && delta > 0 ? delta : 0;
}

function parseLocalDateTime(value: unknown, timezoneOffsetMinutes: number) {
  if (typeof value !== "string" || !value.trim()) return null;
  const match = value
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) return null;

  const [, year, month, day, hour, minute, second = "0"] = match;
  const localAsUtcMs = Date.UTC(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
    Number(second),
  );
  const date = new Date(localAsUtcMs + timezoneOffsetMinutes * 60 * 1000);

  return Number.isFinite(date.getTime()) ? date : null;
}

function buildPieceStageTransition(pieceStage: DbPieceStage, action: PointingActionType, now: Date) {
  const nowIso = now.toISOString();
  const currentStatus = pieceStage.status;
  let productiveDelta = 0;
  let pausedDelta = 0;

  if (action === "nao_aplicavel") {
    if (["concluida", "nao_aplicavel"].includes(currentStatus)) {
      throw new Error("Esta etapa já foi finalizada para a peça selecionada.");
    }

    return {
      nextValues: {
        status: "nao_aplicavel",
        started_at: null,
        completed_at: nowIso,
        last_action: action,
        last_action_at: nowIso,
        blockers: null,
      },
      productiveDelta,
      pausedDelta,
      resetTotals: true,
    };
  }

  if (action === "iniciar") {
    if (!["nao_iniciada", "aguardando"].includes(currentStatus)) {
      throw new Error("Somente peças não iniciadas ou aguardando podem ser iniciadas.");
    }

    return {
      nextValues: {
        status: "em_andamento",
        started_at: pieceStage.started_at ?? nowIso,
        completed_at: null,
        last_action: action,
        last_action_at: nowIso,
      },
      productiveDelta,
      pausedDelta,
      resetTotals: false,
    };
  }

  if (action === "retomar") {
    if (!["pausada", "com_pendencia"].includes(currentStatus)) {
      throw new Error("Somente peças pausadas ou com pendência podem ser retomadas.");
    }

    if (["pausar", "pendencia"].includes(pieceStage.last_action ?? "")) {
      pausedDelta = secondsBetween(pieceStage.last_action_at, now);
    }

    return {
      nextValues: {
        status: "em_andamento",
        last_action: action,
        last_action_at: nowIso,
        blockers: null,
      },
      productiveDelta,
      pausedDelta,
      resetTotals: false,
    };
  }

  if (action === "pausar" || action === "pendencia") {
    if (currentStatus !== "em_andamento") {
      throw new Error("Somente peças em andamento podem ser pausadas ou marcadas com pendência.");
    }

    if (["iniciar", "retomar"].includes(pieceStage.last_action ?? "")) {
      productiveDelta = secondsBetween(pieceStage.last_action_at, now);
    }

    return {
      nextValues: {
        status: action === "pausar" ? "pausada" : "com_pendencia",
        last_action: action,
        last_action_at: nowIso,
      },
      productiveDelta,
      pausedDelta,
      resetTotals: false,
    };
  }

  if (currentStatus !== "em_andamento") {
    throw new Error("Somente peças em andamento podem ser concluídas.");
  }

  if (["iniciar", "retomar"].includes(pieceStage.last_action ?? "")) {
    productiveDelta = secondsBetween(pieceStage.last_action_at, now);
  }

  return {
    nextValues: {
      status: "concluida",
      completed_at: nowIso,
      last_action: action,
      last_action_at: nowIso,
      blockers: null,
    },
    productiveDelta,
    pausedDelta,
    resetTotals: false,
  };
}

async function refreshProdStageFromPieces(
  context: Extract<ActionContext, { ok: true }>,
  prodId: string,
  stageId: string,
) {
  const admin = getSupabaseAdminClient();
  const { data: pieceStages, error } = await admin
    .from("production_prod_piece_stages")
    .select("status, started_at, completed_at")
    .eq("company_id", context.companyId)
    .eq("prod_id", prodId)
    .eq("stage_id", stageId);

  if (error) throw error;
  if (!pieceStages?.length) return;

  const statuses = pieceStages.map((item) => String(item.status));
  const allDone = statuses.every((status) => ["concluida", "nao_aplicavel"].includes(status));
  const nextStatus = allDone
    ? "concluida"
    : statuses.includes("com_pendencia")
      ? "com_pendencia"
      : statuses.includes("pausada")
        ? "pausada"
        : statuses.includes("em_andamento")
          ? "em_andamento"
          : statuses.includes("aguardando")
            ? "aguardando"
            : "nao_iniciada";
  const startedAt =
    pieceStages
      .map((item) => item.started_at)
      .filter((value): value is string => Boolean(value))
      .sort()[0] ?? null;
  const completedAt = allDone
    ? (pieceStages
        .map((item) => item.completed_at)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1) ?? new Date().toISOString())
    : null;

  const { error: updateError } = await admin
    .from("production_prod_stages")
    .update({
      status: nextStatus,
      started_at: startedAt,
      completed_at: completedAt,
      last_updated_by: context.userId,
      last_updated_at: new Date().toISOString(),
    })
    .eq("company_id", context.companyId)
    .eq("prod_id", prodId)
    .eq("stage_id", stageId);

  if (updateError) throw updateError;

  const { error: prodError } = await admin
    .from("production_prods")
    .update({ current_stage_id: stageId })
    .eq("company_id", context.companyId)
    .eq("id", prodId);

  if (prodError) throw prodError;
}

type RouteDriverRecord = {
  id: string;
  name: string;
  hourly_cost?: number | null;
  can_drive?: boolean | null;
};

type RouteVehicleRecord = {
  id: string;
  name: string;
  plate: string;
  vehicle_kind?: "veiculo" | "carretinha" | null;
  ownership_type?: "proprio" | "terceiro" | null;
  fuel_consumption_km_l?: number | null;
  wear_cost_per_km?: number | null;
};

type RouteLogisticsSettingsRecord = {
  fuel_price_per_liter?: number | null;
};

type RouteHelperRecord = {
  id: string;
  name: string;
  hourly_cost?: number | null;
  can_help?: boolean | null;
};

type RouteValues = {
  freight_date: string;
  planned_departure_time?: string | null;
  driver_id: string;
  vehicle_id: string;
  trailer_vehicle_id?: string | null;
  status: string;
  expected_value: number;
  contracted_value: number;
  realized_value: number;
  additional_costs: number;
  execution_type: "terceirizado" | "veiculo_proprio";
  distance_km: number;
  estimated_hours: number;
  helper_hours: number;
  notes?: string | null;
};

function roundMoney(value: number) {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.filter(Boolean)));
}

function dateDaysBefore(value: string | null | undefined, days: number) {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

function withAutomaticProdStart<T extends { planned_start_date?: string | null; delivery_forecast?: string | null }>(
  values: T,
) {
  return {
    ...values,
    planned_start_date: dateDaysBefore(values.delivery_forecast, 15),
  };
}

async function loadRouteCostContext(
  context: Extract<ActionContext, { ok: true }>,
  values: RouteValues,
  helperIds: string[],
) {
  const selectedHelperIds = uniqueIds(helperIds);
  const [
    { data: driver, error: driverError },
    { data: vehicle, error: vehicleError },
    { data: logisticsSettings, error: settingsError },
  ] = await Promise.all([
      context.supabase
        .from("logistics_drivers")
        .select("id, name, hourly_cost, can_drive")
        .eq("company_id", context.companyId)
        .eq("id", values.driver_id)
        .maybeSingle(),
      context.supabase
        .from("logistics_vehicles")
        .select("id, name, plate, vehicle_kind, ownership_type, fuel_consumption_km_l, wear_cost_per_km")
        .eq("company_id", context.companyId)
        .eq("id", values.vehicle_id)
        .maybeSingle(),
      context.supabase
        .from("logistics_settings")
        .select("fuel_price_per_liter")
        .eq("company_id", context.companyId)
        .maybeSingle(),
    ]);

  if (driverError) throw driverError;
  if (vehicleError) throw vehicleError;
  if (settingsError) throw settingsError;
  if (!driver) return { ok: false as const, message: "Motorista não encontrado." };
  if (!vehicle) return { ok: false as const, message: "Veículo não encontrado." };

  const typedDriver = driver as RouteDriverRecord;
  const typedVehicle = vehicle as RouteVehicleRecord;
  const typedLogisticsSettings = logisticsSettings as RouteLogisticsSettingsRecord | null;

  if ((typedVehicle.vehicle_kind ?? "veiculo") === "carretinha") {
    return {
      ok: false as const,
      message: "Selecione um veículo principal. A carretinha deve ser vinculada no campo próprio.",
    };
  }

  if (values.execution_type === "terceirizado") {
    if (values.expected_value <= 0) {
      return { ok: false as const, message: "Informe o valor previsto da rota terceirizada." };
    }

    return {
      ok: true as const,
      driver: typedDriver,
      vehicle: typedVehicle,
      helperRows: [],
      routeValues: {
        ...values,
        distance_km: 0,
        estimated_hours: 0,
        helper_hours: 0,
        fuel_cost: 0,
        driver_labor_cost: 0,
        helper_labor_cost: 0,
        vehicle_wear_cost: 0,
        trailer_vehicle_id: null,
        trailer: null,
        trailer_plate: null,
        trailer_wear_cost: 0,
        internal_total_cost: 0,
        driver_hourly_cost_snapshot: 0,
        vehicle_consumption_snapshot: 0,
        fuel_price_snapshot: 0,
        wear_cost_snapshot: 0,
        trailer_wear_cost_snapshot: 0,
      },
    };
  }

  if (typedVehicle.ownership_type !== "proprio") {
    return {
      ok: false as const,
      message: "Selecione um veículo próprio para calcular custo interno.",
    };
  }

  if (values.distance_km <= 0 || values.estimated_hours <= 0) {
    return {
      ok: false as const,
      message: "Informe a distância e a duração estimada da rota com veículo próprio.",
    };
  }

  if (Number(typedVehicle.fuel_consumption_km_l ?? 0) <= 0) {
    return {
      ok: false as const,
      message: "Informe o consumo km/l do veículo próprio em Configurações.",
    };
  }

  if (Number(typedLogisticsSettings?.fuel_price_per_liter ?? 0) <= 0) {
    return {
      ok: false as const,
      message: "Informe o valor global do combustível por litro em Configurações.",
    };
  }

  if (selectedHelperIds.length > 0 && values.helper_hours <= 0) {
    return {
      ok: false as const,
      message: "Informe a quantidade de horas dos ajudantes selecionados.",
    };
  }

  const { data: helpersData, error: helpersError } = selectedHelperIds.length
    ? await context.supabase
        .from("logistics_drivers")
        .select("id, name, hourly_cost, can_help")
        .eq("company_id", context.companyId)
        .eq("can_help", true)
        .in("id", selectedHelperIds)
    : { data: [], error: null };

  if (helpersError) throw helpersError;
  const helpers = (helpersData ?? []) as RouteHelperRecord[];

  if (helpers.length !== selectedHelperIds.length) {
    return {
      ok: false as const,
      message: "Um ou mais ajudantes selecionados não estão disponíveis.",
    };
  }

  let typedTrailer: RouteVehicleRecord | null = null;
  const trailerVehicleId = values.trailer_vehicle_id ?? null;
  if (trailerVehicleId) {
    if (trailerVehicleId === values.vehicle_id) {
      return {
        ok: false as const,
        message: "Selecione uma carretinha diferente do veículo principal.",
      };
    }

    const { data: trailer, error: trailerError } = await context.supabase
      .from("logistics_vehicles")
      .select("id, name, plate, vehicle_kind, ownership_type, fuel_consumption_km_l, wear_cost_per_km")
      .eq("company_id", context.companyId)
      .eq("id", trailerVehicleId)
      .maybeSingle();

    if (trailerError) throw trailerError;
    if (!trailer) {
      return { ok: false as const, message: "Carretinha não encontrada." };
    }

    typedTrailer = trailer as RouteVehicleRecord;
    if ((typedTrailer.vehicle_kind ?? "veiculo") !== "carretinha") {
      return {
        ok: false as const,
        message: "O item vinculado como carretinha precisa estar cadastrado como carretinha.",
      };
    }

    if (typedTrailer.ownership_type !== "proprio") {
      return {
        ok: false as const,
        message: "A carretinha vinculada precisa ser própria da empresa.",
      };
    }
  }

  const costs = calculateOwnVehicleRouteCosts({
    driver: {
      hourly_cost: Number(typedDriver.hourly_cost ?? 0),
    },
    vehicle: {
      fuel_consumption_km_l: Number(typedVehicle.fuel_consumption_km_l ?? 0),
      wear_cost_per_km: Number(typedVehicle.wear_cost_per_km ?? 0),
    },
    trailer: typedTrailer
      ? {
          wear_cost_per_km: Number(typedTrailer.wear_cost_per_km ?? 0),
        }
      : null,
    fuelPricePerLiter: Number(typedLogisticsSettings?.fuel_price_per_liter ?? 0),
    helperIds: selectedHelperIds,
    helpers: helpers.map((helper) => ({
      id: helper.id,
      hourly_cost: Number(helper.hourly_cost ?? 0),
    })),
    distanceKm: values.distance_km,
    estimatedHours: values.estimated_hours,
    helperHours: values.helper_hours,
    additionalCosts: values.additional_costs,
  });

  return {
    ok: true as const,
    driver: typedDriver,
    vehicle: typedVehicle,
    helperRows: helpers.map((helper) => ({
      company_id: context.companyId,
      helper_id: helper.id,
      helper_name: helper.name,
      hourly_cost_snapshot: roundMoney(Number(helper.hourly_cost ?? 0)),
      hours: roundMoney(values.helper_hours),
      total_cost: roundMoney(Number(helper.hourly_cost ?? 0) * values.helper_hours),
    })),
    routeValues: {
      ...values,
      expected_value: roundMoney(costs.internalTotalCost),
      fuel_cost: roundMoney(costs.fuelCost),
      driver_labor_cost: roundMoney(costs.driverLaborCost),
      helper_labor_cost: roundMoney(costs.helperLaborCost),
      vehicle_wear_cost: roundMoney(costs.vehicleWearCost),
      trailer_vehicle_id: typedTrailer?.id ?? null,
      trailer: typedTrailer?.name ?? null,
      trailer_plate: typedTrailer?.plate ?? null,
      trailer_wear_cost: roundMoney(costs.trailerWearCost),
      internal_total_cost: roundMoney(costs.internalTotalCost),
      driver_hourly_cost_snapshot: roundMoney(costs.driverHourlyCost),
      vehicle_consumption_snapshot: roundMoney(costs.fuelConsumption),
      fuel_price_snapshot: roundMoney(costs.fuelPrice),
      wear_cost_snapshot: roundMoney(costs.wearCost),
      trailer_wear_cost_snapshot: roundMoney(costs.trailerWearCostPerKm),
    },
  };
}

async function replaceRouteHelpers(
  context: Extract<ActionContext, { ok: true }>,
  freightId: string,
  helperRows: Array<Record<string, unknown>>,
) {
  const { error: deleteError } = await context.supabase
    .from("freight_route_helpers")
    .delete()
    .eq("company_id", context.companyId)
    .eq("freight_id", freightId);

  if (deleteError) throw deleteError;

  if (!helperRows.length) return;

  const { error } = await context.supabase.from("freight_route_helpers").insert(
    helperRows.map((row) => ({
      ...row,
      freight_id: freightId,
    })),
  );

  if (error) throw error;
}

async function addFreightDemandStops({
  context,
  freightId,
  demandIds,
  requestingDepartmentId,
  status,
  initialPosition,
}: {
  context: Extract<ActionContext, { ok: true }>;
  freightId: string;
  demandIds: string[];
  requestingDepartmentId: string;
  status: string;
  initialPosition: number;
}) {
  if (!demandIds.length) return initialPosition;

  const { data: demands, error: demandsError } = await context.supabase
    .from("freight_demands")
    .select("*")
    .eq("company_id", context.companyId)
    .eq("status", "em_planejamento")
    .in("id", demandIds);

  if (demandsError) throw demandsError;

  let position = initialPosition;
  for (const demand of demands ?? []) {
    const { data: prod, error: prodError } = await context.supabase
      .from("production_prods")
      .select("id, prod_number, contract_id")
      .eq("company_id", context.companyId)
      .eq("id", demand.prod_id)
      .maybeSingle();

    if (prodError) throw prodError;
    if (!prod) continue;

    const { data: contract, error: contractError } = await context.supabase
      .from("production_contracts")
      .select("id, contract_number, client_id, work_name, full_address")
      .eq("company_id", context.companyId)
      .eq("id", prod.contract_id)
      .maybeSingle();

    if (contractError) throw contractError;
    if (!contract) continue;

    const { data: client, error: clientError } = await context.supabase
      .from("clients")
      .select("id, name")
      .eq("company_id", context.companyId)
      .eq("id", contract.client_id)
      .maybeSingle();

    if (clientError) throw clientError;
    if (!client) continue;

    const { data: stop, error: stopError } = await context.supabase
      .from("freight_stops")
      .insert({
        company_id: context.companyId,
        freight_id: freightId,
        freight_demand_id: demand.id,
        position,
        stop_type: "entrega_prod",
        requesting_department_id: requestingDepartmentId,
        requesting_profile_id: context.profileId,
        title: `${client.name} - ${contract.contract_number} - PROD ${prod.prod_number}`,
        address: contract.full_address,
        contact: null,
        phone: null,
        planned_window: null,
        notes: contract.work_name,
        status,
        requires_proof: false,
        completed: false,
      })
      .select("id")
      .single();

    if (stopError) throw stopError;

    const { error: linkError } = await context.supabase.from("freight_stop_prods").insert({
      company_id: context.companyId,
      freight_id: freightId,
      stop_id: stop.id,
      prod_id: prod.id,
    });

    if (linkError) throw linkError;

    const { error: updateDemandError } = await context.supabase
      .from("freight_demands")
      .update({ status: "incluido_em_rota" })
      .eq("company_id", context.companyId)
      .eq("id", demand.id);

    if (updateDemandError) throw updateDemandError;
    position += 1;
  }

  return position;
}

async function addExtraServiceStops({
  context,
  freightId,
  extraServiceIds,
  status,
  initialPosition,
}: {
  context: Extract<ActionContext, { ok: true }>;
  freightId: string;
  extraServiceIds: string[];
  status: string;
  initialPosition: number;
}) {
  if (!extraServiceIds.length) return initialPosition;

  const { data: services, error: servicesError } = await context.supabase
    .from("extra_service_requests")
    .select("*")
    .eq("company_id", context.companyId)
    .eq("status", "em_planejamento")
    .in("id", extraServiceIds);

  if (servicesError) throw servicesError;

  let position = initialPosition;
  for (const service of services ?? []) {
    const { error: stopError } = await context.supabase.from("freight_stops").insert({
      company_id: context.companyId,
      freight_id: freightId,
      position,
      stop_type: service.service_type,
      requesting_department_id: service.requesting_department_id,
      requesting_profile_id: service.requesting_profile_id ?? context.profileId,
      title: service.recipient_or_place,
      address: service.address,
      contact: service.contact,
      phone: service.phone,
      planned_window: service.desired_window,
      notes: service.notes ?? service.service_description,
      status,
      requires_proof: service.requires_proof,
      completed: false,
      extra_service_request_id: service.id,
    });

    if (stopError) throw stopError;

    const { error: updateServiceError } = await context.supabase
      .from("extra_service_requests")
      .update({ status: "incluido_em_rota" })
      .eq("company_id", context.companyId)
      .eq("id", service.id);

    if (updateServiceError) throw updateServiceError;
    position += 1;
  }

  return position;
}

export async function createClientAction(_: ActionState, formData: FormData) {
  if (!hasSupabaseEnv()) return notConfigured();
  const parsed = clientSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  return insertRow("clients", parsed.data, "/clients");
}

export async function updateClientAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.clients.edit",
    "Você não possui permissão para editar clientes.",
  );

  if (permissionError) return permissionError;

  const parsed = clientUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { id, ...values } = parsed.data;
  const { error } = await context.supabase
    .from("clients")
    .update(values)
    .eq("company_id", context.companyId)
    .eq("id", id);

  if (error) return { ok: false, message: toUserFriendlyErrorMessage(error) };
  revalidatePath("/clients");
  revalidatePath("/");
  return { ok: true, message: "Cliente atualizado com sucesso." };
}

export async function deleteClientAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  if (!context.isMaster) {
    return { ok: false, message: "Somente usuários administradores podem excluir clientes." };
  }

  const id = String(formData.get("id") ?? "");

  if (!id) {
    return { ok: false, message: "Cliente inválido." };
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from("clients")
    .delete()
    .eq("company_id", context.companyId)
    .eq("id", id);

  if (error) return { ok: false, message: toUserFriendlyErrorMessage(error) };
  revalidatePath("/clients");
  revalidatePath("/");
  return { ok: true, message: "Cliente excluído com sucesso." };
}

export async function createContractAction(_: ActionState, formData: FormData) {
  if (!hasSupabaseEnv()) return notConfigured();
  const parsed = contractSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }
  return insertRow("production_contracts", parsed.data, "/contracts");
}

export async function updateContractAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.contracts.edit",
    "Você não possui permissão para editar contratos e obras.",
  );

  if (permissionError) return permissionError;

  const parsed = contractUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { id, ...values } = parsed.data;
  const { error } = await context.supabase
    .from("production_contracts")
    .update(values)
    .eq("company_id", context.companyId)
    .eq("id", id);

  if (error) return { ok: false, message: toUserFriendlyErrorMessage(error) };

  revalidatePath("/contracts");
  revalidatePath("/prods");
  revalidatePath("/");
  return { ok: true, message: "Contrato atualizado com sucesso." };
}

export async function createProdAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.prods.create",
    "Você não possui permissão para criar PRODs.",
  );

  if (permissionError) return permissionError;

  const parsed = prodSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const values = withAutomaticProdStart(parsed.data);
  const { error } = await context.supabase.from("production_prods").insert({
    ...values,
    company_id: context.companyId,
    created_by: context.userId,
  });

  if (error) return { ok: false, message: toUserFriendlyErrorMessage(error) };

  revalidateProds();
  return { ok: true, message: "PROD salva com sucesso." };
}

export async function updateProdAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.prods.edit",
    "Você não possui permissão para editar PRODs.",
  );

  if (permissionError) return permissionError;

  const parsed = prodUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { id, ...parsedValues } = parsed.data;
  const values = withAutomaticProdStart(parsedValues);
  const { error } = await context.supabase
    .from("production_prods")
    .update(values)
    .eq("company_id", context.companyId)
    .eq("id", id);

  if (error) return { ok: false, message: toUserFriendlyErrorMessage(error) };

  if (values.contract_id) {
    const { data: contract, error: contractError } = await context.supabase
      .from("production_contracts")
      .select("id, client_id")
      .eq("company_id", context.companyId)
      .eq("id", values.contract_id)
      .maybeSingle();

    if (contractError) return { ok: false, message: toUserFriendlyErrorMessage(contractError) };

    if (contract) {
      const { error: demandError } = await context.supabase
        .from("freight_demands")
        .update({
          contract_id: contract.id,
          client_id: contract.client_id,
        })
        .eq("company_id", context.companyId)
        .eq("prod_id", id);

      if (demandError) return { ok: false, message: toUserFriendlyErrorMessage(demandError) };
    }
  }

  revalidateProds(id);
  return { ok: true, message: "PROD atualizada com sucesso." };
}

export async function deleteProdAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  if (!context.isMaster) {
    return { ok: false, message: "Somente usuários administradores podem excluir PRODs." };
  }

  const id = String(formData.get("id") ?? "");

  if (!id) {
    return { ok: false, message: "PROD inválida." };
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from("production_prods")
    .delete()
    .eq("company_id", context.companyId)
    .eq("id", id);

  if (error) return { ok: false, message: toUserFriendlyErrorMessage(error) };
  revalidateProds();
  return { ok: true, message: "PROD excluída com sucesso." };
}

async function resetUnmovedAutoReleasedPieces(
  admin: SupabaseAdminClient,
  context: Extract<ActionContext, { ok: true }>,
  pieceIds: string[],
) {
  const uniquePieceIds = Array.from(new Set(pieceIds.filter(Boolean)));
  if (!uniquePieceIds.length) return;

  const [{ data: movedStages, error: movedStagesError }, { data: timeEntries, error: timeError }] =
    await Promise.all([
      admin
        .from("production_prod_piece_stages")
        .select("piece_id")
        .eq("company_id", context.companyId)
        .in("piece_id", uniquePieceIds)
        .neq("status", "nao_iniciada"),
      admin
        .from("production_stage_time_entries")
        .select("piece_id")
        .eq("company_id", context.companyId)
        .in("piece_id", uniquePieceIds),
    ]);

  if (movedStagesError) throw movedStagesError;
  if (timeError) throw timeError;

  const movedPieceIds = new Set<string>([
    ...((movedStages ?? []) as Array<{ piece_id: string }>).map((row) => row.piece_id),
    ...((timeEntries ?? []) as Array<{ piece_id: string }>).map((row) => row.piece_id),
  ]);
  const resetPieceIds = uniquePieceIds.filter((pieceId) => !movedPieceIds.has(pieceId));

  if (!resetPieceIds.length) return;

  const { error } = await admin
    .from("production_prod_pieces")
    .update({
      released_to_production: false,
      released_at: null,
      released_by: null,
    })
    .eq("company_id", context.companyId)
    .eq("released_to_production", true)
    .is("released_by", null)
    .in("id", resetPieceIds);

  if (error) throw error;
}

export async function importProdPiecesAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.prods.import_pieces",
    "Você não possui permissão para importar peças da PROD.",
  );

  if (permissionError) return permissionError;

  const prodId = String(formData.get("prod_id") ?? "");
  const fileName = String(formData.get("file_name") ?? "itens-da-obra.pdf").trim();
  const totalsJson = String(formData.get("totals_json") ?? "{}");

  if (!prodId) {
    return { ok: false, message: "PROD inválida." };
  }

  try {
    const pieces = parseJsonArray<ImportPiecePayload>(formData.get("pieces_json")).map(
      normalizeImportPiece,
    );
    const parsedTotals = JSON.parse(totalsJson) as Record<string, unknown>;

    if (!pieces.length) {
      return { ok: false, message: "A prévia não possui peças para importar." };
    }

    const admin = getSupabaseAdminClient();
    const { data: prod, error: prodError } = await admin
      .from("production_prods")
      .select("id")
      .eq("company_id", context.companyId)
      .eq("id", prodId)
      .maybeSingle();

    if (prodError) throw prodError;
    if (!prod) return { ok: false, message: "PROD não encontrada." };

    const codeCounts = pieces.reduce((counts, piece) => {
      counts.set(piece.piece_code, (counts.get(piece.piece_code) ?? 0) + 1);
      return counts;
    }, new Map<string, number>());
    const repeatedPreviewCodes = Array.from(codeCounts)
      .filter(([, count]) => count > 1)
      .map(([code]) => code);

    if (repeatedPreviewCodes.length) {
      return {
        ok: false,
        message: `A prévia possui códigos repetidos (${repeatedPreviewCodes.join(
          ", ",
        )}). Ajuste os códigos antes de importar.`,
      };
    }

    const { data: existingPieces, error: existingPiecesError } = await admin
      .from("production_prod_pieces")
      .select("piece_code, sort_order")
      .eq("company_id", context.companyId)
      .eq("prod_id", prodId);

    if (existingPiecesError) throw existingPiecesError;

    const existingCodeSet = new Set(
      ((existingPieces ?? []) as Array<{ piece_code: string; sort_order: number | null }>).map(
        (piece) => piece.piece_code,
      ),
    );
    const duplicatePieceCodes = pieces
      .filter((piece) => existingCodeSet.has(piece.piece_code))
      .map((piece) => piece.piece_code);
    const maxExistingSortOrder = Math.max(
      0,
      ...((existingPieces ?? []) as Array<{ sort_order: number | null }>).map((piece) =>
        Number(piece.sort_order ?? 0),
      ),
    );
    const newPieces = pieces
      .filter((piece) => !existingCodeSet.has(piece.piece_code))
      .map((piece, index) => ({
        ...piece,
        sort_order: maxExistingSortOrder + index + 1,
      }));

    if (!newPieces.length) {
      return {
        ok: false,
        message:
          "Todas as peças da prévia já estão cadastradas nesta PROD. Nenhuma peça nova foi importada.",
      };
    }

    const { data: importBatch, error: importError } = await admin
      .from("production_piece_imports")
      .insert({
        company_id: context.companyId,
        prod_id: prodId,
        file_name: fileName || "itens-da-obra.pdf",
        parsed_totals: {
          ...parsedTotals,
          skipped_duplicate_piece_codes: duplicatePieceCodes,
        },
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (importError) throw importError;

    const rows = newPieces.map((piece) => ({
      ...piece,
      company_id: context.companyId,
      prod_id: prodId,
      import_batch_id: importBatch.id,
      source: "pdf_itens_da_obra",
      created_by: context.userId,
    }));

    const { error: piecesError } = await admin
      .from("production_prod_pieces")
      .insert(rows);

    if (piecesError) throw piecesError;

    const [{ data: savedPieces, error: savedPiecesError }, { data: stages, error: stagesError }] =
      await Promise.all([
        admin
          .from("production_prod_pieces")
          .select("id, released_to_production")
          .eq("company_id", context.companyId)
          .eq("prod_id", prodId)
          .in(
            "piece_code",
            newPieces.map((piece) => piece.piece_code),
          ),
        admin
          .from("production_stages")
          .select("id")
          .eq("company_id", context.companyId)
          .eq("active", true)
          .gte("sort_order", 5)
          .lte("sort_order", 9),
      ]);

    if (savedPiecesError) throw savedPiecesError;
    if (stagesError) throw stagesError;

    const pieceStageRows = (savedPieces ?? []).flatMap((piece) =>
      (stages ?? []).map((stage) => ({
        company_id: context.companyId,
        prod_id: prodId,
        piece_id: piece.id,
        stage_id: stage.id,
      })),
    );

    if (pieceStageRows.length) {
      const { error: stageRowsError } = await admin
        .from("production_prod_piece_stages")
        .upsert(pieceStageRows, { onConflict: "company_id,piece_id,stage_id" });

      if (stageRowsError) throw stageRowsError;
    }

    await resetUnmovedAutoReleasedPieces(
      admin,
      context,
      (savedPieces ?? []).map((piece) => String(piece.id)),
    );

    await admin.rpc("refresh_prod_piece_totals", { target_prod_id: prodId });

    const { error: auditError } = await admin.from("audit_logs").insert({
      company_id: context.companyId,
      entity: "production_prods",
      entity_id: prodId,
      action: "Importação de peças",
      user_id: context.userId,
      after_data: {
        import_batch_id: importBatch.id,
        file_name: fileName || "itens-da-obra.pdf",
        pieces_count: newPieces.length,
        skipped_duplicate_piece_codes: duplicatePieceCodes,
        totals: parsedTotals,
      },
      notes: `${newPieces.length} peça(s) importada(s) pelo PDF ${
        fileName || "itens-da-obra.pdf"
      }.${
        duplicatePieceCodes.length
          ? ` ${duplicatePieceCodes.length} peça(s) duplicada(s) ignorada(s).`
          : ""
      }`,
    });

    if (auditError) throw auditError;

    revalidateProds(prodId);
    return {
      ok: true,
      message: `${newPieces.length} peça(s) nova(s) importada(s) para a PROD.${
        duplicatePieceCodes.length
          ? ` ${duplicatePieceCodes.length} peça(s) duplicada(s) foram ignorada(s).`
          : ""
      }`,
    };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function saveManualProdPieceAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const canSavePieces = await hasAnyActionPermission(context, [
    "production.prods.import_pieces",
    "production.prods.manage_pieces",
  ]);

  if (!canSavePieces) {
    return {
      ok: false,
      message: "Você não possui permissão para cadastrar peças da PROD.",
    };
  }

  const prodId = String(formData.get("prod_id") ?? "");

  if (!prodId) {
    return { ok: false, message: "PROD inválida." };
  }

  function nullableField(name: string) {
    const value = formData.get(name);
    return typeof value === "string" && value.trim() ? value : null;
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data: prod, error: prodError } = await admin
      .from("production_prods")
      .select("id")
      .eq("company_id", context.companyId)
      .eq("id", prodId)
      .maybeSingle();

    if (prodError) throw prodError;
    if (!prod) return { ok: false, message: "PROD não encontrada." };

    const piece = normalizeImportPiece(
      {
        piece_code: formData.get("piece_code"),
        system_code: nullableField("system_code"),
        system_description: nullableField("system_description"),
        quantity: formData.get("quantity"),
        width_mm: nullableField("width_mm"),
        height_mm: nullableField("height_mm"),
        measure_a: nullableField("measure_a"),
        measure_b: nullableField("measure_b"),
        location: nullableField("location"),
        area_m2: formData.get("area_m2"),
        unit_weight_kg: formData.get("unit_weight_kg"),
        total_weight_kg: formData.get("total_weight_kg"),
        sort_order: nullableField("sort_order"),
        notes: nullableField("notes"),
      },
      0,
    );

    if (!nullableField("sort_order")) {
      const { data: lastPiece, error: lastPieceError } = await admin
        .from("production_prod_pieces")
        .select("sort_order")
        .eq("company_id", context.companyId)
        .eq("prod_id", prodId)
        .order("sort_order", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastPieceError) throw lastPieceError;
      piece.sort_order = Number(lastPiece?.sort_order ?? 0) + 1;
    }

    const { data: savedPiece, error: pieceError } = await admin
      .from("production_prod_pieces")
      .upsert(
        {
          ...piece,
          company_id: context.companyId,
          prod_id: prodId,
          source: "manual",
          created_by: context.userId,
        },
        { onConflict: "company_id,prod_id,piece_code" },
      )
      .select("id")
      .single();

    if (pieceError) throw pieceError;

    const { data: stages, error: stagesError } = await admin
      .from("production_stages")
      .select("id")
      .eq("company_id", context.companyId)
      .eq("active", true)
      .gte("sort_order", 5)
      .lte("sort_order", 9);

    if (stagesError) throw stagesError;

    const pieceStageRows = (stages ?? []).map((stage) => ({
      company_id: context.companyId,
      prod_id: prodId,
      piece_id: savedPiece.id,
      stage_id: stage.id,
    }));

    if (pieceStageRows.length) {
      const { error: stageRowsError } = await admin
        .from("production_prod_piece_stages")
        .upsert(pieceStageRows, { onConflict: "company_id,piece_id,stage_id" });

      if (stageRowsError) throw stageRowsError;
    }

    await admin.rpc("refresh_prod_piece_totals", { target_prod_id: prodId });

    const { error: auditError } = await admin.from("audit_logs").insert({
      company_id: context.companyId,
      entity: "production_prods",
      entity_id: prodId,
      action: "Cadastro manual de peça",
      user_id: context.userId,
      after_data: {
        piece_id: savedPiece.id,
        piece_code: piece.piece_code,
        source: "manual",
      },
      notes: `Peça ${piece.piece_code} cadastrada manualmente na PROD.`,
    });

    if (auditError) throw auditError;

    revalidateProds(prodId);
    return { ok: true, message: "Peça cadastrada na PROD." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function updateProdPieceAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const [canEditPiece, canUpdateStages] = await Promise.all([
    hasAnyActionPermission(context, [
      "production.prods.import_pieces",
      "production.prods.manage_pieces",
    ]),
    hasActionPermission(context, "production.prods.update_stage"),
  ]);

  if (!canEditPiece && !canUpdateStages) {
    return {
      ok: false,
      message: "Você não possui permissão para editar peças ou etapas da PROD.",
    };
  }

  const pieceId = String(formData.get("piece_id") ?? "");
  const prodId = String(formData.get("prod_id") ?? "");

  if (!pieceId || !prodId) {
    return { ok: false, message: "Peça inválida." };
  }

  const stageUpdates = formData
    .getAll("piece_stage_status")
    .map(String)
    .map((value) => {
      const [id, status] = value.split(":");
      return { id, status };
    })
    .filter((item) => item.id && directPieceStageStatuses.has(item.status));

  try {
    const admin = getSupabaseAdminClient();
    const { data: piece, error: pieceReadError } = await admin
      .from("production_prod_pieces")
      .select("id, prod_id, piece_code")
      .eq("company_id", context.companyId)
      .eq("prod_id", prodId)
      .eq("id", pieceId)
      .maybeSingle();

    if (pieceReadError) throw pieceReadError;
    if (!piece) return { ok: false, message: "Peça não encontrada." };

    if (canEditPiece) {
      const nextPiece = readPiecePayloadFromForm(formData);
      const { error: pieceUpdateError } = await admin
        .from("production_prod_pieces")
        .update({
          ...nextPiece,
          updated_at: new Date().toISOString(),
        })
        .eq("company_id", context.companyId)
        .eq("prod_id", prodId)
        .eq("id", pieceId);

      if (pieceUpdateError) throw pieceUpdateError;
    }

    const updatedStageIds: string[] = [];

    if (canUpdateStages && stageUpdates.length) {
      const nowIso = new Date().toISOString();
      const { data: existingStages, error: stageReadError } = await admin
        .from("production_prod_piece_stages")
        .select("id, prod_id, piece_id, stage_id, status, started_at, completed_at")
        .eq("company_id", context.companyId)
        .eq("prod_id", prodId)
        .eq("piece_id", pieceId)
        .in(
          "id",
          stageUpdates.map((update) => update.id),
        );

      if (stageReadError) throw stageReadError;

      const stageById = new Map((existingStages ?? []).map((stage) => [String(stage.id), stage]));
      const changedProdStagePairs = new Set<string>();

      for (const update of stageUpdates) {
        const existingStage = stageById.get(update.id);
        if (!existingStage || existingStage.status === update.status) continue;

        const nextValues: Record<string, unknown> = {
          status: update.status,
          last_action: null,
          last_action_at: nowIso,
          notes: nullableFormField(formData, `stage_notes_${update.id}`),
          blockers:
            update.status === "com_pendencia"
              ? nullableFormField(formData, `stage_blockers_${update.id}`)
              : null,
        };

        if (update.status === "em_andamento" && !existingStage.started_at) {
          nextValues.started_at = nowIso;
          nextValues.completed_at = null;
        }

        if (update.status === "concluida") {
          nextValues.started_at = existingStage.started_at ?? nowIso;
          nextValues.completed_at = nowIso;
        }

        if (update.status === "nao_aplicavel") {
          nextValues.started_at = null;
          nextValues.completed_at = nowIso;
          nextValues.total_productive_seconds = 0;
          nextValues.total_paused_seconds = 0;
          nextValues.current_operator_id = null;
        }

        if (["nao_iniciada", "aguardando"].includes(update.status)) {
          nextValues.started_at = null;
          nextValues.completed_at = null;
        }

        const { error: stageUpdateError } = await admin
          .from("production_prod_piece_stages")
          .update(nextValues)
          .eq("company_id", context.companyId)
          .eq("id", update.id);

        if (stageUpdateError) throw stageUpdateError;

        updatedStageIds.push(update.id);
        changedProdStagePairs.add(`${existingStage.prod_id}:${existingStage.stage_id}`);

        if (update.status === "concluida" || update.status === "nao_aplicavel") {
          const { data: orderedStages, error: orderedStagesError } = await admin
            .from("production_stages")
            .select("id, active, sort_order")
            .eq("company_id", context.companyId)
            .eq("active", true)
            .order("sort_order", { ascending: true });

          if (orderedStagesError) throw orderedStagesError;

          const pointingStages = getPointingStages(
            (orderedStages ?? []) as Array<{ id: string; active: boolean; sort_order: number }>,
          );
          const stageIndex = pointingStages.findIndex(
            (stage) => stage.id === String(existingStage.stage_id),
          );
          const nextStage = stageIndex >= 0 ? pointingStages[stageIndex + 1] : null;

          if (nextStage) {
            const { error: nextStageError } = await admin
              .from("production_prod_piece_stages")
              .update({ status: "aguardando" })
              .eq("company_id", context.companyId)
              .eq("prod_id", prodId)
              .eq("piece_id", pieceId)
              .eq("stage_id", nextStage.id)
              .eq("status", "nao_iniciada");

            if (nextStageError) throw nextStageError;
            changedProdStagePairs.add(`${existingStage.prod_id}:${nextStage.id}`);
          }
        }
      }

      for (const pair of changedProdStagePairs) {
        const [changedProdId, changedStageId] = pair.split(":");
        await refreshProdStageFromPieces(context, changedProdId, changedStageId);
      }
    }

    await admin.rpc("refresh_prod_piece_totals", { target_prod_id: prodId });

    const { error: auditError } = await admin.from("audit_logs").insert({
      company_id: context.companyId,
      entity: "production_prod_pieces",
      entity_id: pieceId,
      action: "Edição de peça da PROD",
      user_id: context.userId,
      after_data: {
        piece_code: String(formData.get("piece_code") ?? piece.piece_code),
        stage_ids: updatedStageIds,
      },
      notes: `Peça ${String(formData.get("piece_code") ?? piece.piece_code)} atualizada na PROD.`,
    });

    if (auditError) throw auditError;

    revalidateProds(prodId);
    return { ok: true, message: "Peça atualizada na PROD." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function deleteProdPieceAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.prods.manage_pieces",
    "Você não possui permissão para gerenciar peças da PROD.",
  );

  if (permissionError) return permissionError;

  const pieceId = String(formData.get("piece_id") ?? "");
  const prodId = String(formData.get("prod_id") ?? "");

  if (!pieceId || !prodId) {
    return { ok: false, message: "Peça inválida." };
  }

  const admin = getSupabaseAdminClient();
  const { error } = await admin
    .from("production_prod_pieces")
    .delete()
    .eq("company_id", context.companyId)
    .eq("prod_id", prodId)
    .eq("id", pieceId);

  if (error) return { ok: false, message: toUserFriendlyErrorMessage(error) };
  await admin.rpc("refresh_prod_piece_totals", { target_prod_id: prodId });
  revalidateProds(prodId);
  return { ok: true, message: "Peça excluída da PROD." };
}

async function firstPointingStageId(
  admin: SupabaseAdminClient,
  context: Extract<ActionContext, { ok: true }>,
) {
  const { data, error } = await admin
    .from("production_stages")
    .select("id")
    .eq("company_id", context.companyId)
    .eq("active", true)
    .gte("sort_order", 5)
    .lte("sort_order", 9)
    .order("sort_order", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data?.id ? String(data.id) : null;
}

export async function releaseProdPiecesToProductionAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.prods.release_to_production",
    "Você não possui permissão para liberar lote de produção.",
  );

  if (permissionError) return permissionError;

  const prodId = String(formData.get("prod_id") ?? "");
  if (!prodId) return { ok: false, message: "PROD inválida." };

  try {
    const admin = getSupabaseAdminClient();
    const { data: autoReleasedPieces, error: autoReleasedError } = await admin
      .from("production_prod_pieces")
      .select("id")
      .eq("company_id", context.companyId)
      .eq("prod_id", prodId)
      .eq("released_to_production", true)
      .is("released_by", null);

    if (autoReleasedError) throw autoReleasedError;

    await resetUnmovedAutoReleasedPieces(
      admin,
      context,
      (autoReleasedPieces ?? []).map((piece) => String(piece.id)),
    );

    const { data: pieces, error: piecesError } = await admin
      .from("production_prod_pieces")
      .select("id, piece_code")
      .eq("company_id", context.companyId)
      .eq("prod_id", prodId)
      .eq("released_to_production", false);

    if (piecesError) throw piecesError;
    if (!(pieces ?? []).length) {
      return { ok: false, message: "Não há peças aguardando liberação nesta PROD." };
    }

    const firstStageId = await firstPointingStageId(admin, context);
    if (!firstStageId) return { ok: false, message: "Nenhuma etapa de apontamento ativa." };

    const nowIso = new Date().toISOString();
    const pieceIds = (pieces ?? []).map((piece) => String(piece.id));

    const { error: pieceUpdateError } = await admin
      .from("production_prod_pieces")
      .update({
        released_to_production: true,
        released_at: nowIso,
        released_by: context.userId,
      })
      .eq("company_id", context.companyId)
      .eq("prod_id", prodId)
      .in("id", pieceIds);

    if (pieceUpdateError) throw pieceUpdateError;

    const { error: stageUpdateError } = await admin
      .from("production_prod_piece_stages")
      .update({ status: "aguardando" })
      .eq("company_id", context.companyId)
      .eq("prod_id", prodId)
      .eq("stage_id", firstStageId)
      .eq("status", "nao_iniciada")
      .in("piece_id", pieceIds);

    if (stageUpdateError) throw stageUpdateError;

    await refreshProdStageFromPieces(context, prodId, firstStageId);

    const { error: auditError } = await admin.from("audit_logs").insert({
      company_id: context.companyId,
      entity: "production_prods",
      entity_id: prodId,
      action: "Liberação para produção",
      user_id: context.userId,
      after_data: {
        piece_ids: pieceIds,
        pieces_count: pieceIds.length,
      },
      notes: `${pieceIds.length} peça(s) liberada(s) para produção.`,
    });

    if (auditError) throw auditError;

    revalidatePointing([prodId]);
    return { ok: true, message: `${pieceIds.length} peça(s) liberada(s) para produção.` };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function revertProdPiecesReleaseAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.prods.release_to_production",
    "Você não possui permissão para estornar liberação de produção.",
  );

  if (permissionError) return permissionError;

  const prodId = String(formData.get("prod_id") ?? "");
  if (!prodId) return { ok: false, message: "PROD inválida." };

  try {
    const admin = getSupabaseAdminClient();
    const { data: prod, error: prodError } = await admin
      .from("production_prods")
      .select("id")
      .eq("company_id", context.companyId)
      .eq("id", prodId)
      .maybeSingle();

    if (prodError) throw prodError;
    if (!prod) return { ok: false, message: "PROD não encontrada." };

    const { data: releasedPieces, error: releasedPiecesError } = await admin
      .from("production_prod_pieces")
      .select("id")
      .eq("company_id", context.companyId)
      .eq("prod_id", prodId)
      .eq("released_to_production", true);

    if (releasedPiecesError) throw releasedPiecesError;

    const pieceIds = (releasedPieces ?? []).map((piece) => String(piece.id));
    if (!pieceIds.length) {
      return { ok: false, message: "Esta PROD não possui peças liberadas para produção." };
    }

    const [{ data: timeEntries, error: timeEntriesError }, { data: movedStages, error: movedStagesError }] =
      await Promise.all([
        admin
          .from("production_stage_time_entries")
          .select("id")
          .eq("company_id", context.companyId)
          .eq("prod_id", prodId)
          .limit(1),
        admin
          .from("production_prod_piece_stages")
          .select("id")
          .eq("company_id", context.companyId)
          .eq("prod_id", prodId)
          .in("piece_id", pieceIds)
          .not("status", "in", "(nao_iniciada,aguardando)")
          .limit(1),
      ]);

    if (timeEntriesError) throw timeEntriesError;
    if (movedStagesError) throw movedStagesError;

    if ((timeEntries ?? []).length || (movedStages ?? []).length) {
      return {
        ok: false,
        message: "Esta PROD já possui apontamentos ou movimentações e não pode voltar para aguardando liberação.",
      };
    }

    const { error: stageResetError } = await admin
      .from("production_prod_piece_stages")
      .update({
        status: "nao_iniciada",
        started_at: null,
        completed_at: null,
        total_productive_seconds: 0,
        total_paused_seconds: 0,
        current_operator_id: null,
        last_action: null,
        last_action_at: null,
        notes: null,
        blockers: null,
      })
      .eq("company_id", context.companyId)
      .eq("prod_id", prodId)
      .in("piece_id", pieceIds);

    if (stageResetError) throw stageResetError;

    const { error: pieceResetError } = await admin
      .from("production_prod_pieces")
      .update({
        released_to_production: false,
        released_at: null,
        released_by: null,
      })
      .eq("company_id", context.companyId)
      .eq("prod_id", prodId)
      .in("id", pieceIds);

    if (pieceResetError) throw pieceResetError;

    const { error: auditError } = await admin.from("audit_logs").insert({
      company_id: context.companyId,
      entity: "production_prods",
      entity_id: prodId,
      action: "Estorno de liberação para produção",
      user_id: context.userId,
      after_data: {
        piece_ids: pieceIds,
        pieces_count: pieceIds.length,
      },
      notes: `${pieceIds.length} peça(s) retornada(s) para aguardando liberação da gestão.`,
    });

    if (auditError) throw auditError;

    revalidatePointing([prodId]);
    return {
      ok: true,
      message: `${pieceIds.length} peça(s) retornada(s) para aguardando liberação.`,
    };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

async function validateReworkReason(
  admin: SupabaseAdminClient,
  context: Extract<ActionContext, { ok: true }>,
  id: string | null,
  kind: "motivo" | "origem",
) {
  if (!id) return null;

  const { data, error } = await admin
    .from("production_rework_reasons")
    .select("id")
    .eq("company_id", context.companyId)
    .eq("id", id)
    .eq("kind", kind)
    .eq("active", true)
    .maybeSingle();

  if (error) throw error;
  if (!data) throw new Error(kind === "motivo" ? "Motivo de retrabalho inválido." : "Origem de retrabalho inválida.");
  return id;
}

async function releaseReworkToProductionStage(
  admin: SupabaseAdminClient,
  context: Extract<ActionContext, { ok: true }>,
  values: {
    reworkId: string;
    prodId: string;
    pieceId: string;
    targetStageId: string;
  },
) {
  const { data: stages, error: stagesError } = await admin
    .from("production_stages")
    .select("id, active, sort_order")
    .eq("company_id", context.companyId)
    .eq("active", true)
    .order("sort_order", { ascending: true });

  if (stagesError) throw stagesError;

  const pointingStages = getPointingStages(
    (stages ?? []) as Array<{ id: string; active: boolean; sort_order: number }>,
  );
  const targetIndex = pointingStages.findIndex((stage) => stage.id === values.targetStageId);
  if (targetIndex < 0) throw new Error("Selecione uma etapa válida para liberar o retrabalho.");

  const stageIndexById = new Map(pointingStages.map((stage, index) => [stage.id, index]));
  const { data: pieceStages, error: pieceStagesError } = await admin
    .from("production_prod_piece_stages")
    .select("id, stage_id")
    .eq("company_id", context.companyId)
    .eq("prod_id", values.prodId)
    .eq("piece_id", values.pieceId);

  if (pieceStagesError) throw pieceStagesError;

  for (const pieceStage of pieceStages ?? []) {
    const stageIndex = stageIndexById.get(String(pieceStage.stage_id));
    if (stageIndex == null || stageIndex < targetIndex) continue;

    const isTargetStage = String(pieceStage.stage_id) === values.targetStageId;
    const { error: updateError } = await admin
      .from("production_prod_piece_stages")
      .update({
        status: isTargetStage ? "aguardando" : "nao_iniciada",
        started_at: null,
        completed_at: null,
        total_productive_seconds: 0,
        total_paused_seconds: 0,
        current_operator_id: null,
        last_action: null,
        last_action_at: null,
        notes: null,
        blockers: null,
        active_rework_id: isTargetStage ? values.reworkId : null,
      })
      .eq("company_id", context.companyId)
      .eq("id", pieceStage.id);

    if (updateError) throw updateError;
    await refreshProdStageFromPieces(context, values.prodId, String(pieceStage.stage_id));
  }

  const { error: reworkError } = await admin
    .from("production_piece_reworks")
    .update({
      status: "liberado_para_producao",
      target_stage_id: values.targetStageId,
      updated_by: context.userId,
    })
    .eq("company_id", context.companyId)
    .eq("id", values.reworkId);

  if (reworkError) throw reworkError;
}

export async function registerPieceReworkAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.rework.manage",
    "Você não possui permissão para registrar retrabalhos.",
  );

  if (permissionError) return permissionError;

  const prodId = String(formData.get("prod_id") ?? "");
  const pieceId = String(formData.get("piece_id") ?? "");
  const reasonId = textOrNull(formData.get("reason_id"));
  const originId = textOrNull(formData.get("origin_id"));
  const targetStageId = textOrNull(formData.get("target_stage_id"));
  const priority = String(formData.get("priority") ?? "normal");
  const returnedAt = String(formData.get("returned_at") ?? new Date().toISOString().slice(0, 10));
  const needsTechnicalInfo = formData.get("needs_technical_info") === "on";
  const needsMaterialPurchase = formData.get("needs_material_purchase") === "on";
  const description = textOrNull(formData.get("description"));
  const technicalGuidance = textOrNull(formData.get("technical_guidance"));
  const materialNotes = textOrNull(formData.get("material_notes"));

  if (!prodId || !pieceId) return { ok: false, message: "Peça inválida para retrabalho." };
  if (!reasonId || !originId) {
    return { ok: false, message: "Informe o motivo e a origem do retrabalho." };
  }
  if (!needsTechnicalInfo && !needsMaterialPurchase && !targetStageId) {
    return { ok: false, message: "Informe a etapa para liberar o retrabalho ou marque uma pendência." };
  }

  try {
    const admin = getSupabaseAdminClient();
    await validateReworkReason(admin, context, reasonId, "motivo");
    await validateReworkReason(admin, context, originId, "origem");

    const nextStatus = needsTechnicalInfo
      ? "em_analise_tecnica"
      : needsMaterialPurchase
        ? "aguardando_material"
        : "registrado";

    const { data: rework, error } = await admin
      .from("production_piece_reworks")
      .insert({
        company_id: context.companyId,
        prod_id: prodId,
        piece_id: pieceId,
        reason_id: reasonId,
        origin_id: originId,
        target_stage_id: targetStageId,
        status: nextStatus,
        priority,
        returned_at: returnedAt,
        needs_technical_info: needsTechnicalInfo,
        needs_material_purchase: needsMaterialPurchase,
        technical_guidance: technicalGuidance,
        material_notes: materialNotes,
        description,
        created_by: context.userId,
        updated_by: context.userId,
      })
      .select("id")
      .single();

    if (error) throw error;

    if (!needsTechnicalInfo && !needsMaterialPurchase && targetStageId) {
      await releaseReworkToProductionStage(admin, context, {
        reworkId: String(rework.id),
        prodId,
        pieceId,
        targetStageId,
      });
    }

    const { error: auditError } = await admin.from("audit_logs").insert({
      company_id: context.companyId,
      entity: "production_prod_pieces",
      entity_id: pieceId,
      action: "Registro de retrabalho",
      user_id: context.userId,
      after_data: {
        rework_id: rework.id,
        reason_id: reasonId,
        origin_id: originId,
        status: nextStatus,
      },
      notes: description,
    });

    if (auditError) throw auditError;

    revalidateProds(prodId);
    return { ok: true, message: "Retrabalho registrado." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function releasePieceReworkAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.rework.manage",
    "Você não possui permissão para liberar retrabalhos.",
  );

  if (permissionError) return permissionError;

  const reworkId = String(formData.get("rework_id") ?? "");
  const targetStageId = String(formData.get("target_stage_id") ?? "");
  const technicalGuidance = textOrNull(formData.get("technical_guidance"));
  const materialNotes = textOrNull(formData.get("material_notes"));

  if (!reworkId || !targetStageId) {
    return { ok: false, message: "Informe o retrabalho e a etapa de retorno." };
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data: rework, error } = await admin
      .from("production_piece_reworks")
      .select("id, prod_id, piece_id")
      .eq("company_id", context.companyId)
      .eq("id", reworkId)
      .maybeSingle();

    if (error) throw error;
    if (!rework) return { ok: false, message: "Retrabalho não encontrado." };

    const { error: updateReworkError } = await admin
      .from("production_piece_reworks")
      .update({
        technical_guidance: technicalGuidance,
        material_notes: materialNotes,
        needs_technical_info: false,
        needs_material_purchase: false,
        updated_by: context.userId,
      })
      .eq("company_id", context.companyId)
      .eq("id", reworkId);

    if (updateReworkError) throw updateReworkError;

    await releaseReworkToProductionStage(admin, context, {
      reworkId,
      prodId: String(rework.prod_id),
      pieceId: String(rework.piece_id),
      targetStageId,
    });

    revalidateProds(String(rework.prod_id));
    return { ok: true, message: "Retrabalho liberado para produção." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function adjustProductionPieceStageTimeAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.pointing.adjust_time",
    "Você não possui permissão para ajustar tempos de apontamento.",
  );

  if (permissionError) return permissionError;

  const pieceStageId = String(formData.get("piece_stage_id") ?? "");
  const operatorRegistration = String(formData.get("operator_registration") ?? "").trim();
  const operatorPin = String(formData.get("operator_pin") ?? "").trim();
  const timezoneOffsetMinutes = Math.trunc(Number(formData.get("timezone_offset_minutes") ?? 0));
  const startedAt = parseLocalDateTime(formData.get("started_at"), timezoneOffsetMinutes);
  const finishedAt = parseLocalDateTime(formData.get("finished_at"), timezoneOffsetMinutes);
  const notes = textOrNull(formData.get("notes"));

  if (!pieceStageId) {
    return { ok: false, message: "Etapa da peça inválida." };
  }

  if (!operatorRegistration || !operatorPin) {
    return { ok: false, message: "Informe a matrícula e a senha do operador." };
  }

  if (!isValidOperatorRegistration(operatorRegistration) || !isValidOperatorPin(operatorPin)) {
    return { ok: false, message: "Informe matrícula com 3 dígitos e senha com 4 dígitos." };
  }

  if (!startedAt || !finishedAt || finishedAt <= startedAt) {
    return { ok: false, message: "Informe horário inicial e final válidos." };
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data: operator, error: operatorError } = await admin
      .from("production_operators")
      .select("id, name, registration, pin_hash, active")
      .eq("company_id", context.companyId)
      .eq("registration", operatorRegistration)
      .eq("active", true)
      .maybeSingle();

    if (operatorError) throw operatorError;
    if (!operator) return { ok: false, message: "Operador não encontrado ou inativo." };

    const { data: validPin, error: pinError } = await admin.rpc(
      "verify_production_operator_pin",
      {
        stored_hash: operator.pin_hash,
        plain_pin: operatorPin,
      },
    );

    if (pinError) throw pinError;
    if (!validPin) return { ok: false, message: "Matrícula ou senha inválida." };

    const { data: pieceStage, error: pieceStageError } = await admin
      .from("production_prod_piece_stages")
      .select(
        "id, prod_id, piece_id, stage_id, status, started_at, completed_at, total_productive_seconds, active_rework_id",
      )
      .eq("company_id", context.companyId)
      .eq("id", pieceStageId)
      .maybeSingle();

    if (pieceStageError) throw pieceStageError;
    if (!pieceStage) return { ok: false, message: "Etapa da peça não encontrada." };

    const productiveSeconds = Math.floor((finishedAt.getTime() - startedAt.getTime()) / 1000);
    const currentProductive = Number(pieceStage.total_productive_seconds ?? 0);
    const delta = productiveSeconds - currentProductive;
    const nextValues: Record<string, unknown> = {
      total_productive_seconds: productiveSeconds,
      current_operator_id: operator.id,
      started_at: pieceStage.started_at ?? startedAt.toISOString(),
      last_action: "ajuste_tempo",
      last_action_at: finishedAt.toISOString(),
      notes,
    };

    if (pieceStage.status === "concluida" && !pieceStage.completed_at) {
      nextValues.completed_at = finishedAt.toISOString();
    }

    const { error: updateError } = await admin
      .from("production_prod_piece_stages")
      .update(nextValues)
      .eq("company_id", context.companyId)
      .eq("id", pieceStageId);

    if (updateError) throw updateError;

    const pointingSessionId = await createPointingSession(admin, context, {
      prodIds: [pieceStage.prod_id],
      stageId: pieceStage.stage_id,
      operatorId: operator.id,
      pointingReasonId: null,
      reworkId: pieceStage.active_rework_id ?? null,
      action: "ajuste_tempo",
      eventAt: finishedAt.toISOString(),
      productiveSecondsDelta: delta,
      pausedSecondsDelta: 0,
      pieceCount: 1,
      notes,
      pauseReason: null,
    });

    const { error: entryError } = await admin.from("production_stage_time_entries").insert({
      company_id: context.companyId,
      pointing_session_id: pointingSessionId,
      pointing_reason_id: null,
      rework_id: pieceStage.active_rework_id ?? null,
      prod_id: pieceStage.prod_id,
      piece_id: pieceStage.piece_id,
      stage_id: pieceStage.stage_id,
      piece_stage_id: pieceStage.id,
      operator_id: operator.id,
      session_profile_id: context.profileId,
      auth_user_id: context.userId,
      action: "ajuste_tempo",
      event_at: finishedAt.toISOString(),
      productive_seconds_delta: delta,
      paused_seconds_delta: 0,
      notes:
        notes ??
        `Ajuste manual de tempo produtivo: ${startedAt.toISOString()} até ${finishedAt.toISOString()}.`,
      pause_reason: null,
    });

    if (entryError) throw entryError;

    const { error: auditError } = await admin.from("audit_logs").insert({
      company_id: context.companyId,
      entity: "production_prod_piece_stages",
      entity_id: pieceStageId,
      action: "Ajuste de tempo de apontamento",
      user_id: context.userId,
      after_data: {
        operator_id: operator.id,
        started_at: startedAt.toISOString(),
        finished_at: finishedAt.toISOString(),
        productive_seconds: productiveSeconds,
        previous_productive_seconds: currentProductive,
      },
      notes,
    });

    if (auditError) throw auditError;

    await refreshProdStageFromPieces(context, pieceStage.prod_id, pieceStage.stage_id);
    revalidatePointing([pieceStage.prod_id]);
    revalidatePath("/reports");
    return { ok: true, message: "Tempo de apontamento ajustado." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

function readLoadChecklistFromForm(formData: FormData, pieceStageId: string) {
  return Object.fromEntries(
    LOAD_CONTROL_ITEMS.map((item) => [
      item.key,
      {
        checked: formData.get(`load_${pieceStageId}_${item.key}`) === "on",
        notes: textOrNull(formData.get(`load_note_${pieceStageId}_${item.key}`)),
      },
    ]),
  );
}

export async function saveExpeditionLoadControlAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.pointing.perform",
    "Você não possui permissão para preencher o controle de carga.",
  );

  if (permissionError) return permissionError;

  const pieceStageIds = Array.from(new Set(idsFromForm(formData, "piece_stage_id")));
  if (!pieceStageIds.length) {
    return { ok: false, message: "Nenhuma peça de expedição foi informada." };
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data: pieceStages, error: pieceStageError } = await admin
      .from("production_prod_piece_stages")
      .select("id, prod_id, stage_id")
      .eq("company_id", context.companyId)
      .in("id", pieceStageIds);

    if (pieceStageError) throw pieceStageError;
    if ((pieceStages ?? []).length !== pieceStageIds.length) {
      return { ok: false, message: "Uma ou mais peças de expedição não foram encontradas." };
    }

    const stageIds = Array.from(new Set((pieceStages ?? []).map((pieceStage) => pieceStage.stage_id)));
    const { data: stages, error: stagesError } = await admin
      .from("production_stages")
      .select("id, sort_order")
      .eq("company_id", context.companyId)
      .in("id", stageIds);

    if (stagesError) throw stagesError;

    const stageOrderById = new Map((stages ?? []).map((stage) => [String(stage.id), Number(stage.sort_order)]));
    const hasOnlyExpeditionStages = (pieceStages ?? []).every(
      (pieceStage) => stageOrderById.get(String(pieceStage.stage_id)) === 9,
    );

    if (!hasOnlyExpeditionStages) {
      return { ok: false, message: "O controle de carga só pode ser preenchido na etapa de Expedição." };
    }

    const nowIso = new Date().toISOString();
    const prodIds = new Set<string>();

    for (const pieceStage of pieceStages ?? []) {
      const pieceStageId = String(pieceStage.id);
      const volumeCount = Math.max(
        0,
        Math.trunc(Number(formData.get(`volume_${pieceStageId}`) ?? 0)),
      );

      const { error: updateError } = await admin
        .from("production_prod_piece_stages")
        .update({
          load_volume_count: volumeCount,
          load_checklist: readLoadChecklistFromForm(formData, pieceStageId),
          load_checked_at: nowIso,
          load_checked_by: context.userId,
        })
        .eq("company_id", context.companyId)
        .eq("id", pieceStageId);

      if (updateError) throw updateError;
      prodIds.add(String(pieceStage.prod_id));
    }

    revalidatePointing(Array.from(prodIds));
    return { ok: true, message: "Controle de carga salvo." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function completeExpeditionLoadControlAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.pointing.perform",
    "Você não possui permissão para finalizar a expedição.",
  );

  if (permissionError) return permissionError;

  const pieceStageIds = Array.from(
    new Set(parseJsonArray<string>(formData.get("piece_stage_ids_json")).filter(Boolean)),
  );
  const operatorRegistration = String(formData.get("operator_registration") ?? "").trim();
  const operatorPin = String(formData.get("operator_pin") ?? "").trim();
  const participantRegistrations = participantRegistrationsFromForm(formData);
  const notes = textOrNull(formData.get("notes"));

  if (!pieceStageIds.length) {
    return { ok: false, message: "Selecione ao menos uma peça para finalizar a expedição." };
  }

  if (!operatorRegistration || !operatorPin) {
    return { ok: false, message: "Informe a matrícula e a senha do operador." };
  }

  if (!isValidOperatorRegistration(operatorRegistration) || !isValidOperatorPin(operatorPin)) {
    return { ok: false, message: "Informe matrícula com 3 dígitos e senha com 4 dígitos." };
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data: operator, error: operatorError } = await admin
      .from("production_operators")
      .select("id, name, registration, pin_hash, active")
      .eq("company_id", context.companyId)
      .eq("registration", operatorRegistration)
      .eq("active", true)
      .maybeSingle();

    if (operatorError) throw operatorError;
    if (!operator) return { ok: false, message: "Operador não encontrado ou inativo." };

    const { data: validPin, error: pinError } = await admin.rpc(
      "verify_production_operator_pin",
      {
        stored_hash: operator.pin_hash,
        plain_pin: operatorPin,
      },
    );

    if (pinError) throw pinError;
    if (!validPin) return { ok: false, message: "Matrícula ou senha inválida." };

    const { data: pieceStages, error: pieceStagesError } = await admin
      .from("production_prod_piece_stages")
      .select("id, prod_id, piece_id, stage_id, status, load_volume_count")
      .eq("company_id", context.companyId)
      .in("id", pieceStageIds);

    if (pieceStagesError) throw pieceStagesError;
    if ((pieceStages ?? []).length !== pieceStageIds.length) {
      return { ok: false, message: "Uma ou mais peças selecionadas não foram encontradas." };
    }

    const typedPieceStages = (pieceStages ?? []) as Array<{
      id: string;
      prod_id: string;
      piece_id: string;
      stage_id: string;
      status: string;
      load_volume_count: number | null;
    }>;
    const stageIds = Array.from(new Set(typedPieceStages.map((pieceStage) => pieceStage.stage_id)));
    const pieceIds = Array.from(new Set(typedPieceStages.map((pieceStage) => pieceStage.piece_id)));

    if (stageIds.length !== 1) {
      return { ok: false, message: "Selecione peças de uma única etapa de expedição." };
    }

    const [{ data: stages, error: stagesError }, { data: allPieceStages, error: allPieceStagesError }] =
      await Promise.all([
        admin
          .from("production_stages")
          .select("id, active, sort_order")
          .eq("company_id", context.companyId)
          .order("sort_order", { ascending: true }),
        admin
          .from("production_prod_piece_stages")
          .select("id, prod_id, piece_id, stage_id, status")
          .eq("company_id", context.companyId)
          .in("piece_id", pieceIds),
      ]);

    if (stagesError) throw stagesError;
    if (allPieceStagesError) throw allPieceStagesError;

    const pointingStages = getPointingStages(
      (stages ?? []) as Array<{ id: string; active: boolean; sort_order: number }>,
    );
    const expeditionStage = pointingStages.find((stage) => stage.id === stageIds[0]) ?? null;

    if (!expeditionStage || expeditionStage.sort_order !== 9) {
      return { ok: false, message: "A finalização de carga está disponível apenas na Expedição." };
    }

    const invalidStatus = typedPieceStages.some((pieceStage) =>
      ["concluida", "nao_aplicavel"].includes(pieceStage.status),
    );

    if (invalidStatus) {
      return { ok: false, message: "Há peça selecionada que já foi finalizada." };
    }

    const missingVolumes = typedPieceStages.some(
      (pieceStage) => Number(pieceStage.load_volume_count ?? 0) <= 0,
    );

    if (missingVolumes) {
      return { ok: false, message: "Preencha e salve a quantidade de volumes antes de finalizar." };
    }

    const allUnlocked = typedPieceStages.every((pieceStage) =>
      isPieceStageUnlocked(
        pieceStage,
        (allPieceStages ?? []) as Array<{
          piece_id: string;
          stage_id: string;
          status: string;
        }>,
        pointingStages,
      ),
    );

    if (!allUnlocked) {
      return { ok: false, message: "Há peça selecionada aguardando a conclusão da etapa anterior." };
    }

    const { data: allowedStages, error: allowedStagesError } = await admin
      .from("production_operator_stages")
      .select("stage_id")
      .eq("company_id", context.companyId)
      .eq("operator_id", operator.id)
      .in("stage_id", stageIds);

    if (allowedStagesError) throw allowedStagesError;

    const allowedStageIds = new Set((allowedStages ?? []).map((stage) => String(stage.stage_id)));
    if (!stageIds.every((stageId) => allowedStageIds.has(stageId))) {
      return { ok: false, message: "Este operador não possui liberação para a Expedição." };
    }

    const participantOperatorIds = await resolveParticipantOperatorIds(
      admin,
      context,
      participantRegistrations,
      operator.id,
    );

    const nowIso = new Date().toISOString();
    const prodIds = Array.from(new Set(typedPieceStages.map((pieceStage) => pieceStage.prod_id)));
    const pointingSessionId = await createPointingSession(admin, context, {
      prodIds,
      stageId: stageIds[0],
      operatorId: operator.id,
      pointingReasonId: null,
      reworkId: null,
      action: "concluir",
      eventAt: nowIso,
      productiveSecondsDelta: 0,
      pausedSecondsDelta: 0,
      pieceCount: typedPieceStages.length,
      notes,
      pauseReason: null,
    });

    await insertPointingSessionParticipants(admin, context, pointingSessionId, participantOperatorIds);

    for (const pieceStage of typedPieceStages) {
      const { error: updateError } = await admin
        .from("production_prod_piece_stages")
        .update({
          status: "concluida",
          started_at: null,
          completed_at: nowIso,
          total_productive_seconds: 0,
          total_paused_seconds: 0,
          current_operator_id: operator.id,
          last_action: "concluir",
          last_action_at: nowIso,
          notes,
          blockers: null,
        })
        .eq("company_id", context.companyId)
        .eq("id", pieceStage.id);

      if (updateError) throw updateError;

      const { error: entryError } = await admin.from("production_stage_time_entries").insert({
        company_id: context.companyId,
        pointing_session_id: pointingSessionId,
        pointing_reason_id: null,
        rework_id: null,
        prod_id: pieceStage.prod_id,
        piece_id: pieceStage.piece_id,
        stage_id: pieceStage.stage_id,
        piece_stage_id: pieceStage.id,
        operator_id: operator.id,
        session_profile_id: context.profileId,
        auth_user_id: context.userId,
        action: "concluir",
        event_at: nowIso,
        productive_seconds_delta: 0,
        paused_seconds_delta: 0,
        notes,
        pause_reason: null,
      });

      if (entryError) throw entryError;
    }

    for (const prodId of prodIds) {
      await refreshProdStageFromPieces(context, prodId, stageIds[0]);
    }

    revalidatePointing(prodIds);
    return { ok: true, message: "Expedição finalizada sem contagem de tempo." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function startIndirectActivityAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.pointing.perform",
    "Você não possui permissão para registrar atividades indiretas.",
  );

  if (permissionError) return permissionError;

  const reasonId = String(formData.get("reason_id") ?? "").trim();
  const operatorRegistration = String(formData.get("operator_registration") ?? "").trim();
  const operatorPin = String(formData.get("operator_pin") ?? "").trim();
  const notes = textOrNull(formData.get("notes"));

  if (!reasonId) {
    return { ok: false, message: "Selecione a atividade indireta." };
  }

  try {
    const admin = getSupabaseAdminClient();
    const operator = await authenticateProductionOperator(
      admin,
      context,
      operatorRegistration,
      operatorPin,
    );
    if ("ok" in operator) return operator;

    const { data: reason, error: reasonError } = await admin
      .from("production_indirect_activity_reasons")
      .select("id, label, active")
      .eq("company_id", context.companyId)
      .eq("id", reasonId)
      .eq("active", true)
      .maybeSingle();

    if (reasonError) throw reasonError;
    if (!reason) return { ok: false, message: "Atividade indireta não encontrada ou inativa." };

    const { data: activeDirectStage, error: activeDirectStageError } = await admin
      .from("production_prod_piece_stages")
      .select("id")
      .eq("company_id", context.companyId)
      .eq("current_operator_id", operator.id)
      .eq("status", "em_andamento")
      .limit(1)
      .maybeSingle();

    if (activeDirectStageError) throw activeDirectStageError;
    if (activeDirectStage) {
      return {
        ok: false,
        message: "Finalize ou pause o apontamento de peça em andamento antes de iniciar uma atividade indireta.",
      };
    }

    const { data: activeIndirect, error: activeIndirectError } = await admin
      .from("production_indirect_activity_sessions")
      .select("id")
      .eq("company_id", context.companyId)
      .eq("operator_id", operator.id)
      .eq("status", "em_andamento")
      .limit(1)
      .maybeSingle();

    if (activeIndirectError) throw activeIndirectError;
    if (activeIndirect) {
      return {
        ok: false,
        message: "Este operador já possui uma atividade indireta em andamento.",
      };
    }

    const { error } = await admin.from("production_indirect_activity_sessions").insert({
      company_id: context.companyId,
      operator_id: operator.id,
      reason_id: reason.id,
      session_profile_id: context.profileId,
      auth_user_id: context.userId,
      status: "em_andamento",
      started_at: new Date().toISOString(),
      notes,
    });

    if (error) throw error;

    revalidatePointing();
    revalidatePath("/reports");
    return { ok: true, message: "Atividade indireta iniciada." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function finishIndirectActivityAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.pointing.perform",
    "Você não possui permissão para finalizar atividades indiretas.",
  );

  if (permissionError) return permissionError;

  const sessionId = String(formData.get("session_id") ?? "").trim();
  const operatorRegistration = String(formData.get("operator_registration") ?? "").trim();
  const operatorPin = String(formData.get("operator_pin") ?? "").trim();
  const notes = textOrNull(formData.get("notes"));

  if (!sessionId) {
    return { ok: false, message: "Atividade indireta inválida." };
  }

  try {
    const admin = getSupabaseAdminClient();
    const operator = await authenticateProductionOperator(
      admin,
      context,
      operatorRegistration,
      operatorPin,
    );
    if ("ok" in operator) return operator;

    const { data: session, error: sessionError } = await admin
      .from("production_indirect_activity_sessions")
      .select("id, operator_id, started_at, status, notes")
      .eq("company_id", context.companyId)
      .eq("id", sessionId)
      .eq("status", "em_andamento")
      .maybeSingle();

    if (sessionError) throw sessionError;
    if (!session) return { ok: false, message: "Atividade indireta em andamento não encontrada." };

    if (String(session.operator_id) !== operator.id) {
      return {
        ok: false,
        message: "A atividade indireta deve ser finalizada pela mesma matrícula que iniciou o registro.",
      };
    }

    const endedAt = new Date();
    const startedAt = new Date(String(session.started_at));
    const totalSeconds = Math.max(
      0,
      Math.floor((endedAt.getTime() - startedAt.getTime()) / 1000),
    );

    const { error } = await admin
      .from("production_indirect_activity_sessions")
      .update({
        status: "concluida",
        ended_at: endedAt.toISOString(),
        total_seconds: totalSeconds,
        notes: notes ?? session.notes ?? null,
      })
      .eq("company_id", context.companyId)
      .eq("id", sessionId);

    if (error) throw error;

    revalidatePointing();
    revalidatePath("/reports");
    return { ok: true, message: "Atividade indireta finalizada." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function pointProductionPiecesAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const actionType = String(formData.get("action_type") ?? "") as PointingActionType;
  if (!pointingActions.has(actionType)) {
    return { ok: false, message: "Ação de apontamento inválida." };
  }
  const markStageNotApplicable =
    formData.get("stage_not_applicable") === "on" || actionType === "nao_aplicavel";
  const effectiveActionType: PointingActionType = markStageNotApplicable
    ? "nao_aplicavel"
    : actionType;

  const permissionError = await requireActionPermission(
    context,
    actionType === "retornar" ? "production.pointing.rollback" : "production.pointing.perform",
    actionType === "retornar"
      ? "Você não possui permissão para corrigir etapas de apontamento."
      : "Você não possui permissão para realizar apontamentos.",
  );

  if (permissionError) return permissionError;

  const operatorRegistration = String(formData.get("operator_registration") ?? "").trim();
  const operatorPin = String(formData.get("operator_pin") ?? "").trim();
  const participantRegistrations = participantRegistrationsFromForm(formData);
  const notes = textOrNull(formData.get("notes"));
  const pointingReasonId = textOrNull(formData.get("pointing_reason_id"));
  let pauseReason = textOrNull(formData.get("pause_reason"));
  let selectedPointingReason: { id: string; kind: string; label: string; active: boolean } | null =
    null;

  if (!operatorRegistration || !operatorPin) {
    return { ok: false, message: "Informe a matrícula e a senha do operador." };
  }

  if (!isValidOperatorRegistration(operatorRegistration) || !isValidOperatorPin(operatorPin)) {
    return { ok: false, message: "Informe matrícula com 3 dígitos e senha com 4 dígitos." };
  }

  if (actionType === "retornar" && !pauseReason) {
    return { ok: false, message: "Informe o motivo do retorno da etapa." };
  }

  try {
    const pieceStageIds = Array.from(
      new Set(parseJsonArray<string>(formData.get("piece_stage_ids_json")).filter(Boolean)),
    );

    if (!pieceStageIds.length) {
      return { ok: false, message: "Selecione ao menos uma peça para apontar." };
    }

    const admin = getSupabaseAdminClient();
    if (effectiveActionType === "pausar" || effectiveActionType === "pendencia") {
      const expectedKind = effectiveActionType === "pausar" ? "pausa" : "pendencia";

      if (!pointingReasonId) {
        return {
          ok: false,
          message:
            effectiveActionType === "pausar"
              ? "Selecione o motivo da pausa."
              : "Selecione o motivo da pendência.",
        };
      }

      const { data: reason, error: reasonError } = await admin
        .from("production_pointing_reasons")
        .select("id, kind, label, active")
        .eq("company_id", context.companyId)
        .eq("id", pointingReasonId)
        .eq("kind", expectedKind)
        .eq("active", true)
        .maybeSingle();

      if (reasonError) throw reasonError;
      if (!reason) {
        return { ok: false, message: "Motivo de apontamento inválido ou inativo." };
      }

      selectedPointingReason = reason as {
        id: string;
        kind: string;
        label: string;
        active: boolean;
      };
      pauseReason = selectedPointingReason.label;
    }

    const { data: operator, error: operatorError } = await admin
      .from("production_operators")
      .select("id, name, registration, pin_hash, active")
      .eq("company_id", context.companyId)
      .eq("registration", operatorRegistration)
      .eq("active", true)
      .maybeSingle();

    if (operatorError) throw operatorError;
    if (!operator) return { ok: false, message: "Operador não encontrado ou inativo." };

    const { data: validPin, error: pinError } = await admin.rpc(
      "verify_production_operator_pin",
      {
        stored_hash: operator.pin_hash,
        plain_pin: operatorPin,
      },
    );

    if (pinError) throw pinError;
    if (!validPin) return { ok: false, message: "Matrícula ou senha inválida." };

    const { data: pieceStages, error: pieceStagesError } = await admin
      .from("production_prod_piece_stages")
      .select(
        "id, prod_id, piece_id, stage_id, status, started_at, completed_at, total_productive_seconds, total_paused_seconds, last_action, last_action_at, active_rework_id, notes",
      )
      .eq("company_id", context.companyId)
      .in("id", pieceStageIds);

    if (pieceStagesError) throw pieceStagesError;
    if ((pieceStages ?? []).length !== pieceStageIds.length) {
      return { ok: false, message: "Uma ou mais peças selecionadas não foram encontradas." };
    }

    const typedPieceStages = (pieceStages ?? []) as DbPieceStage[];
    const stageIds = Array.from(new Set(typedPieceStages.map((pieceStage) => pieceStage.stage_id)));
    const pieceIds = Array.from(new Set(typedPieceStages.map((pieceStage) => pieceStage.piece_id)));
    const reworkIds = Array.from(
      new Set(
        typedPieceStages
          .map((pieceStage) => pieceStage.active_rework_id)
          .filter((reworkId): reworkId is string => Boolean(reworkId)),
      ),
    );

    if (stageIds.length !== 1) {
      return {
        ok: false,
        message: "Selecione peças de uma única etapa por apontamento.",
      };
    }

    const [
      { data: stages, error: stagesError },
      { data: allPieceStages, error: allPieceStagesError },
      { data: selectedPieces, error: selectedPiecesError },
    ] =
      await Promise.all([
        admin
          .from("production_stages")
          .select("id, active, sort_order")
          .eq("company_id", context.companyId)
          .order("sort_order", { ascending: true }),
        admin
          .from("production_prod_piece_stages")
          .select("id, prod_id, piece_id, stage_id, status")
          .eq("company_id", context.companyId)
          .in("piece_id", pieceIds),
        admin
          .from("production_prod_pieces")
          .select("id, released_to_production")
          .eq("company_id", context.companyId)
          .in("id", pieceIds),
      ]);

    if (stagesError) throw stagesError;
    if (allPieceStagesError) throw allPieceStagesError;
    if (selectedPiecesError) throw selectedPiecesError;
    if ((selectedPieces ?? []).some((piece) => !Boolean(piece.released_to_production))) {
      return {
        ok: false,
        message: "Há peça selecionada aguardando liberação da gestão para produção.",
      };
    }

    const pointingStages = getPointingStages(
      (stages ?? []) as Array<{ id: string; active: boolean; sort_order: number }>,
    );
    const pointingStageIds = new Set(pointingStages.map((stage) => stage.id));
    const selectedStage = pointingStages.find((stage) => stage.id === stageIds[0]) ?? null;
    const selectedStageOrder = selectedStage?.sort_order ?? 0;
    const stageCanBeNotApplicable =
      selectedStageOrder >= 5 &&
      selectedStageOrder <= 7;

    if (stageIds.some((stageId) => !pointingStageIds.has(stageId))) {
      return {
        ok: false,
        message: "Esta etapa não faz parte do apontamento de produção.",
      };
    }

    if (
      markStageNotApplicable &&
      (!["concluir", "nao_aplicavel"].includes(actionType) || !stageCanBeNotApplicable)
    ) {
      return {
        ok: false,
        message:
          "A marcação de etapa não aplicável está disponível apenas para Corte, Usinagem e Preparação e montagem.",
      };
    }

    const unlockedPieceStages = (allPieceStages ?? []) as Array<{
      id: string;
      prod_id: string;
      piece_id: string;
      stage_id: string;
      status: string;
    }>;

    if (actionType === "retornar") {
      const stageIndex = pointingStages.findIndex((stage) => stage.id === stageIds[0]);
      const previousStage = stageIndex > 0 ? pointingStages[stageIndex - 1] : null;

      if (!previousStage) {
        return { ok: false, message: "Não é possível retornar antes da etapa de Corte." };
      }

      const invalidRows = typedPieceStages.filter((pieceStage) =>
        ["nao_iniciada", "nao_aplicavel"].includes(pieceStage.status),
      );

      if (invalidRows.length) {
        return {
          ok: false,
          message: "Só é possível retornar peças que já chegaram à etapa selecionada.",
        };
      }

      const stageIndexById = new Map(pointingStages.map((stage, index) => [stage.id, index]));
      const previousStageIndex = stageIndex - 1;
      const missingPreviousStage = typedPieceStages.some(
        (pieceStage) =>
          !unlockedPieceStages.some(
            (candidate) =>
              candidate.piece_id === pieceStage.piece_id && candidate.stage_id === previousStage.id,
          ),
      );

      if (missingPreviousStage) {
        return {
          ok: false,
          message: "Não foi possível localizar a etapa anterior de uma ou mais peças.",
        };
      }

      const now = new Date();
      const affectedProdStagePairs = new Set<string>();
      const affectedProdIds = new Set<string>();
      const rowsToReset = unlockedPieceStages.filter((pieceStage) => {
        const candidateIndex = stageIndexById.get(pieceStage.stage_id);
        return typeof candidateIndex === "number" && candidateIndex >= previousStageIndex;
      });
      const pointingSessionId = await createPointingSession(admin, context, {
        prodIds: Array.from(new Set(rowsToReset.map((pieceStage) => pieceStage.prod_id))),
        stageId: stageIds[0],
        operatorId: operator.id,
        pointingReasonId: null,
        reworkId: null,
        action: actionType,
        eventAt: now.toISOString(),
        productiveSecondsDelta: 0,
        pausedSecondsDelta: 0,
        pieceCount: rowsToReset.length,
        notes,
        pauseReason,
      });

      for (const pieceStage of rowsToReset) {
        const candidateIndex = stageIndexById.get(pieceStage.stage_id);
        const status = candidateIndex === previousStageIndex ? "aguardando" : "nao_iniciada";

        const { error: resetError } = await admin
          .from("production_prod_piece_stages")
          .update({
            status,
            started_at: null,
            completed_at: null,
            total_productive_seconds: 0,
            total_paused_seconds: 0,
            current_operator_id: null,
            last_action: null,
            last_action_at: null,
            notes: null,
            blockers: null,
          })
          .eq("company_id", context.companyId)
          .eq("id", pieceStage.id);

        if (resetError) throw resetError;
        affectedProdStagePairs.add(`${pieceStage.prod_id}:${pieceStage.stage_id}`);
        affectedProdIds.add(pieceStage.prod_id);
      }

      for (const pieceStage of rowsToReset) {
        const { error: entryError } = await admin.from("production_stage_time_entries").insert({
          company_id: context.companyId,
          pointing_session_id: pointingSessionId,
          pointing_reason_id: null,
          rework_id: null,
          prod_id: pieceStage.prod_id,
          piece_id: pieceStage.piece_id,
          stage_id: pieceStage.stage_id,
          piece_stage_id: pieceStage.id,
          operator_id: operator.id,
          session_profile_id: context.profileId,
          auth_user_id: context.userId,
          action: actionType,
          event_at: now.toISOString(),
          productive_seconds_delta: 0,
          paused_seconds_delta: 0,
          notes,
          pause_reason: pauseReason,
        });

        if (entryError) throw entryError;
      }

      for (const pair of affectedProdStagePairs) {
        const [prodId, stageId] = pair.split(":");
        await refreshProdStageFromPieces(context, prodId, stageId);
      }

      for (const prodId of affectedProdIds) {
        const { error: prodError } = await admin
          .from("production_prods")
          .update({ current_stage_id: previousStage.id })
          .eq("company_id", context.companyId)
          .eq("id", prodId);

        if (prodError) throw prodError;
      }

      revalidatePointing(Array.from(affectedProdIds));
      return { ok: true, message: "Etapa retornada e tempos zerados." };
    }

    const allUnlocked = typedPieceStages.every((pieceStage) =>
      isPieceStageUnlocked(pieceStage, unlockedPieceStages, pointingStages),
    );

    if (!allUnlocked) {
      return {
        ok: false,
        message: "Há peça selecionada aguardando a conclusão da etapa anterior.",
      };
    }

    const { data: allowedStages, error: allowedStagesError } = await admin
      .from("production_operator_stages")
      .select("stage_id")
      .eq("company_id", context.companyId)
      .eq("operator_id", operator.id)
      .in("stage_id", stageIds);

    if (allowedStagesError) throw allowedStagesError;

    const allowedStageIds = new Set((allowedStages ?? []).map((stage) => String(stage.stage_id)));
    const hasAllStages = stageIds.every((stageId) => allowedStageIds.has(stageId));

    if (!hasAllStages) {
      return {
        ok: false,
        message: "Este operador não possui liberação para uma ou mais etapas selecionadas.",
      };
    }

    const participantOperatorIds = await resolveParticipantOperatorIds(
      admin,
      context,
      participantRegistrations,
      operator.id,
    );

    const now = new Date();
    const affectedProdStagePairs = new Set<string>();
    const transitions = typedPieceStages.map((pieceStage) => ({
      pieceStage,
      transition: buildPieceStageTransition(pieceStage, effectiveActionType, now),
    }));
    const pointingSessionId = await createPointingSession(admin, context, {
      prodIds: Array.from(new Set(typedPieceStages.map((pieceStage) => pieceStage.prod_id))),
      stageId: stageIds[0],
      operatorId: operator.id,
      pointingReasonId: selectedPointingReason?.id ?? null,
      reworkId: reworkIds.length === 1 ? reworkIds[0] : null,
      action: effectiveActionType,
      eventAt: now.toISOString(),
      productiveSecondsDelta: Math.max(
        ...transitions.map(({ transition }) => transition.productiveDelta),
      ),
      pausedSecondsDelta: Math.max(...transitions.map(({ transition }) => transition.pausedDelta)),
      pieceCount: typedPieceStages.length,
      notes,
      pauseReason,
    });

    await insertPointingSessionParticipants(admin, context, pointingSessionId, participantOperatorIds);

    for (const { pieceStage, transition } of transitions) {
      const nextValues = {
        ...transition.nextValues,
        current_operator_id: operator.id,
        notes,
        blockers:
          effectiveActionType === "pendencia"
            ? pauseReason ?? notes
            : transition.nextValues.blockers,
        total_productive_seconds: transition.resetTotals
          ? 0
          : Number(pieceStage.total_productive_seconds ?? 0) + transition.productiveDelta,
        total_paused_seconds: transition.resetTotals
          ? 0
          : Number(pieceStage.total_paused_seconds ?? 0) + transition.pausedDelta,
      };

      const { error: updateError } = await admin
        .from("production_prod_piece_stages")
        .update(nextValues)
        .eq("company_id", context.companyId)
        .eq("id", pieceStage.id);

      if (updateError) throw updateError;

      if (effectiveActionType === "concluir" || effectiveActionType === "nao_aplicavel") {
        const stageIndex = pointingStages.findIndex((stage) => stage.id === pieceStage.stage_id);
        const nextStage = stageIndex >= 0 ? pointingStages[stageIndex + 1] : null;

        if (nextStage) {
          const { error: nextStageError } = await admin
            .from("production_prod_piece_stages")
            .update({ status: "aguardando" })
            .eq("company_id", context.companyId)
            .eq("piece_id", pieceStage.piece_id)
            .eq("stage_id", nextStage.id)
            .eq("status", "nao_iniciada");

          if (nextStageError) throw nextStageError;
          affectedProdStagePairs.add(`${pieceStage.prod_id}:${nextStage.id}`);
        }
      }

      const { error: entryError } = await admin.from("production_stage_time_entries").insert({
        company_id: context.companyId,
        pointing_session_id: pointingSessionId,
        pointing_reason_id: selectedPointingReason?.id ?? null,
        rework_id: pieceStage.active_rework_id ?? null,
        prod_id: pieceStage.prod_id,
        piece_id: pieceStage.piece_id,
        stage_id: pieceStage.stage_id,
        piece_stage_id: pieceStage.id,
        operator_id: operator.id,
        session_profile_id: context.profileId,
        auth_user_id: context.userId,
        action: effectiveActionType,
        event_at: now.toISOString(),
        productive_seconds_delta: transition.productiveDelta,
        paused_seconds_delta: transition.pausedDelta,
        notes,
        pause_reason:
          effectiveActionType === "retomar" && pieceStage.status === "pausada"
            ? pieceStage.notes
            : pauseReason,
      });

      if (entryError) throw entryError;

      if (pieceStage.active_rework_id) {
        const reworkStatus =
          effectiveActionType === "concluir" || effectiveActionType === "nao_aplicavel"
            ? "concluido"
            : "em_retrabalho";
        const { error: reworkError } = await admin
          .from("production_piece_reworks")
          .update({ status: reworkStatus, updated_by: context.userId })
          .eq("company_id", context.companyId)
          .eq("id", pieceStage.active_rework_id);

        if (reworkError) throw reworkError;
      }

      if (effectiveActionType === "pendencia") {
        const { error: notificationError } = await admin.rpc(
          "create_pointing_pending_notifications",
          {
            target_piece_stage_id: pieceStage.id,
            pending_reason: pauseReason ?? notes ?? "",
          },
        );

        if (notificationError) throw notificationError;
      }

      affectedProdStagePairs.add(`${pieceStage.prod_id}:${pieceStage.stage_id}`);
    }

    for (const pair of affectedProdStagePairs) {
      const [prodId, stageId] = pair.split(":");
      await refreshProdStageFromPieces(context, prodId, stageId);
    }

    revalidatePointing(Array.from(new Set(typedPieceStages.map((pieceStage) => pieceStage.prod_id))));
    return {
      ok: true,
      message: markStageNotApplicable
        ? "Etapa marcada como não aplicável e peça avançada."
        : "Apontamento registrado.",
    };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function updateProdStageAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const parsed = prodStageUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    const { data: prodStage, error: prodStageError } = await context.supabase
      .from("production_prod_stages")
      .select("id, prod_id, stage_id, started_at, completed_at")
      .eq("company_id", context.companyId)
      .eq("id", parsed.data.id)
      .maybeSingle();

    if (prodStageError) throw prodStageError;
    if (!prodStage) return { ok: false, message: "Etapa não encontrada." };

    const { data: stage, error: stageError } = await context.supabase
      .from("production_stages")
      .select("id, required_permission")
      .eq("company_id", context.companyId)
      .eq("id", prodStage.stage_id)
      .maybeSingle();

    if (stageError) throw stageError;

    const canUpdateStage =
      context.isMaster ||
      (await hasActionPermission(context, "production.prods.update_stage")) ||
      Boolean(stage?.required_permission && (await hasActionPermission(context, stage.required_permission)));

    if (!canUpdateStage) {
      return { ok: false, message: "Você não possui permissão para movimentar esta etapa." };
    }

    const now = new Date().toISOString();
    const nextValues: Record<string, unknown> = {
      status: parsed.data.status,
      owner_profile_id: parsed.data.owner_profile_id ?? null,
      planned_date: parsed.data.planned_date,
      notes: parsed.data.notes,
      blockers: parsed.data.blockers,
      last_updated_by: context.userId,
      last_updated_at: now,
    };

    if (parsed.data.status === "em_andamento" && !prodStage.started_at) {
      nextValues.started_at = now;
    }

    if (
      ["concluida", "concluida_parcialmente"].includes(parsed.data.status) &&
      !prodStage.completed_at
    ) {
      nextValues.completed_at = now;
    }

    const { error } = await context.supabase
      .from("production_prod_stages")
      .update(nextValues)
      .eq("company_id", context.companyId)
      .eq("id", parsed.data.id);

    if (error) throw error;

    await context.supabase
      .from("production_prods")
      .update({ current_stage_id: prodStage.stage_id })
      .eq("company_id", context.companyId)
      .eq("id", prodStage.prod_id);

    revalidateProds(prodStage.prod_id);
    return { ok: true, message: "Etapa atualizada." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function updateProdMaterialAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const parsed = prodMaterialUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    const [{ data: material, error: materialError }, canForecast, canConfirm, canUpdateLocation] =
      await Promise.all([
        context.supabase
          .from("production_prod_materials")
          .select("id, prod_id")
          .eq("company_id", context.companyId)
          .eq("id", parsed.data.id)
          .maybeSingle(),
        hasActionPermission(context, "production.materials.forecast"),
        hasActionPermission(context, "production.materials.confirm"),
        hasActionPermission(context, "production.materials.update_location"),
      ]);

    if (materialError) throw materialError;
    if (!material) return { ok: false, message: "Material não encontrado." };

    if (!context.isMaster && !canForecast && !canConfirm && !canUpdateLocation) {
      return { ok: false, message: "Você não possui permissão para atualizar materiais." };
    }

    const nextValues: Record<string, unknown> = {
      notes: parsed.data.notes,
      blockers: parsed.data.blockers,
    };

    if (context.isMaster || canForecast) {
      nextValues.forecast_status = parsed.data.forecast_status;
      nextValues.availability_forecast = parsed.data.availability_forecast;
    }

    if (context.isMaster || canConfirm) {
      nextValues.confirmation_status = parsed.data.confirmation_status;
      nextValues.confirmed_at = ["confirmado", "parcialmente_confirmado", "indisponivel"].includes(
        parsed.data.confirmation_status,
      )
        ? new Date().toISOString()
        : null;
      nextValues.confirmed_by = ["confirmado", "parcialmente_confirmado", "indisponivel"].includes(
        parsed.data.confirmation_status,
      )
        ? context.userId
        : null;
    }

    if (context.isMaster || canUpdateLocation) {
      nextValues.location = parsed.data.location;
    }

    const { error } = await context.supabase
      .from("production_prod_materials")
      .update(nextValues)
      .eq("company_id", context.companyId)
      .eq("id", parsed.data.id);

    if (error) throw error;
    revalidateProds(material.prod_id);
    return { ok: true, message: "Material atualizado." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function updateProdDocumentCheckAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.documents.manage",
    "Você não possui permissão para gerenciar listas e ordens.",
  );

  if (permissionError) return permissionError;

  const parsed = prodDocumentCheckUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { data: check, error: checkError } = await context.supabase
    .from("production_prod_document_checks")
    .select("id, prod_id")
    .eq("company_id", context.companyId)
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (checkError) return { ok: false, message: toUserFriendlyErrorMessage(checkError) };
  if (!check) return { ok: false, message: "Documento não encontrado." };

  const { error } = await context.supabase
    .from("production_prod_document_checks")
    .update({
      checked: parsed.data.checked,
      checked_at: parsed.data.checked ? new Date().toISOString() : null,
      responsible_profile_id: parsed.data.checked ? context.profileId : null,
      notes: parsed.data.notes,
    })
    .eq("company_id", context.companyId)
    .eq("id", parsed.data.id);

  if (error) return { ok: false, message: toUserFriendlyErrorMessage(error) };
  revalidateProds(check.prod_id);
  return { ok: true, message: "Lista/ordem atualizada." };
}

export async function updateProdSelectedItemAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const allowed =
    context.isMaster ||
    (await hasActionPermission(context, "production.machining.manage")) ||
    (await hasActionPermission(context, "production.preparation_assembly.manage")) ||
    (await hasActionPermission(context, "production.packaging.manage"));

  if (!allowed) {
    return { ok: false, message: "Você não possui permissão para atualizar itens da PROD." };
  }

  const parsed = prodSelectedItemUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { data: item, error: itemError } = await context.supabase
    .from("production_prod_selected_items")
    .select("id, prod_id")
    .eq("company_id", context.companyId)
    .eq("id", parsed.data.id)
    .maybeSingle();

  if (itemError) return { ok: false, message: toUserFriendlyErrorMessage(itemError) };
  if (!item) return { ok: false, message: "Item não encontrado." };

  const { error } = await context.supabase
    .from("production_prod_selected_items")
    .update({
      selected: parsed.data.selected,
      quantity: parsed.data.quantity,
      location: parsed.data.location,
      withdrawn: parsed.data.withdrawn,
      packed: parsed.data.packed,
      event_date: parsed.data.event_date,
      responsible_profile_id: context.profileId,
      notes: parsed.data.notes,
    })
    .eq("company_id", context.companyId)
    .eq("id", parsed.data.id);

  if (error) return { ok: false, message: toUserFriendlyErrorMessage(error) };
  revalidateProds(item.prod_id);
  return { ok: true, message: "Item atualizado." };
}

export async function updateProdShippingAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.shipping.manage",
    "Você não possui permissão para gerenciar expedição.",
  );

  if (permissionError) return permissionError;

  const parsed = prodShippingUpdateSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { error } = await context.supabase.from("production_shipping_records").upsert(
    {
      ...parsed.data,
      company_id: context.companyId,
      responsible_profile_id: context.profileId,
    },
    { onConflict: "prod_id" },
  );

  if (error) return { ok: false, message: toUserFriendlyErrorMessage(error) };
  revalidateProds(parsed.data.prod_id);
  return { ok: true, message: "Expedição atualizada." };
}

export async function planFreightDemandAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.freights.edit",
    "Você não possui permissão para editar fretes.",
  );

  if (permissionError) return permissionError;

  const id = String(formData.get("id") ?? "");
  const plannedDate = String(formData.get("planned_date") ?? "").trim();

  if (!id || !plannedDate) {
    return { ok: false, message: "Informe a data prevista do frete." };
  }

  const { data: currentDemand, error: currentDemandError } = await context.supabase
    .from("freight_demands")
    .select("id, status")
    .eq("company_id", context.companyId)
    .eq("id", id)
    .maybeSingle();

  if (currentDemandError) return { ok: false, message: toUserFriendlyErrorMessage(currentDemandError) };
  if (!currentDemand) return { ok: false, message: "Frete não encontrado." };

  if (!["previsto", "em_planejamento"].includes(String(currentDemand.status))) {
    return {
      ok: false,
      message: "Este frete já está em rota ou finalizado e não pode ter a previsão alterada.",
    };
  }

  const { error } = await context.supabase
    .from("freight_demands")
    .update({ planned_date: plannedDate, status: "em_planejamento" })
    .eq("company_id", context.companyId)
    .eq("id", id);

  if (error) return { ok: false, message: toUserFriendlyErrorMessage(error) };
  revalidateLogistics();
  return { ok: true, message: "Previsão do frete atualizada." };
}

export async function createExtraServiceAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const parsed = extraServiceSchema.safeParse(formDataToObject(formData));
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  try {
    const [{ data: recipient, error: recipientError }, { data: service, error: serviceError }] =
      await Promise.all([
        context.supabase
          .from("logistics_recipients")
          .select("id, name, address")
          .eq("company_id", context.companyId)
          .eq("id", parsed.data.recipient_id)
          .maybeSingle(),
        context.supabase
          .from("extra_service_catalog")
          .select("id, name, description")
          .eq("company_id", context.companyId)
          .eq("id", parsed.data.service_catalog_id)
          .maybeSingle(),
      ]);

    if (recipientError) throw recipientError;
    if (serviceError) throw serviceError;
    if (!recipient) return { ok: false, message: "Destinatário não encontrado." };
    if (!service) return { ok: false, message: "Serviço não encontrado." };

    const desiredDate = parsed.data.desired_date;
    const { error } = await context.supabase.from("extra_service_requests").insert({
      ...parsed.data,
      company_id: context.companyId,
      requesting_profile_id: context.profileId,
      recipient_or_place: recipient.name,
      address: recipient.address,
      service_description: service.description,
      status: desiredDate ? "em_planejamento" : "previsto",
      created_by: context.userId,
    });

    if (error) throw error;
    revalidateLogistics();
    return { ok: true, message: "Avulso salvo com sucesso." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function planExtraServiceAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const id = String(formData.get("id") ?? "");
  const plannedDate = String(formData.get("desired_date") ?? "").trim();

  if (!id || !plannedDate) {
    return { ok: false, message: "Informe a data prevista do avulso." };
  }

  const { error } = await context.supabase
    .from("extra_service_requests")
    .update({ desired_date: plannedDate, status: "em_planejamento" })
    .eq("company_id", context.companyId)
    .eq("id", id);

  if (error) return { ok: false, message: toUserFriendlyErrorMessage(error) };
  revalidateLogistics();
  return { ok: true, message: "Avulso enviado para planejamento." };
}

export async function createFreightAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const freightDemandIds = idsFromForm(formData, "freight_demand_ids");
  const extraServiceIds = idsFromForm(formData, "extra_service_ids");
  const helperIds = idsFromForm(formData, "helper_ids");
  const parsed = freightSchema.safeParse({
    ...formDataToObject(formData),
    title: `Rota - ${String(formData.get("freight_date") ?? "")}`,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  if (!freightDemandIds.length && !extraServiceIds.length) {
    return {
      ok: false,
      message: "Selecione ao menos um frete ou avulso em planejamento.",
    };
  }

  const requestingDepartmentId = String(formData.get("requesting_department_id") ?? "");
  if (freightDemandIds.length && !requestingDepartmentId) {
    return {
      ok: false,
      message: "Selecione o departamento padrão para as paradas de frete.",
    };
  }

  try {
    const routeCostContext = await loadRouteCostContext(context, parsed.data, helperIds);
    if (!routeCostContext.ok) return routeCostContext;

    const { data: route, error: routeError } = await context.supabase
      .from("freights")
      .insert({
        ...routeCostContext.routeValues,
        company_id: context.companyId,
        title: `Rota - ${parsed.data.freight_date}`,
        driver: routeCostContext.driver.name,
        vehicle: routeCostContext.vehicle.name,
        plate: routeCostContext.vehicle.plate,
        created_by: context.userId,
      })
      .select("id")
      .single();

    if (routeError) throw routeError;

    const freightId = route.id as string;
    const position = await addFreightDemandStops({
      context,
      freightId,
      demandIds: freightDemandIds,
      requestingDepartmentId,
      status: parsed.data.status,
      initialPosition: 1,
    });

    await addExtraServiceStops({
      context,
      freightId,
      extraServiceIds,
      status: parsed.data.status,
      initialPosition: position,
    });

    await replaceRouteHelpers(context, freightId, routeCostContext.helperRows);

    revalidateLogistics();
    return { ok: true, message: "Rota criada com sucesso." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function updateFreightAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  const permissionError = await requireActionPermission(
    context,
    "production.routes.edit",
    "Você não possui permissão para editar rotas.",
  );

  if (permissionError) return permissionError;

  const parsed = freightUpdateSchema.safeParse({
    ...formDataToObject(formData),
    title: `Rota - ${String(formData.get("freight_date") ?? "")}`,
  });

  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Dados inválidos" };
  }

  const { id, ...values } = parsed.data;
  const selectedDemandIds = uniqueIds(idsFromForm(formData, "freight_demand_ids"));
  const selectedExtraServiceIds = uniqueIds(idsFromForm(formData, "extra_service_ids"));
  const helperIds = idsFromForm(formData, "helper_ids");
  const requestingDepartmentId = String(formData.get("requesting_department_id") ?? "");

  try {
    const { data: currentRoute, error: currentRouteError } = await context.supabase
      .from("freights")
      .select("id, status")
      .eq("company_id", context.companyId)
      .eq("id", id)
      .maybeSingle();

    if (currentRouteError) throw currentRouteError;
    if (!currentRoute) return { ok: false, message: "Rota não encontrada." };

    if (!["pre_agendado", "agendado"].includes(String(currentRoute.status))) {
      return {
        ok: false,
        message: "Rotas concluídas, não realizadas ou canceladas não podem ser editadas.",
      };
    }

    const { data: currentStops, error: currentStopsError } = await context.supabase
      .from("freight_stops")
      .select("id, position, freight_demand_id, extra_service_request_id")
      .eq("company_id", context.companyId)
      .eq("freight_id", id)
      .order("position");

    if (currentStopsError) throw currentStopsError;

    const stops = (currentStops ?? []) as Array<{
      id: string;
      position: number;
      freight_demand_id: string | null;
      extra_service_request_id: string | null;
    }>;
    const currentDemandIds = uniqueIds(
      stops
        .map((stop) => stop.freight_demand_id)
        .filter((item): item is string => Boolean(item)),
    );
    const currentExtraServiceIds = uniqueIds(
      stops
        .map((stop) => stop.extra_service_request_id)
        .filter((item): item is string => Boolean(item)),
    );
    const removedDemandIds = currentDemandIds.filter((item) => !selectedDemandIds.includes(item));
    const removedExtraServiceIds = currentExtraServiceIds.filter(
      (item) => !selectedExtraServiceIds.includes(item),
    );
    const addedDemandIds = selectedDemandIds.filter((item) => !currentDemandIds.includes(item));
    const addedExtraServiceIds = selectedExtraServiceIds.filter(
      (item) => !currentExtraServiceIds.includes(item),
    );

    if (addedDemandIds.length && !requestingDepartmentId) {
      return {
        ok: false,
        message: "Selecione o departamento padrão para novos fretes incluídos na rota.",
      };
    }

    if (!selectedDemandIds.length && !selectedExtraServiceIds.length) {
      return { ok: false, message: "A rota precisa manter ao menos um frete ou avulso." };
    }

    const routeCostContext = await loadRouteCostContext(context, values, helperIds);
    if (!routeCostContext.ok) return routeCostContext;

    const { error } = await context.supabase
      .from("freights")
      .update({
        ...routeCostContext.routeValues,
        title: `Rota - ${values.freight_date}`,
        driver: routeCostContext.driver.name,
        vehicle: routeCostContext.vehicle.name,
        plate: routeCostContext.vehicle.plate,
      })
      .eq("company_id", context.companyId)
      .eq("id", id);

    if (error) throw error;

    const removedStopIds = stops
      .filter(
        (stop) =>
          (stop.freight_demand_id && removedDemandIds.includes(stop.freight_demand_id)) ||
          (stop.extra_service_request_id &&
            removedExtraServiceIds.includes(stop.extra_service_request_id)),
      )
      .map((stop) => stop.id);

    if (removedStopIds.length) {
      const { error: deleteStopsError } = await context.supabase
        .from("freight_stops")
        .delete()
        .eq("company_id", context.companyId)
        .in("id", removedStopIds);

      if (deleteStopsError) throw deleteStopsError;
    }

    if (removedDemandIds.length) {
      const { error: demandReturnError } = await context.supabase
        .from("freight_demands")
        .update({ status: "em_planejamento" })
        .eq("company_id", context.companyId)
        .in("id", removedDemandIds);

      if (demandReturnError) throw demandReturnError;
    }

    if (removedExtraServiceIds.length) {
      const { error: serviceReturnError } = await context.supabase
        .from("extra_service_requests")
        .update({ status: "em_planejamento" })
        .eq("company_id", context.companyId)
        .in("id", removedExtraServiceIds);

      if (serviceReturnError) throw serviceReturnError;
    }

    const nextPosition =
      stops
        .filter((stop) => !removedStopIds.includes(stop.id))
        .reduce((max, stop) => Math.max(max, Number(stop.position ?? 0)), 0) + 1;

    const position = await addFreightDemandStops({
      context,
      freightId: id,
      demandIds: addedDemandIds,
      requestingDepartmentId,
      status: values.status,
      initialPosition: nextPosition,
    });

    await addExtraServiceStops({
      context,
      freightId: id,
      extraServiceIds: addedExtraServiceIds,
      status: values.status,
      initialPosition: position,
    });

    const { error: stopsError } = await context.supabase
      .from("freight_stops")
      .update({ status: values.status })
      .eq("company_id", context.companyId)
      .eq("freight_id", id);

    if (stopsError) throw stopsError;

    await replaceRouteHelpers(context, id, routeCostContext.helperRows);

    revalidateLogistics();
    return { ok: true, message: "Rota atualizada com sucesso." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}

export async function deleteFreightAction(_: ActionState, formData: FormData) {
  const context = await getActionContext();
  if (!context.ok) return context.state;

  if (!context.isMaster) {
    return { ok: false, message: "Somente usuários administradores podem excluir rotas." };
  }

  const id = String(formData.get("id") ?? "");

  if (!id) {
    return { ok: false, message: "Rota inválida." };
  }

  try {
    const admin = getSupabaseAdminClient();
    const { data: stops, error: stopsError } = await admin
      .from("freight_stops")
      .select("freight_demand_id, extra_service_request_id")
      .eq("company_id", context.companyId)
      .eq("freight_id", id);

    if (stopsError) throw stopsError;

    const demandIds = Array.from(
      new Set(
        ((stops ?? []) as Array<{ freight_demand_id: string | null }>)
          .map((stop) => stop.freight_demand_id)
          .filter((item): item is string => Boolean(item)),
      ),
    );
    const extraServiceIds = Array.from(
      new Set(
        ((stops ?? []) as Array<{ extra_service_request_id: string | null }>)
          .map((stop) => stop.extra_service_request_id)
          .filter((item): item is string => Boolean(item)),
      ),
    );

    if (demandIds.length) {
      const { error } = await admin
        .from("freight_demands")
        .update({ status: "em_planejamento" })
        .eq("company_id", context.companyId)
        .in("id", demandIds);

      if (error) throw error;
    }

    if (extraServiceIds.length) {
      const { error } = await admin
        .from("extra_service_requests")
        .update({ status: "em_planejamento" })
        .eq("company_id", context.companyId)
        .in("id", extraServiceIds);

      if (error) throw error;
    }

    const { error } = await admin
      .from("freights")
      .delete()
      .eq("company_id", context.companyId)
      .eq("id", id);

    if (error) throw error;

    revalidateLogistics();
    return { ok: true, message: "Rota excluída com sucesso." };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}
