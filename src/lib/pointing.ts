import type { ProductionPieceStage, ProductionStage } from "./types";

export const POINTING_STAGE_MIN_ORDER = 5;
export const POINTING_STAGE_MAX_ORDER = 9;

const doneStatuses = new Set(["concluida", "nao_aplicavel"]);

export function isPointingStage(stage: Pick<ProductionStage, "active" | "sort_order">) {
  return (
    stage.active &&
    stage.sort_order >= POINTING_STAGE_MIN_ORDER &&
    stage.sort_order <= POINTING_STAGE_MAX_ORDER
  );
}

export function getPointingStages<T extends Pick<ProductionStage, "active" | "sort_order">>(
  stages: T[],
) {
  return stages.filter(isPointingStage).sort((left, right) => left.sort_order - right.sort_order);
}

export function isPieceStageDone(status: string) {
  return doneStatuses.has(status);
}

export function isPieceStageUnlocked(
  pieceStage: Pick<ProductionPieceStage, "piece_id" | "stage_id">,
  allPieceStages: Array<{ piece_id: string; stage_id: string; status: string }>,
  pointingStages: Array<Pick<ProductionStage, "id" | "sort_order">>,
) {
  const currentIndex = pointingStages.findIndex((stage) => stage.id === pieceStage.stage_id);
  if (currentIndex < 0) return false;
  if (currentIndex === 0) return true;

  const previousStage = pointingStages[currentIndex - 1];
  const previousPieceStage = allPieceStages.find(
    (candidate) =>
      candidate.piece_id === pieceStage.piece_id && candidate.stage_id === previousStage.id,
  );

  return Boolean(previousPieceStage && isPieceStageDone(previousPieceStage.status));
}

export function secondsSince(value: string | null | undefined, nowMs: number) {
  if (!value) return 0;
  const startMs = new Date(value).getTime();
  if (!Number.isFinite(startMs)) return 0;
  const seconds = Math.floor((nowMs - startMs) / 1000);
  return seconds > 0 ? seconds : 0;
}

function padTimeUnit(value: number) {
  return String(value).padStart(2, "0");
}

export function formatDurationClock(seconds: number) {
  const totalSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;

  return `${padTimeUnit(hours)}:${padTimeUnit(minutes)}:${padTimeUnit(remainingSeconds)}`;
}

export function currentProductiveSeconds(
  pieceStage: Pick<
    ProductionPieceStage,
    "status" | "last_action" | "last_action_at" | "total_productive_seconds"
  >,
  nowMs: number,
) {
  const accumulated = Number(pieceStage.total_productive_seconds ?? 0);

  if (
    pieceStage.status === "em_andamento" &&
    ["iniciar", "retomar"].includes(pieceStage.last_action ?? "")
  ) {
    return accumulated + secondsSince(pieceStage.last_action_at, nowMs);
  }

  return accumulated;
}

export function currentPausedSeconds(
  pieceStage: Pick<
    ProductionPieceStage,
    "status" | "last_action" | "last_action_at" | "total_paused_seconds"
  >,
  nowMs: number,
) {
  const accumulated = Number(pieceStage.total_paused_seconds ?? 0);

  if (
    ["pausada", "com_pendencia"].includes(pieceStage.status) &&
    ["pausar", "pendencia"].includes(pieceStage.last_action ?? "")
  ) {
    return accumulated + secondsSince(pieceStage.last_action_at, nowMs);
  }

  return accumulated;
}
