import { operationalSnapshot, reportableSnapshot } from "./lifecycle-snapshot";
import { unstable_noStore as noStore } from "next/cache";
import { demoSnapshot } from "./demo-data";
import { isSnapshotKeyEnabled, isolateTransportSnapshot } from "./transport-module";
import type {
  Department,
  ProductionSnapshot,
  FreightStop,
  ProdMaterial,
  ProductionProd,
  ProductionContract,
  Client,
  ProductionStage,
  Profile,
  StorageLocation,
  DocumentCheck,
  SelectedItem,
  ShippingRecord,
  Freight,
  FreightRouteHelper,
  ExtraServiceRequest,
  AuditLog,
  LogisticsRecipient,
  LogisticsDriver,
  LogisticsVehicle,
  LogisticsSettings,
  ExtraServiceCatalog,
  FreightDemand,
  ProductionOperator,
  ProductionOperatorStage,
  ProductionPointingReason,
  ProductionPointingSettings,
  ProductionIndirectActivityReason,
  ProductionIndirectActivitySession,
  ProductionPointingSessionParticipant,
  ProductionPieceRework,
  ProductionReworkReason,
  ProductionPointingSession,
  ProductionPiece,
  ProductionPieceImport,
  ProductionPieceStage,
  ProductionStageTimeEntry,
} from "./types";
import { hasActiveMasterRole } from "./server-access";
import { getSupabaseAdminClient } from "./supabase/admin";
import { createSupabaseServerClient, hasSupabaseEnv } from "./supabase/server";
import { accentDisplayText } from "./utils";

type DbProdOverview = ProductionProd & {
  contract: ProductionContract & { client: Client };
};

type SnapshotKey = Exclude<keyof ProductionSnapshot, "source">;
type SnapshotInclude = Partial<Record<SnapshotKey, boolean>>;
type QueryResponse = { data: unknown[] | null; error: QueryError | null };
type SessionClient = Awaited<ReturnType<typeof createSupabaseServerClient>>;
type SelectQuery = ReturnType<ReturnType<SessionClient["from"]>["select"]>;
async function fetchAllRows(build: () => SelectQuery): Promise<QueryResponse> {
  const data: unknown[] = [];
  let after: string | null = null;
  while (true) {
    let query = build().order("id").limit(500);
    if (after) query = query.gt("id", after);
    const result = await query;
    if (result.error) return { data: null, error: result.error };
    if (!result.data?.length) return { data, error: null };
    data.push(...result.data);
    after = String((result.data[result.data.length - 1] as { id: string }).id);
  }
}

type SnapshotFilters = {
  prodId?: string;
  throwOnError?: boolean;
};
type SnapshotQuery = {
  key: SnapshotKey;
  optionalMissing?: boolean;
  load: () => PromiseLike<QueryResponse>;
  apply: (snapshot: ProductionSnapshot, data: unknown[]) => void;
};

const allSnapshotKeys: SnapshotKey[] = [
  "departments",
  "logisticsRecipients",
  "logisticsDrivers",
  "logisticsVehicles",
  "logisticsSettings",
  "extraServiceCatalog",
  "profiles",
  "clients",
  "contracts",
  "stages",
  "prods",
  "prodStages",
  "prodMaterials",
  "prodPieceImports",
  "prodPieces",
  "prodPieceStages",
  "productionOperators",
  "productionOperatorStages",
  "pointingReasons",
  "pointingSettings",
  "indirectActivityReasons",
  "indirectActivitySessions",
  "pointingSessionParticipants",
  "reworkReasons",
  "pieceReworks",
  "pointingSessions",
  "stageTimeEntries",
  "storageLocations",
  "documentChecks",
  "selectedItems",
  "shippingRecords",
  "freightDemands",
  "freights",
  "freightStops",
  "freightRouteHelpers",
  "extraServices",
  "auditLogs",
];

function includeKeys(keys: SnapshotKey[]): SnapshotInclude {
  return Object.fromEntries(keys.map((key) => [key, true])) as SnapshotInclude;
}

function emptySnapshot(): ProductionSnapshot {
  return {
    source: "supabase",
    departments: [],
    logisticsRecipients: [],
    logisticsDrivers: [],
    logisticsVehicles: [],
    logisticsSettings: null,
    extraServiceCatalog: [],
    profiles: [],
    clients: [],
    contracts: [],
    stages: [],
    prods: [],
    prodStages: [],
    prodMaterials: [],
    prodPieceImports: [],
    prodPieces: [],
    prodPieceStages: [],
    productionOperators: [],
    productionOperatorStages: [],
    pointingReasons: [],
    pointingSettings: null,
    indirectActivityReasons: [],
    indirectActivitySessions: [],
    pointingSessionParticipants: [],
    reworkReasons: [],
    pieceReworks: [],
    pointingSessions: [],
    stageTimeEntries: [],
    storageLocations: [],
    documentChecks: [],
    selectedItems: [],
    shippingRecords: [],
    freightDemands: [],
    freights: [],
    freightStops: [],
    freightRouteHelpers: [],
    extraServices: [],
    auditLogs: [],
  };
}

type QueryError = {
  code?: string;
  message?: string;
};

function isMissingRelation(error?: QueryError | null) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function formatDepartment(department: Department): Department {
  return { ...department, name: accentDisplayText(department.name) };
}

function formatProfile(profile: Profile): Profile {
  return {
    ...profile,
    name: accentDisplayText(profile.name),
    title: accentDisplayText(profile.title),
    permissions: profile.permissions ?? [],
  };
}

function formatClient(client: Client): Client {
  return {
    ...client,
    name: accentDisplayText(client.name),
    trade_name: accentDisplayText(client.trade_name),
    notes: accentDisplayText(client.notes),
  };
}

function formatContract(contract: ProductionContract): ProductionContract {
  return {
    ...contract,
    work_name: accentDisplayText(contract.work_name),
    full_address: accentDisplayText(contract.full_address),
    street: accentDisplayText(contract.street),
    block: accentDisplayText(contract.block),
    lot: accentDisplayText(contract.lot),
    sector: accentDisplayText(contract.sector),
    city: accentDisplayText(contract.city),
    site_contact: accentDisplayText(contract.site_contact),
    notes: accentDisplayText(contract.notes),
  };
}

function formatStage(stage: ProductionStage): ProductionStage {
  return {
    ...stage,
    name: accentDisplayText(stage.name),
    description: accentDisplayText(stage.description),
  };
}

function formatProd(prod: ProductionProd): ProductionProd {
  return {
    ...prod,
    legacy_status: prod.status,
    status: prod.lifecycle?.state === "concluida" ? "concluida" : prod.lifecycle?.state === "cancelada" ? "cancelada" : ["concluida", "cancelada"].includes(prod.status) ? "em_producao" : prod.status,
    actual_end_date: prod.lifecycle?.completed_at ? new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date(prod.lifecycle.completed_at)) : null,
    description: accentDisplayText(prod.description),
    notes: accentDisplayText(prod.notes),
    pieces_count: Number(prod.pieces_count ?? 0),
    pieces_area_m2: Number(prod.pieces_area_m2 ?? 0),
    pieces_weight_kg: Number(prod.pieces_weight_kg ?? 0),
  };
}

function formatPiece(piece: ProductionPiece): ProductionPiece {
  return {
    ...piece,
    piece_code: accentDisplayText(piece.piece_code),
    system_code: accentDisplayText(piece.system_code),
    system_description: accentDisplayText(piece.system_description),
    quantity: Number(piece.quantity ?? 1),
    width_mm: piece.width_mm == null ? null : Number(piece.width_mm),
    height_mm: piece.height_mm == null ? null : Number(piece.height_mm),
    measure_a: piece.measure_a == null ? null : Number(piece.measure_a),
    measure_b: piece.measure_b == null ? null : Number(piece.measure_b),
    location: accentDisplayText(piece.location),
    area_m2: Number(piece.area_m2 ?? 0),
    unit_weight_kg: Number(piece.unit_weight_kg ?? 0),
    total_weight_kg: Number(piece.total_weight_kg ?? 0),
    released_to_production: Boolean(piece.released_to_production),
    released_at: piece.released_at ?? null,
    released_by: piece.released_by ?? null,
    sort_order: Number(piece.sort_order ?? 0),
    notes: accentDisplayText(piece.notes),
  };
}

function formatPieceStage(pieceStage: ProductionPieceStage): ProductionPieceStage {
  return {
    ...pieceStage,
    total_productive_seconds: Number(pieceStage.total_productive_seconds ?? 0),
    total_paused_seconds: Number(pieceStage.total_paused_seconds ?? 0),
    load_volume_count: Number(pieceStage.load_volume_count ?? 0),
    load_checklist:
      pieceStage.load_checklist && typeof pieceStage.load_checklist === "object"
        ? pieceStage.load_checklist
        : {},
    load_checked_at: pieceStage.load_checked_at ?? null,
    load_checked_by: pieceStage.load_checked_by ?? null,
    active_rework_id: pieceStage.active_rework_id ?? null,
    notes: accentDisplayText(pieceStage.notes),
    blockers: accentDisplayText(pieceStage.blockers),
  };
}

function formatProductionOperator(operator: ProductionOperator): ProductionOperator {
  return {
    ...operator,
    name: accentDisplayText(operator.name),
    registration: accentDisplayText(operator.registration),
    notes: accentDisplayText(operator.notes),
    stage_ids: operator.stage_ids ?? [],
  };
}

function formatPointingSettings(settings: ProductionPointingSettings): ProductionPointingSettings {
  const breaks = Array.isArray(settings.breaks)
    ? settings.breaks
        .map((item) => ({
          label: accentDisplayText(item?.label),
          start: String(item?.start ?? ""),
          end: String(item?.end ?? ""),
        }))
        .filter((item) => item.label && item.start && item.end)
    : [];

  return {
    ...settings,
    timezone: settings.timezone || "America/Sao_Paulo",
    workday_start: String(settings.workday_start ?? "08:00").slice(0, 5),
    workday_end: String(settings.workday_end ?? "18:00").slice(0, 5),
    workdays: Array.isArray(settings.workdays)
      ? settings.workdays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
      : [1, 2, 3, 4, 5],
    breaks,
  };
}

function formatLocation(location: StorageLocation): StorageLocation {
  return {
    ...location,
    name: accentDisplayText(location.name),
    type: accentDisplayText(location.type),
    description: accentDisplayText(location.description),
  };
}

function formatRecipient(recipient: LogisticsRecipient): LogisticsRecipient {
  return {
    ...recipient,
    name: accentDisplayText(recipient.name),
    address: accentDisplayText(recipient.address),
  };
}

function formatDriver(driver: LogisticsDriver): LogisticsDriver {
  return {
    ...driver,
    name: accentDisplayText(driver.name),
    hourly_cost: Number(driver.hourly_cost ?? 0),
    can_drive: driver.can_drive ?? true,
    can_help: driver.can_help ?? false,
  };
}

function formatVehicle(vehicle: LogisticsVehicle): LogisticsVehicle {
  return {
    ...vehicle,
    name: accentDisplayText(vehicle.name),
    plate: accentDisplayText(vehicle.plate),
    vehicle_kind: vehicle.vehicle_kind ?? "veiculo",
    ownership_type: vehicle.ownership_type ?? "terceiro",
    fuel_consumption_km_l: Number(vehicle.fuel_consumption_km_l ?? 0),
    wear_cost_per_km: Number(vehicle.wear_cost_per_km ?? 0),
  };
}

function formatLogisticsSettings(settings: LogisticsSettings): LogisticsSettings {
  return {
    ...settings,
    fuel_price_per_liter: Number(settings.fuel_price_per_liter ?? 0),
  };
}

function formatServiceCatalog(service: ExtraServiceCatalog): ExtraServiceCatalog {
  return {
    ...service,
    name: accentDisplayText(service.name),
    description: accentDisplayText(service.description),
  };
}

function formatFreight(freight: Freight): Freight {
  return {
    ...freight,
    title: accentDisplayText(freight.title),
    driver: accentDisplayText(freight.driver),
    vehicle: accentDisplayText(freight.vehicle),
    trailer: accentDisplayText(freight.trailer),
    trailer_plate: accentDisplayText(freight.trailer_plate),
    execution_type: freight.execution_type ?? "terceirizado",
    distance_km: Number(freight.distance_km ?? 0),
    estimated_hours: Number(freight.estimated_hours ?? 0),
    helper_hours: Number(freight.helper_hours ?? 0),
    fuel_cost: Number(freight.fuel_cost ?? 0),
    driver_labor_cost: Number(freight.driver_labor_cost ?? 0),
    helper_labor_cost: Number(freight.helper_labor_cost ?? 0),
    vehicle_wear_cost: Number(freight.vehicle_wear_cost ?? 0),
    trailer_wear_cost: Number(freight.trailer_wear_cost ?? 0),
    internal_total_cost: Number(freight.internal_total_cost ?? 0),
    driver_hourly_cost_snapshot: Number(freight.driver_hourly_cost_snapshot ?? 0),
    vehicle_consumption_snapshot: Number(freight.vehicle_consumption_snapshot ?? 0),
    fuel_price_snapshot: Number(freight.fuel_price_snapshot ?? 0),
    wear_cost_snapshot: Number(freight.wear_cost_snapshot ?? 0),
    trailer_wear_cost_snapshot: Number(freight.trailer_wear_cost_snapshot ?? 0),
    notes: accentDisplayText(freight.notes),
  };
}

function formatFreightRouteHelper(helper: FreightRouteHelper): FreightRouteHelper {
  return {
    ...helper,
    helper_name: accentDisplayText(helper.helper_name),
    hourly_cost_snapshot: Number(helper.hourly_cost_snapshot ?? 0),
    hours: Number(helper.hours ?? 0),
    total_cost: Number(helper.total_cost ?? 0),
  };
}

function formatShippingRecord(record: ShippingRecord): ShippingRecord {
  return {
    ...record,
    shipping_location: accentDisplayText(record.shipping_location),
    notes: accentDisplayText(record.notes),
  };
}

function formatFreightStop(stop: FreightStop): FreightStop {
  return {
    ...stop,
    title: accentDisplayText(stop.title),
    address: accentDisplayText(stop.address),
    contact: accentDisplayText(stop.contact),
    planned_window: accentDisplayText(stop.planned_window),
    notes: accentDisplayText(stop.notes),
  };
}

function formatExtraService(service: ExtraServiceRequest): ExtraServiceRequest {
  return {
    ...service,
    recipient_or_place: accentDisplayText(service.recipient_or_place),
    address: accentDisplayText(service.address),
    contact: accentDisplayText(service.contact),
    service_description: accentDisplayText(service.service_description),
    materials_description: accentDisplayText(service.materials_description),
    desired_window: accentDisplayText(service.desired_window),
    notes: accentDisplayText(service.notes),
  };
}

function addSnapshotQuery(
  queries: SnapshotQuery[],
  include: SnapshotInclude,
  query: SnapshotQuery,
) {
  if (include[query.key] && isSnapshotKeyEnabled(query.key)) {
    queries.push(query);
  }
}

async function loadProductionSnapshot(
  include: SnapshotInclude,
  filters: SnapshotFilters = {},
): Promise<ProductionSnapshot> {
  noStore();

  if (!hasSupabaseEnv()) return isolateTransportSnapshot(demoSnapshot);

  try {
    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      return emptySnapshot();
    }

    const { data: currentProfile, error: currentProfileError } = await supabase
      .from("profiles")
      .select("id, company_id, is_master, status")
      .eq("user_id", user.id)
      .maybeSingle();

    if (currentProfileError) {
      console.error("Falha ao validar perfil atual", currentProfileError);
      return emptySnapshot();
    }

    if (currentProfile?.company_id && currentProfile.status === "active") {
      const hasMasterAccess = await hasActiveMasterRole(getSupabaseAdminClient(), {
        id: currentProfile.id as string,
        company_id: currentProfile.company_id as string,
        is_master: Boolean(currentProfile.is_master),
      });

      if (!hasMasterAccess) {
        const { data: maintenanceData, error: maintenanceError } = await supabase
          .from("system_maintenance")
          .select("enabled")
          .eq("company_id", currentProfile.company_id)
          .maybeSingle();

        if (maintenanceError && !isMissingRelation(maintenanceError)) {
          console.error("Falha ao validar manutenção do sistema", maintenanceError);
          return emptySnapshot();
        }

        if (maintenanceData?.enabled) {
          return emptySnapshot();
        }
      }
    }

    const snapshot = emptySnapshot();
    const queries: SnapshotQuery[] = [];

    addSnapshotQuery(queries, include, {
      key: "departments",
      load: () => supabase.from("departments").select("*").order("name"),
      apply: (target, data) => {
        target.departments = (data as Department[]).map(formatDepartment);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "logisticsRecipients",
      optionalMissing: true,
      load: () => supabase.from("logistics_recipients").select("*").order("name"),
      apply: (target, data) => {
        target.logisticsRecipients = (data as LogisticsRecipient[]).map(formatRecipient);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "logisticsDrivers",
      optionalMissing: true,
      load: () => supabase.from("logistics_drivers").select("*").order("name"),
      apply: (target, data) => {
        target.logisticsDrivers = (data as LogisticsDriver[]).map(formatDriver);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "logisticsVehicles",
      optionalMissing: true,
      load: () => supabase.from("logistics_vehicles").select("*").order("name"),
      apply: (target, data) => {
        target.logisticsVehicles = (data as LogisticsVehicle[]).map(formatVehicle);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "logisticsSettings",
      optionalMissing: true,
      load: () => supabase.from("logistics_settings").select("*"),
      apply: (target, data) => {
        target.logisticsSettings = data[0]
          ? formatLogisticsSettings(data[0] as LogisticsSettings)
          : null;
      },
    });
    addSnapshotQuery(queries, include, {
      key: "extraServiceCatalog",
      optionalMissing: true,
      load: () => supabase.from("extra_service_catalog").select("*").order("name"),
      apply: (target, data) => {
        target.extraServiceCatalog = (data as ExtraServiceCatalog[]).map(formatServiceCatalog);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "profiles",
      load: () => supabase.from("profiles").select("*").order("name"),
      apply: (target, data) => {
        target.profiles = (data as Profile[]).map(formatProfile);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "clients",
      load: () => supabase.from("clients").select("*").order("name"),
      apply: (target, data) => {
        target.clients = (data as Client[]).map(formatClient);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "contracts",
      load: () => fetchAllRows(() => supabase.from("production_contracts").select("*, lifecycle:production_contract_lifecycle(*)")),
      apply: (target, data) => {
        target.contracts = (data as ProductionContract[]).map(formatContract).sort((a,b) => a.contract_number.localeCompare(b.contract_number));
      },
    });
    addSnapshotQuery(queries, include, {
      key: "stages",
      load: () => supabase.from("production_stages").select("*").order("sort_order"),
      apply: (target, data) => {
        target.stages = (data as ProductionStage[]).map(formatStage);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "prods",
      load: () => fetchAllRows(() => {
        let query = supabase.from("production_prods").select("*, lifecycle:production_prod_lifecycle(*)");

        if (filters.prodId) {
          query = query.eq("id", filters.prodId);
        }

        return query;
      }),
      apply: (target, data) => {
        target.prods = (data as ProductionProd[]).map(formatProd).sort((a,b) => b.created_at.localeCompare(a.created_at));
      },
    });
    addSnapshotQuery(queries, include, {
      key: "prodStages",
      load: () => {
        const query = supabase.from("production_prod_stages").select("*");
        return filters.prodId ? query.eq("prod_id", filters.prodId) : query;
      },
      apply: (target, data) => {
        target.prodStages = data as ProductionSnapshot["prodStages"];
      },
    });
    addSnapshotQuery(queries, include, {
      key: "prodMaterials",
      load: () => {
        const query = supabase.from("production_prod_materials").select("*");
        return filters.prodId ? query.eq("prod_id", filters.prodId) : query;
      },
      apply: (target, data) => {
        target.prodMaterials = data as ProdMaterial[];
      },
    });
    addSnapshotQuery(queries, include, {
      key: "prodPieceImports",
      optionalMissing: true,
      load: () => {
        const query = supabase
          .from("production_piece_imports")
          .select("*")
          .order("created_at", { ascending: false });
        return filters.prodId ? query.eq("prod_id", filters.prodId) : query;
      },
      apply: (target, data) => {
        target.prodPieceImports = data as ProductionPieceImport[];
      },
    });
    addSnapshotQuery(queries, include, {
      key: "prodPieces",
      optionalMissing: true,
      load: () => fetchAllRows(() => {
        const query = supabase
          .from("production_prod_pieces")
          .select("*, disposition:production_piece_dispositions(*)");
        return filters.prodId ? query.eq("prod_id", filters.prodId) : query;
      }),
      apply: (target, data) => {
        target.prodPieces = (data as ProductionPiece[]).map(formatPiece).sort((a,b) => a.sort_order - b.sort_order || a.piece_code.localeCompare(b.piece_code));
      },
    });
    addSnapshotQuery(queries, include, {
      key: "prodPieceStages",
      optionalMissing: true,
      load: async () => {
        const rows: ProductionPieceStage[] = [];
        let afterId: string | undefined;
        while (true) {
          let query = supabase.from("production_prod_piece_stages")
            .select("*, expedition_archive:production_expedition_archives(archived_at,restored_at,reason)")
            .order("id").limit(500);
          if (filters.prodId) query = query.eq("prod_id", filters.prodId);
          if (afterId) query = query.gt("id", afterId);
          const result = await query;
          if (result.error) return { data: null, error: result.error };
          if (!result.data.length) return { data: rows, error: null };
          rows.push(...result.data as ProductionPieceStage[]);
          afterId = result.data[result.data.length - 1].id;
        }
      },
      apply: (target, data) => {
        target.prodPieceStages = (data as ProductionPieceStage[]).map(formatPieceStage);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "productionOperators",
      optionalMissing: true,
      load: () =>
        supabase
          .from("production_operators")
          .select("id, company_id, name, registration, active, notes, created_by, created_at, updated_at")
          .order("name", { ascending: true }),
      apply: (target, data) => {
        target.productionOperators = (data as ProductionOperator[]).map(formatProductionOperator);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "productionOperatorStages",
      optionalMissing: true,
      load: () => supabase.from("production_operator_stages").select("*").order("created_at"),
      apply: (target, data) => {
        target.productionOperatorStages = data as ProductionOperatorStage[];
      },
    });
    addSnapshotQuery(queries, include, {
      key: "pointingReasons",
      optionalMissing: true,
      load: () =>
        supabase
          .from("production_pointing_reasons")
          .select("*")
          .order("kind", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
      apply: (target, data) => {
        target.pointingReasons = (data as ProductionPointingReason[]).map((reason) => ({
          ...reason,
          label: accentDisplayText(reason.label),
          description: accentDisplayText(reason.description),
          counts_as_downtime: reason.counts_as_downtime !== false,
        }));
      },
    });
    addSnapshotQuery(queries, include, {
      key: "pointingSettings",
      optionalMissing: true,
      load: () => supabase.from("production_pointing_settings").select("*"),
      apply: (target, data) => {
        target.pointingSettings = data[0]
          ? formatPointingSettings(data[0] as ProductionPointingSettings)
          : null;
      },
    });
    addSnapshotQuery(queries, include, {
      key: "indirectActivityReasons",
      optionalMissing: true,
      load: () =>
        supabase
          .from("production_indirect_activity_reasons")
          .select("*")
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
      apply: (target, data) => {
        target.indirectActivityReasons = (data as ProductionIndirectActivityReason[]).map(
          (reason) => ({
            ...reason,
            label: accentDisplayText(reason.label),
            description: accentDisplayText(reason.description),
          }),
        );
      },
    });
    addSnapshotQuery(queries, include, {
      key: "indirectActivitySessions",
      optionalMissing: true,
      load: () =>
        supabase
          .from("production_indirect_activity_sessions")
          .select("*")
          .order("started_at", { ascending: false }),
      apply: (target, data) => {
        target.indirectActivitySessions = (data as ProductionIndirectActivitySession[]).map(
          (session) => ({
            ...session,
            total_seconds: Number(session.total_seconds ?? 0),
            notes: accentDisplayText(session.notes),
          }),
        );
      },
    });
    addSnapshotQuery(queries, include, {
      key: "pointingSessionParticipants",
      optionalMissing: true,
      load: () =>
        supabase
          .from("production_pointing_session_participants")
          .select("*")
          .order("created_at", { ascending: true }),
      apply: (target, data) => {
        target.pointingSessionParticipants = data as ProductionPointingSessionParticipant[];
      },
    });
    addSnapshotQuery(queries, include, {
      key: "reworkReasons",
      optionalMissing: true,
      load: () =>
        supabase
          .from("production_rework_reasons")
          .select("*")
          .order("kind", { ascending: true })
          .order("sort_order", { ascending: true })
          .order("label", { ascending: true }),
      apply: (target, data) => {
        target.reworkReasons = (data as ProductionReworkReason[]).map((reason) => ({
          ...reason,
          label: accentDisplayText(reason.label),
          description: accentDisplayText(reason.description),
        }));
      },
    });
    addSnapshotQuery(queries, include, {
      key: "pieceReworks",
      optionalMissing: true,
      load: () => {
        const query = supabase
          .from("production_piece_reworks")
          .select("*")
          .order("created_at", { ascending: false });
        return filters.prodId ? query.eq("prod_id", filters.prodId) : query;
      },
      apply: (target, data) => {
        target.pieceReworks = (data as ProductionPieceRework[]).map((rework) => ({
          ...rework,
          technical_guidance: accentDisplayText(rework.technical_guidance),
          material_notes: accentDisplayText(rework.material_notes),
          description: accentDisplayText(rework.description),
        }));
      },
    });
    addSnapshotQuery(queries, include, {
      key: "pointingSessions",
      optionalMissing: true,
      load: () =>
        supabase
          .from("production_pointing_sessions")
          .select("*")
          .order("event_at", { ascending: false }),
      apply: (target, data) => {
        target.pointingSessions = data as ProductionPointingSession[];
      },
    });
    addSnapshotQuery(queries, include, {
      key: "stageTimeEntries",
      optionalMissing: true,
      load: () => fetchAllRows(() => {
        const query = supabase
          .from("production_stage_time_entries")
          .select("*");
        return filters.prodId ? query.eq("prod_id", filters.prodId) : query;
      }),
      apply: (target, data) => {
        target.stageTimeEntries = data as ProductionStageTimeEntry[];
      },
    });
    addSnapshotQuery(queries, include, {
      key: "storageLocations",
      load: () => supabase.from("storage_locations").select("*").order("name"),
      apply: (target, data) => {
        target.storageLocations = (data as StorageLocation[]).map(formatLocation);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "documentChecks",
      load: () =>
        (filters.prodId
          ? supabase
              .from("production_prod_document_checks")
              .select("*, item:production_document_checklist_items(label)")
              .eq("prod_id", filters.prodId)
          : supabase
              .from("production_prod_document_checks")
              .select("*, item:production_document_checklist_items(label)"))
          .order("created_at"),
      apply: (target, data) => {
        target.documentChecks = (data as Array<DocumentCheck & { item?: { label?: string | null } | null }>).map(
          (check) => ({
            ...check,
            label: accentDisplayText(check.item?.label ?? "Checklist"),
          }),
        ) as DocumentCheck[];
      },
    });
    addSnapshotQuery(queries, include, {
      key: "selectedItems",
      load: () =>
        (filters.prodId
          ? supabase
              .from("production_prod_selected_items")
              .select("*, item:production_selectable_items(name)")
              .eq("prod_id", filters.prodId)
          : supabase
              .from("production_prod_selected_items")
              .select("*, item:production_selectable_items(name)"))
          .order("created_at"),
      apply: (target, data) => {
        target.selectedItems = (
          data as Array<SelectedItem & { item?: { name?: string | null } | null }>
        ).map((item) => ({
          ...item,
          item_name: accentDisplayText(item.item?.name ?? "Item"),
          location: accentDisplayText(item.location),
          notes: accentDisplayText(item.notes),
        })) as SelectedItem[];
      },
    });
    addSnapshotQuery(queries, include, {
      key: "shippingRecords",
      load: () => {
        const query = supabase.from("production_shipping_records").select("*");
        return filters.prodId ? query.eq("prod_id", filters.prodId) : query;
      },
      apply: (target, data) => {
        target.shippingRecords = (data as ShippingRecord[]).map(formatShippingRecord);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "freightDemands",
      optionalMissing: true,
      load: () => supabase.from("freight_demands").select("*").order("created_at", { ascending: false }),
      apply: (target, data) => {
        target.freightDemands = data as FreightDemand[];
      },
    });
    addSnapshotQuery(queries, include, {
      key: "freights",
      load: () => supabase.from("freights").select("*").order("freight_date"),
      apply: (target, data) => {
        target.freights = (data as Freight[]).map(formatFreight);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "freightStops",
      load: () =>
        supabase
          .from("freight_stops")
          .select("*, freight_stop_prods(prod_id)")
          .order("position"),
      apply: (target, data) => {
        target.freightStops = (
          data as Array<FreightStop & { freight_stop_prods?: Array<{ prod_id: string }> | null }>
        ).map((stop) => ({
          ...formatFreightStop(stop),
          prod_ids: stop.freight_stop_prods?.map((link) => link.prod_id) ?? [],
        })) as FreightStop[];
      },
    });
    addSnapshotQuery(queries, include, {
      key: "freightRouteHelpers",
      optionalMissing: true,
      load: () => supabase.from("freight_route_helpers").select("*").order("created_at"),
      apply: (target, data) => {
        target.freightRouteHelpers = (data as FreightRouteHelper[]).map(formatFreightRouteHelper);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "extraServices",
      load: () => supabase.from("extra_service_requests").select("*").order("created_at"),
      apply: (target, data) => {
        target.extraServices = (data as ExtraServiceRequest[]).map(formatExtraService);
      },
    });
    addSnapshotQuery(queries, include, {
      key: "auditLogs",
      load: () => {
        let query = supabase.from("audit_logs").select("*");

        if (filters.prodId) {
          query = query.eq("entity_id", filters.prodId);
        }

        return query.order("created_at", { ascending: false }).limit(50);
      },
      apply: (target, data) => {
        target.auditLogs = (data as AuditLog[]).map((log) => ({
          ...log,
          notes: accentDisplayText(log.notes),
        }));
      },
    });

    const results = await Promise.all(queries.map((query) => query.load()));
    const failedResult = results.find((result, index) => {
      const query = queries[index];

      return Boolean(
        result.error &&
          !(query.optionalMissing && isMissingRelation(result.error)),
      );
    });

    if (failedResult?.error) {
      console.error("Falha ao consultar Supabase", failedResult.error);
      throw new Error("Não foi possível carregar os dados da Produção. Verifique a conexão e a atualização do banco.");
    }

    results.forEach((result, index) => {
      if (result.error) return;
      queries[index].apply(snapshot, result.data ?? []);
    });

    return isolateTransportSnapshot(snapshot);
  } catch (error) {
    console.error("Falha ao carregar dados protegidos do Supabase", error);
    throw error;
  }
}

export async function getProductionSnapshot(): Promise<ProductionSnapshot> {
  return loadProductionSnapshot(includeKeys(allSnapshotKeys));
}

export async function getClientsPageData() {
  return loadProductionSnapshot(includeKeys(["clients"]));
}

export async function getContractsPageData() {
  return loadProductionSnapshot(includeKeys(["clients", "contracts", "prods", "profiles"]));
}

export async function getProdsPageData() {
  return loadProductionSnapshot(
    includeKeys(["clients", "contracts", "profiles", "stages", "prods", "prodMaterials"]),
  );
}

export async function getProdDetailPageData(prodId: string) {
  return loadProductionSnapshot(
    includeKeys([
      "clients",
      "contracts",
      "profiles",
      "stages",
      "prods",
      "prodStages",
      "prodMaterials",
      "prodPieceImports",
      "prodPieces",
      "prodPieceStages",
      "productionOperators",
      "pointingSessionParticipants",
      "reworkReasons",
      "pieceReworks",
      "pointingSessions",
      "stageTimeEntries",
      "documentChecks",
      "selectedItems",
      "shippingRecords",
      "auditLogs",
    ]),
    { prodId },
  );
}

export async function getPointingPageData() {
  return operationalSnapshot(await loadProductionSnapshot(
    includeKeys([
      "clients",
      "contracts",
      "stages",
      "prods",
      "prodPieces",
      "prodPieceStages",
      "productionOperators",
      "pointingReasons",
      "pointingSettings",
      "indirectActivityReasons",
      "indirectActivitySessions",
      "stageTimeEntries",
    ]),
    { throwOnError: true },
  ));
}

export async function getFreightsPageData() {
  return loadProductionSnapshot(
    includeKeys(["clients", "contracts", "prods", "freightDemands"]),
  );
}

export async function getExtraServicesPageData() {
  return loadProductionSnapshot(
    includeKeys(["departments", "logisticsRecipients", "extraServiceCatalog", "extraServices"]),
  );
}

export async function getRoutesPageData() {
  return loadProductionSnapshot(
    includeKeys([
      "departments",
      "logisticsDrivers",
      "logisticsVehicles",
      "logisticsSettings",
      "clients",
      "contracts",
      "prods",
      "freightDemands",
      "freights",
      "freightStops",
      "freightRouteHelpers",
      "extraServices",
    ]),
  );
}

export async function getReportsPageData() {
  return reportableSnapshot(await loadProductionSnapshot(
    includeKeys([
      "clients",
      "contracts",
      "stages",
      "prods",
      "prodStages",
      "prodMaterials",
      "prodPieces",
      "prodPieceStages",
      "productionOperators",
      "pointingReasons",
      "pointingSettings",
      "indirectActivityReasons",
      "indirectActivitySessions",
      "pointingSessionParticipants",
      "pieceReworks",
      "pointingSessions",
      "stageTimeEntries",
      "documentChecks",
      "shippingRecords",
      "freightDemands",
    ]),
  ));
}

export async function getDashboardPageData() {
  return reportableSnapshot(await loadProductionSnapshot(
    includeKeys([
      "clients",
      "contracts",
      "stages",
      "prods",
      "prodStages",
      "prodMaterials",
      "prodPieces",
      "prodPieceStages",
      "pointingReasons",
      "pointingSettings",
      "indirectActivityReasons",
      "indirectActivitySessions",
      "pointingSessionParticipants",
      "pieceReworks",
      "pointingSessions",
      "stageTimeEntries",
      "documentChecks",
      "freights",
      "freightStops",
      "freightRouteHelpers",
      "extraServices",
    ]),
  ));
}

export async function getProdOverview() {
  const snapshot = await getProductionSnapshot();
  return snapshot.prods
    .map((prod) => {
      const contract = snapshot.contracts.find((item) => item.id === prod.contract_id);
      const client = contract
        ? snapshot.clients.find((item) => item.id === contract.client_id)
        : null;
      if (!contract || !client) return null;
      return { ...prod, contract: { ...contract, client } } satisfies DbProdOverview;
    })
    .filter((prod): prod is DbProdOverview => Boolean(prod));
}
