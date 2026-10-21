import { TRANSPORT_ENABLED } from "./transport-module";
import {
  freightStatusLabels,
  materialConfirmationLabels,
  prodStatusLabels,
  routeExecutionTypeLabels,
  stageShortLabels,
  stopTypeLabels,
} from "./labels";
import type {
  Client,
  Department,
  ExtraServiceRequest,
  Freight,
  FreightRouteHelper,
  FreightStop,
  LogisticsDriver,
  LogisticsVehicle,
  MaterialConfirmationStatus,
  ProdMaterial,
  ProductionContract,
  ProductionProd,
  ProductionSnapshot,
  ProductionStage,
  Profile,
} from "./types";
import { getPointingStages } from "./pointing";
import { buildProductiveIntervals, sumMergedIntervalSeconds } from "./pointing-productivity";
import { formatCurrency, formatDate, normalizeText } from "./utils";

export type ProdContext = {
  prod: ProductionProd;
  contract: ProductionContract;
  client: Client;
  currentStage: ProductionStage | null;
};

export function getClientById(snapshot: ProductionSnapshot, id: string) {
  return snapshot.clients.find((client) => client.id === id) ?? null;
}

export function getContractById(snapshot: ProductionSnapshot, id: string) {
  return snapshot.contracts.find((contract) => contract.id === id) ?? null;
}

export function getStageById(snapshot: ProductionSnapshot, id?: string | null) {
  if (!id) return null;
  return snapshot.stages.find((stage) => stage.id === id) ?? null;
}

export function getDepartmentById(snapshot: ProductionSnapshot, id: string) {
  return snapshot.departments.find((department) => department.id === id) ?? null;
}

export function getProfileById(snapshot: ProductionSnapshot, id?: string | null) {
  if (!id) return null;
  return snapshot.profiles.find((profile) => profile.id === id) ?? null;
}

export function buildProdContext(
  snapshot: ProductionSnapshot,
  prod: ProductionProd,
): ProdContext | null {
  const contract = getContractById(snapshot, prod.contract_id);
  if (!contract) return null;
  const client = getClientById(snapshot, contract.client_id);
  if (!client) return null;
  return {
    prod,
    contract,
    client,
    currentStage: getStageById(snapshot, prod.current_stage_id),
  };
}

export function getProdContexts(snapshot: ProductionSnapshot) {
  return snapshot.prods
    .map((prod) => buildProdContext(snapshot, prod))
    .filter((context): context is ProdContext => Boolean(context));
}

export function formatProdIdentification(
  client: Pick<Client, "name">,
  contract: Pick<ProductionContract, "contract_number">,
  prod: Pick<ProductionProd, "prod_number">,
) {
  return `${client.name} - ${contract.contract_number} - PROD ${prod.prod_number}`;
}

export function ensureUniqueProdNumber(
  prods: Pick<ProductionProd, "contract_id" | "prod_number" | "id">[],
  contractId: string,
  prodNumber: number,
  ignoredProdId?: string,
) {
  return !prods.some(
    (prod) =>
      prod.contract_id === contractId &&
      prod.prod_number === prodNumber &&
      prod.id !== ignoredProdId,
  );
}

export function ensureUniqueContractNumber(
  contracts: Pick<ProductionContract, "contract_number" | "id">[],
  contractNumber: string,
  ignoredContractId?: string,
) {
  const normalized = normalizeText(contractNumber);
  return !contracts.some(
    (contract) =>
      normalizeText(contract.contract_number) === normalized &&
      contract.id !== ignoredContractId,
  );
}

export function validateFreightValues(values: {
  expected_value?: number | null;
  contracted_value?: number | null;
  realized_value?: number | null;
  additional_costs?: number | null;
}) {
  return Object.entries(values)
    .filter(([, value]) => typeof value === "number" && value < 0)
    .map(([key]) => key);
}

export function calculateOwnVehicleRouteCosts({
  driver,
  vehicle,
  trailer,
  fuelPricePerLiter,
  helperIds,
  helpers,
  distanceKm,
  estimatedHours,
  helperHours,
  additionalCosts,
}: {
  driver: Pick<LogisticsDriver, "hourly_cost"> | null;
  vehicle: Pick<
    LogisticsVehicle,
    "fuel_consumption_km_l" | "wear_cost_per_km"
  > | null;
  trailer?: Pick<LogisticsVehicle, "wear_cost_per_km"> | null;
  fuelPricePerLiter: number;
  helperIds: string[];
  helpers: Pick<LogisticsDriver, "id" | "hourly_cost">[];
  distanceKm: number;
  estimatedHours: number;
  helperHours: number;
  additionalCosts: number;
}) {
  const driverHourlyCost = Number(driver?.hourly_cost ?? 0);
  const fuelConsumption = Number(vehicle?.fuel_consumption_km_l ?? 0);
  const fuelPrice = Number(fuelPricePerLiter ?? 0);
  const wearCost = Number(vehicle?.wear_cost_per_km ?? 0);
  const trailerWearCostPerKm = Number(trailer?.wear_cost_per_km ?? 0);
  const selectedHelpers = helpers.filter((helper) => helperIds.includes(helper.id));
  const fuelCost = fuelConsumption > 0 ? (distanceKm / fuelConsumption) * fuelPrice : 0;
  const driverLaborCost = estimatedHours * driverHourlyCost;
  const helperLaborCost = selectedHelpers.reduce(
    (sum, helper) => sum + helperHours * Number(helper.hourly_cost ?? 0),
    0,
  );
  const vehicleWearCost = distanceKm * wearCost;
  const trailerWearCost = distanceKm * trailerWearCostPerKm;
  const internalTotalCost =
    fuelCost +
    driverLaborCost +
    helperLaborCost +
    vehicleWearCost +
    trailerWearCost +
    additionalCosts;

  return {
    fuelCost,
    driverLaborCost,
    helperLaborCost,
    vehicleWearCost,
    trailerWearCost,
    internalTotalCost,
    driverHourlyCost,
    fuelConsumption,
    fuelPrice,
    wearCost,
    trailerWearCostPerKm,
  };
}

export function reorderStops(
  stops: FreightStop[],
  activeStopId: string,
  overStopId: string,
) {
  const current = stops.findIndex((stop) => stop.id === activeStopId);
  const target = stops.findIndex((stop) => stop.id === overStopId);
  if (current < 0 || target < 0 || current === target) return stops;
  const next = [...stops];
  const [moved] = next.splice(current, 1);
  next.splice(target, 0, moved);
  return next.map((stop, index) => ({ ...stop, position: index + 1 }));
}

export function moveStop(stops: FreightStop[], stopId: string, direction: -1 | 1) {
  const current = stops.findIndex((stop) => stop.id === stopId);
  if (current < 0) return stops;
  const target = current + direction;
  if (target < 0 || target >= stops.length) return stops;
  return reorderStops(stops, stopId, stops[target].id);
}

export function assertRoutePositionsAreUnique(stops: FreightStop[]) {
  const positions = new Set<number>();
  for (const stop of stops) {
    if (positions.has(stop.position)) {
      return false;
    }
    positions.add(stop.position);
  }
  return true;
}

export function assertProdNotDuplicatedInFreight(stops: FreightStop[]) {
  const prodIds = new Set<string>();
  for (const stop of stops) {
    for (const prodId of stop.prod_ids) {
      if (prodIds.has(prodId)) return false;
      prodIds.add(prodId);
    }
  }
  return true;
}

export function groupProdNumbersForStop(
  stop: FreightStop,
  snapshot: ProductionSnapshot,
) {
  const contexts = stop.prod_ids
    .map((prodId) => snapshot.prods.find((prod) => prod.id === prodId))
    .filter((prod): prod is ProductionProd => Boolean(prod))
    .map((prod) => buildProdContext(snapshot, prod))
    .filter((context): context is ProdContext => Boolean(context));

  const grouped = new Map<
    string,
    { client: Client; contract: ProductionContract; numbers: number[] }
  >();

  for (const context of contexts) {
    const key = `${context.client.id}:${context.contract.id}`;
    const current =
      grouped.get(key) ??
      { client: context.client, contract: context.contract, numbers: [] };
    current.numbers.push(context.prod.prod_number);
    grouped.set(key, current);
  }

  return [...grouped.values()].map(({ client, contract, numbers }) => {
    const sorted = numbers.sort((a, b) => a - b);
    const prefix = `${client.name} - ${contract.contract_number} - `;
    const prodLabel =
      sorted.length === 1
        ? `PROD ${sorted[0]}`
        : `PRODs ${sorted.map((number) => `PROD ${number}`).join(" e ")}`;
    return `${prefix}${prodLabel}`;
  });
}

export function calculateDashboardMetrics(snapshot: ProductionSnapshot) {
  const activeProds = snapshot.prods.filter(
    (prod) => !["concluida", "cancelada"].includes(prod.status),
  );
  const prodsWithMaterialIssues = new Set(
    snapshot.prodMaterials
      .filter((material) =>
        ["parcialmente_confirmado", "aguardando_confirmacao", "indisponivel"].includes(
          material.confirmation_status,
        ),
      )
      .map((material) => material.prod_id),
  );
  const today = getTodayIsoDate();
  const freightsToday = snapshot.freights.filter(
    (freight) => freight.freight_date === today,
  );

  return {
    prodsInProgress: activeProds.filter((prod) =>
      ["em_producao", "embalagem", "expedicao"].includes(prod.status),
    ).length,
    prodsWithIssues: activeProds.filter((prod) => {
      const stage = snapshot.prodStages.find(
        (prodStage) =>
          prodStage.prod_id === prod.id && prodStage.status === "com_pendencia",
      );
      return prodsWithMaterialIssues.has(prod.id) || Boolean(stage) || prod.status === "pausada";
    }).length,
    prodsAwaitingMaterials: activeProds.filter((prod) =>
      prodsWithMaterialIssues.has(prod.id),
    ).length,
    freightsToday: freightsToday.length,
    freightValues: {
      expected: snapshot.freights.reduce(
        (sum, freight) => sum + freight.expected_value,
        0,
      ),
      contracted: snapshot.freights.reduce(
        (sum, freight) => sum + freight.contracted_value,
        0,
      ),
      realized: snapshot.freights.reduce(
        (sum, freight) => sum + freight.realized_value,
        0,
      ),
    },
  };
}

export function getTodayIsoDate(timeZone = "America/Sao_Paulo") {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function startOfDate(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfWeek(value: Date) {
  const start = startOfDate(value);
  const day = start.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return addDays(start, mondayOffset);
}

function startOfMonth(value: Date) {
  return new Date(value.getFullYear(), value.getMonth(), 1);
}

function inDateRange(value: string | null | undefined, start: Date, end: Date) {
  if (!value) return false;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) && date >= start && date < end;
}

function sumCompletedPiecesInRange(
  pieceStages: ProductionSnapshot["prodPieceStages"],
  pieceById: Map<string, ProductionSnapshot["prodPieces"][number]>,
  start: Date,
  end: Date,
) {
  return pieceStages
    .filter((pieceStage) => pieceStage.status === "concluida")
    .filter((pieceStage) => inDateRange(pieceStage.completed_at, start, end))
    .reduce(
      (totals, pieceStage) => {
        const piece = pieceById.get(pieceStage.piece_id);
        totals.pieces += Number(piece?.quantity ?? 1);
        totals.weightKg += Number(piece?.total_weight_kg ?? 0);
        return totals;
      },
      { pieces: 0, weightKg: 0 },
    );
}

export function calculateStageProductivity(snapshot: ProductionSnapshot, nowMs = Date.now()) {
  const pieceById = new Map(snapshot.prodPieces.map((piece) => [piece.id, piece]));
  const productiveIntervals = buildProductiveIntervals(snapshot, nowMs);
  const referenceDate = new Date(nowMs);
  const todayStart = startOfDate(referenceDate);
  const tomorrowStart = addDays(todayStart, 1);
  const weekStart = startOfWeek(referenceDate);
  const nextWeekStart = addDays(weekStart, 7);
  const previousWeekStart = addDays(weekStart, -7);
  const monthStart = startOfMonth(referenceDate);
  const nextMonthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);
  const previousMonthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth() - 1, 1);

  return getPointingStages(snapshot.stages).map((stage) => {
    const normalizedStageName = normalizeText(stage.name);
    const isExpedition = normalizedStageName.includes("expedicao");
    const pieceStages = snapshot.prodPieceStages.filter(
      (pieceStage) => pieceStage.stage_id === stage.id,
    );
    const productiveSeconds = sumMergedIntervalSeconds(
      productiveIntervals.filter((interval) => interval.stageId === stage.id),
    );
    const completedPieceStages = pieceStages.filter(
      (pieceStage) => pieceStage.status === "concluida",
    );
    const completedPieces = completedPieceStages.reduce((sum, pieceStage) => {
      const piece = pieceById.get(pieceStage.piece_id);
      return sum + Number(piece?.quantity ?? 1);
    }, 0);
    const completedWeightKg = completedPieceStages.reduce((sum, pieceStage) => {
      const piece = pieceById.get(pieceStage.piece_id);
      return sum + Number(piece?.total_weight_kg ?? 0);
    }, 0);
    const productiveHours = productiveSeconds / 3600;
    const today = sumCompletedPiecesInRange(pieceStages, pieceById, todayStart, tomorrowStart);
    const week = sumCompletedPiecesInRange(pieceStages, pieceById, weekStart, nextWeekStart);
    const month = sumCompletedPiecesInRange(pieceStages, pieceById, monthStart, nextMonthStart);
    const previousWeek = sumCompletedPiecesInRange(
      pieceStages,
      pieceById,
      previousWeekStart,
      weekStart,
    );
    const previousMonth = sumCompletedPiecesInRange(
      pieceStages,
      pieceById,
      previousMonthStart,
      monthStart,
    );

    return {
      stage,
      label: stageShortLabels[stage.name] ?? stage.name,
      isExpedition,
      productiveSeconds,
      completedPieces,
      completedWeightKg,
      today,
      week,
      month,
      previousWeek,
      previousMonth,
      kgPerHour: productiveHours > 0 ? completedWeightKg / productiveHours : 0,
      piecesPerHour: productiveHours > 0 ? completedPieces / productiveHours : 0,
    };
  });
}

export function getProdsByStage(snapshot: ProductionSnapshot) {
  return snapshot.stages
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((stage) => ({
      stage,
      label: stageShortLabels[stage.name] ?? stage.name,
      count: snapshot.prods.filter((prod) => prod.current_stage_id === stage.id).length,
    }));
}

export function getMaterialSituation(snapshot: ProductionSnapshot) {
  const statuses: MaterialConfirmationStatus[] = [
    "confirmado",
    "parcialmente_confirmado",
    "aguardando_confirmacao",
    "indisponivel",
  ];

  return ["perfis", "componentes", "vidros"].map((group) => ({
    group,
    label: group[0].toUpperCase() + group.slice(1),
    ...Object.fromEntries(
      statuses.map((status) => [
        status,
        snapshot.prodMaterials.filter(
          (material) =>
            material.group === group && material.confirmation_status === status,
        ).length,
      ]),
    ),
  }));
}

export function getForecastVsDone(snapshot: ProductionSnapshot) {
  const buckets = new Map<string, { label: string; previstas: number; concluidas: number }>();
  for (const prod of snapshot.prods) {
    const planned = prod.planned_end_date?.slice(0, 7) ?? "sem-data";
    const current = buckets.get(planned) ?? {
      label: planned === "sem-data" ? "Sem data" : planned,
      previstas: 0,
      concluidas: 0,
    };
    current.previstas += 1;
    if (prod.actual_end_date) current.concluidas += 1;
    buckets.set(planned, current);
  }
  return [...buckets.values()].sort((a, b) => a.label.localeCompare(b.label));
}

export function getAttentionItems(snapshot: ProductionSnapshot) {
  return getProdContexts(snapshot)
    .flatMap((context) => {
      const materials = snapshot.prodMaterials.filter(
        (material) => material.prod_id === context.prod.id,
      );
      const issues: {
        prod: ProdContext;
        reason: string;
        deadline: string | null;
        urgency: "baixa" | "media" | "alta";
      }[] = [];

      for (const material of materials) {
        if (material.confirmation_status === "indisponivel") {
          issues.push({
            prod: context,
            reason: `${material.group}: indisponível`,
            deadline: material.availability_forecast,
            urgency: "alta",
          });
        }
        if (material.confirmation_status === "parcialmente_confirmado") {
          issues.push({
            prod: context,
            reason: `${material.group}: parcialmente confirmado`,
            deadline: material.availability_forecast,
            urgency: "media",
          });
        }
        if (material.confirmation_status === "aguardando_confirmacao") {
          issues.push({
            prod: context,
            reason: `${material.group}: aguardando confirmação`,
            deadline: material.availability_forecast,
            urgency: "media",
          });
        }
      }

      const uncheckedDocs = snapshot.documentChecks.some(
        (check) => check.prod_id === context.prod.id && !check.checked,
      );
      if (uncheckedDocs) {
        issues.push({
          prod: context,
          reason: "Listas ou documentos pendentes",
          deadline: context.prod.planned_start_date,
          urgency: "media",
        });
      }

      if (context.prod.status === "pausada") {
        issues.push({
          prod: context,
          reason: "PROD parada",
          deadline: context.prod.delivery_forecast,
          urgency: "alta",
        });
      }

      if (TRANSPORT_ENABLED && context.prod.status === "aguardando_frete") {
        issues.push({
          prod: context,
          reason: "PROD sem frete programado",
          deadline: context.prod.delivery_forecast,
          urgency: "alta",
        });
      }

      return issues;
    })
    .slice(0, 8);
}

export function getRoutesForDate(snapshot: ProductionSnapshot, date: string) {
  return snapshot.freights
    .filter((freight) => freight.freight_date === date)
    .map((freight) => {
      const stops = snapshot.freightStops.filter((stop) => stop.freight_id === freight.id);
      const prodCount = new Set(stops.flatMap((stop) => stop.prod_ids)).size;
      const extraCount = stops.filter((stop) => stop.stop_type !== "entrega_prod").length;
      return {
        freight,
        stops: stops.sort((a, b) => a.position - b.position),
        prodCount,
        extraCount,
      };
    });
}

export function generateRouteReport(
  freight: Freight,
  stops: FreightStop[],
  snapshot: ProductionSnapshot,
  options: { includeValues?: boolean } = {},
) {
  const orderedStops = stops.slice().sort((a, b) => a.position - b.position);
  const ordinal = (position: number) => `${position}ª`;
  const lines: string[] = [
    `ROTA DE ENTREGA - ${formatDate(freight.freight_date)}`,
    "",
    `Motorista: ${freight.driver ?? "Não informado"}`,
    `Veículo: ${freight.vehicle ?? "Não informado"}`,
    `Placa: ${freight.plate ?? "Não informada"}`,
    `Execução: ${routeExecutionTypeLabels[freight.execution_type]}`,
    `Saída prevista: ${freight.planned_departure_time ?? "Não informada"}`,
  ];

  if (freight.trailer) {
    lines.splice(
      5,
      0,
      `Carretinha: ${freight.trailer}${freight.trailer_plate ? ` - ${freight.trailer_plate}` : ""}`,
    );
  }

  if (options.includeValues) {
    lines.push(
      `Valor previsto: ${formatCurrency(freight.expected_value)}`,
      `Valor contratado: ${formatCurrency(freight.contracted_value)}`,
      `Valor realizado: ${formatCurrency(freight.realized_value)}`,
    );

    if (freight.execution_type === "veiculo_proprio") {
      lines.push(
        `Custo interno: ${formatCurrency(freight.internal_total_cost)}`,
        `Combustível: ${formatCurrency(freight.fuel_cost)}`,
        `Mão de obra: ${formatCurrency(freight.driver_labor_cost + freight.helper_labor_cost)}`,
        `Desgaste: ${formatCurrency(freight.vehicle_wear_cost + freight.trailer_wear_cost)}`,
      );
    }
  }

  for (const stop of orderedStops) {
    const department = getDepartmentById(snapshot, stop.requesting_department_id);
    const requester = getProfileById(snapshot, stop.requesting_profile_id);
    lines.push(
      "",
      `${ordinal(stop.position)} PARADA - ${stopTypeLabels[stop.stop_type].toUpperCase()}`,
      "",
      `Departamento solicitante: ${department?.name ?? "Não informado"}`,
    );

    if (requester) lines.push(`Solicitante: ${requester.name}`);

    if (stop.stop_type === "entrega_prod") {
      const prodGroups = groupProdNumbersForStop(stop, snapshot);
      const firstContext = stop.prod_ids[0]
        ? buildProdContext(
            snapshot,
            snapshot.prods.find((prod) => prod.id === stop.prod_ids[0])!,
          )
        : null;
      if (firstContext) {
        lines.push(
          `Cliente: ${firstContext.client.name}`,
          `Contrato: ${firstContext.contract.contract_number}`,
          `PRODs: ${prodGroups.map((group) => group.split(" - ").pop()).join(", ")}`,
          `Obra: ${firstContext.contract.work_name}`,
        );
      }
    } else {
      const extra = snapshot.extraServices.find(
        (service) => service.id === stop.extra_service_request_id,
      );
      lines.push(
        `Local: ${extra?.recipient_or_place ?? stop.title}`,
        `Serviço: ${extra?.service_description ?? stop.title}`,
      );
    }

    lines.push(
      `Endereço: ${stop.address}`,
      `Contato: ${stop.contact ?? "Não informado"} - ${stop.phone ?? "telefone não informado"}`,
      `Horário: ${stop.planned_window ?? "Não informado"}`,
    );

    if (stop.notes) lines.push(`Observação: ${stop.notes}`);
  }

  return lines.join("\n");
}

export function getRouteHelpers(freightId: string, helpers: FreightRouteHelper[]) {
  return helpers.filter((helper) => helper.freight_id === freightId);
}

export function summarizeTransportPeriod(
  snapshot: ProductionSnapshot,
  routes: Freight[],
  stops: FreightStop[],
) {
  const routeIds = new Set(routes.map((route) => route.id));
  const periodStops = stops.filter((stop) => routeIds.has(stop.freight_id));
  const prodStops = periodStops.filter((stop) => stop.stop_type === "entrega_prod");
  const extraStops = periodStops.filter((stop) => stop.stop_type !== "entrega_prod");
  const statusCounts = new Map<string, number>();
  const driverTotals = new Map<string, { driver: string; routes: number; value: number }>();

  for (const route of routes) {
    statusCounts.set(route.status, (statusCounts.get(route.status) ?? 0) + 1);
    const key = route.driver_id ?? route.driver ?? "sem-motorista";
    const current =
      driverTotals.get(key) ?? {
        driver: route.driver ?? "Sem motorista",
        routes: 0,
        value: 0,
      };
    current.routes += 1;
    current.value += route.expected_value;
    driverTotals.set(key, current);
  }

  const clientTotals = new Map<string, { client: string; prods: number; routes: number }>();
  for (const stop of prodStops) {
    const firstProdId = stop.prod_ids[0];
    const prod = firstProdId ? snapshot.prods.find((item) => item.id === firstProdId) : null;
    const context = prod ? buildProdContext(snapshot, prod) : null;
    if (!context) continue;

    const current =
      clientTotals.get(context.client.id) ?? {
        client: context.client.name,
        prods: 0,
        routes: new Set<string>().size,
      };
    current.prods += stop.prod_ids.length;
    current.routes += 1;
    clientTotals.set(context.client.id, current);
  }

  return {
    totalRoutes: routes.length,
    totalStops: periodStops.length,
    totalProdFreights: prodStops.length,
    totalExtraServices: extraStops.length,
    totalExpectedValue: routes.reduce((sum, route) => sum + route.expected_value, 0),
    totalInternalCost: routes.reduce((sum, route) => sum + route.internal_total_cost, 0),
    totalAdditionalCosts: routes.reduce((sum, route) => sum + route.additional_costs, 0),
    totalDistanceKm: routes.reduce((sum, route) => sum + route.distance_km, 0),
    statusCounts: Object.fromEntries(statusCounts),
    driverRanking: [...driverTotals.values()].sort((a, b) => b.routes - a.routes),
    clientRanking: [...clientTotals.values()].sort((a, b) => b.prods - a.prods),
  };
}

export function filterReports(snapshot: ProductionSnapshot, filters: {
  departmentId?: string;
  status?: string;
  driver?: string;
  stopType?: string;
}) {
  let stops = snapshot.freightStops;
  if (filters.departmentId) {
    stops = stops.filter((stop) => stop.requesting_department_id === filters.departmentId);
  }
  if (filters.stopType) {
    stops = stops.filter((stop) => stop.stop_type === filters.stopType);
  }
  if (filters.status) {
    stops = stops.filter((stop) => stop.status === filters.status);
  }
  if (filters.driver) {
    const freightIds = snapshot.freights
      .filter((freight) =>
        normalizeText(freight.driver ?? "").includes(normalizeText(filters.driver ?? "")),
      )
      .map((freight) => freight.id);
    stops = stops.filter((stop) => freightIds.includes(stop.freight_id));
  }

  return {
    totalRequests: stops.length,
    totalDeliveries: stops.filter((stop) => stop.stop_type.includes("entrega")).length,
    totalPickups: stops.filter((stop) => stop.stop_type.includes("coleta")).length,
    totalDone: stops.filter((stop) => stop.completed || stop.status === "concluido").length,
    totalNotDone: stops.filter((stop) => stop.status === "nao_realizado").length,
    totalCanceled: stops.filter((stop) => stop.status === "cancelado").length,
    stops,
  };
}

export function canManagePermissions(profile: Profile | null) {
  if (!profile) return false;
  return profile.is_master;
}

export function hasPermission(profile: Profile | null, permission: string) {
  if (!profile) return false;
  return profile.is_master || profile.permissions.includes(permission);
}

export function describeFreightStatus(status: Freight["status"]) {
  return freightStatusLabels[status] ?? status;
}

export function describeProdStatus(status: ProductionProd["status"]) {
  return prodStatusLabels[status] ?? status;
}

export function describeMaterialConfirmation(status: ProdMaterial["confirmation_status"]) {
  return materialConfirmationLabels[status] ?? status;
}

export function getExtraServiceForStop(
  stop: FreightStop,
  services: ExtraServiceRequest[],
) {
  return services.find((service) => service.id === stop.extra_service_request_id) ?? null;
}

export function getDepartmentName(departments: Department[], id?: string | null) {
  return departments.find((department) => department.id === id)?.name ?? "Sem departamento";
}
