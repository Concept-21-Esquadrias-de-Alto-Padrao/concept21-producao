import { isExpeditionArchived } from "./expedition-archive";
import type { ProdStatus, ProductionPiece, ProductionPieceStage, ProductionProd, ProductionStage } from "./types";

export const MANUAL_PROD_STATUSES = [
  "planejamento", "aguardando_materiais", "aguardando_listas", "pronta_para_producao", "pausada",
] as const satisfies readonly ProdStatus[];

type StatusOrigin = NonNullable<ProductionProd["status_origin"]>;

/** Read-only projection. Pointings, pieces and the stored legacy status are never rewritten. */
export function deriveProdStatus(
  prod: ProductionProd,
  pieces: ProductionPiece[],
  pieceStages: ProductionPieceStage[],
  stages: ProductionStage[],
): { status: ProdStatus; status_origin: StatusOrigin } {
  if (prod.lifecycle?.historical_recorded_at) {
    return { status: prod.status, status_origin: "historico" };
  }
  if (prod.lifecycle?.state === "concluida" || prod.lifecycle?.state === "cancelada") {
    return { status: prod.lifecycle.state, status_origin: "automatico" };
  }
  if (prod.legacy_status === "pausada") {
    return { status: "pausada", status_origin: "manual" };
  }

  const activePieces = pieces.filter(piece => piece.prod_id === prod.id && !piece.disposition?.cancelled_at);
  const pieceIds = new Set(activePieces.map(piece => piece.id));
  const stageOrder = new Map(stages.map(stage => [stage.id, stage.sort_order]));
  const slots = new Map<string, ProductionPieceStage>();
  let manufacturingStarted = false;
  for (const row of pieceStages) {
    if (row.prod_id !== prod.id || !pieceIds.has(row.piece_id)) continue;
    const order = stageOrder.get(row.stage_id);
    if (!order || order < 5 || order > 8) continue;
    slots.set(`${row.piece_id}:${order}`, row);
    if (row.started_at || row.status === "em_andamento" || row.status === "pausada"
      || row.status === "com_pendencia" || row.status === "concluida"
      || row.status === "concluida_parcialmente") manufacturingStarted = true;
  }
  const done = (pieceId: string, order: number) => {
    const row = slots.get(`${pieceId}:${order}`);
    return Boolean(row && ["concluida", "nao_aplicavel"].includes(row.status)
      && row.completed_at && !row.blockers?.trim() && !isExpeditionArchived(row));
  };
  const readyPieces = activePieces.length > 0 && activePieces.every(piece => piece.released_to_production);
  if (readyPieces && activePieces.every(piece => [5, 6, 7, 8].every(order => done(piece.id, order)))
    && prod.lifecycle?.manufacturing_state === "concluida") {
    return { status: "expedicao", status_origin: "automatico" };
  }
  if (readyPieces && activePieces.every(piece => [5, 6, 7].every(order => done(piece.id, order)))) {
    return { status: "embalagem", status_origin: "automatico" };
  }
  if (manufacturingStarted) return { status: "em_producao", status_origin: "automatico" };
  return {
    status: prod.status,
    status_origin: MANUAL_PROD_STATUSES.some(value => value === prod.status) ? "manual" : "legado",
  };
}
