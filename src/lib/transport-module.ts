import type { ProductionSnapshot } from "./types";

// Retained for a future integration. Re-enabling requires a reviewed release
// together with the database trigger/stage configuration; it is not a user toggle.
export const TRANSPORT_ENABLED: boolean = false;
export const TRANSPORT_DISABLED_MESSAGE = "O controle de fretes está desativado nesta plataforma.";

const transportSnapshotKeys = new Set<keyof ProductionSnapshot>([
  "logisticsRecipients", "logisticsDrivers", "logisticsVehicles", "logisticsSettings",
  "extraServiceCatalog", "extraServices", "freightDemands", "freights",
  "freightStops", "freightRouteHelpers",
]);

export function isTransportPermission(key: string) {
  return /^production\.(freights|routes|transport|extra_services)\./.test(key)
    || key === "production.settings.manage_logistics";
}

export function isTransportStage(stage: { name?: string | null; required_permission?: string | null }) {
  return isTransportPermission(stage.required_permission ?? "")
    || ["frete", "fretes", "transporte"].includes((stage.name ?? "").trim().toLowerCase());
}

export function isSnapshotKeyEnabled(key: keyof ProductionSnapshot) {
  return TRANSPORT_ENABLED || !transportSnapshotKeys.has(key);
}

export function isProdStatusSelectable(status: string) {
  return TRANSPORT_ENABLED || status !== "aguardando_frete";
}

// Pure projection: legacy data is never rewritten or marked as completed.
export function isolateTransportSnapshot(snapshot: ProductionSnapshot): ProductionSnapshot {
  if (TRANSPORT_ENABLED) return snapshot;
  const stageIds = new Set(snapshot.stages.filter(isTransportStage).map((stage) => stage.id));
  return {
    ...snapshot,
    logisticsRecipients: [], logisticsDrivers: [], logisticsVehicles: [], logisticsSettings: null,
    extraServiceCatalog: [], extraServices: [], freightDemands: [], freights: [],
    freightStops: [], freightRouteHelpers: [],
    stages: snapshot.stages.filter((stage) => !stageIds.has(stage.id)),
    prodStages: snapshot.prodStages.filter((stage) => !stageIds.has(stage.stage_id)),
    prodPieceStages: snapshot.prodPieceStages.filter((stage) => !stageIds.has(stage.stage_id)),
  };
}
