import type { ProductionSnapshot } from "./types";
import {
  buildEffectivePointingSessions,
  buildPausedIntervals,
  buildProductiveIntervals,
  sumMergedIntervalSeconds,
} from "./pointing-productivity";

export type ProductivityOperatorRow = {
  operatorId: string;
  operatorName: string;
  registration: string;
  productiveSeconds: number;
  pausedSeconds: number;
  completedPieces: number;
  completedWeightKg: number;
  piecesPerHour: number;
  kgPerHour: number;
};

export type ProductivityStageRow = {
  operatorId: string;
  operatorName: string;
  stageName: string;
  productiveSeconds: number;
  pausedSeconds: number;
  completedPieces: number;
  completedWeightKg: number;
  piecesPerHour: number;
  kgPerHour: number;
};

export type ProductionProductivityReport = {
  generatedAt: string;
  operatorRows: ProductivityOperatorRow[];
  stageRows: ProductivityStageRow[];
  metrics: {
    operators: number;
    productiveHours: number;
    pausedHours: number;
    completedPieces: number;
    completedWeightKg: number;
  };
  filters?: ProductionProductivityReportFilters;
};

export type ProductionProductivityReportFilters = {
  operatorId?: string;
  stageId?: string;
  dateFrom?: string;
  dateTo?: string;
};

function rate(value: number, seconds: number) {
  const hours = seconds / 3600;
  return hours > 0 ? value / hours : 0;
}

function round(value: number, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function contributorOperatorIds(session: { operatorId: string; participantOperatorIds: string[] }) {
  return Array.from(new Set([session.operatorId, ...session.participantOperatorIds].filter(Boolean)));
}

export function buildProductionProductivityReport(
  snapshot: ProductionSnapshot,
  filters: ProductionProductivityReportFilters = {},
): ProductionProductivityReport {
  const operatorById = new Map(snapshot.productionOperators.map((operator) => [operator.id, operator]));
  const pieceById = new Map(snapshot.prodPieces.map((piece) => [piece.id, piece]));
  const stageById = new Map(snapshot.stages.map((stage) => [stage.id, stage]));
  const operatorRows = new Map<string, ProductivityOperatorRow>();
  const stageRows = new Map<string, ProductivityStageRow>();
  const dateFromMs = filters.dateFrom ? Date.parse(`${filters.dateFrom}T00:00:00`) : null;
  const dateToMs = filters.dateTo ? Date.parse(`${filters.dateTo}T23:59:59.999`) : null;
  const withinPeriod = (value: string) => {
    const time = Date.parse(value);
    if (!Number.isFinite(time)) return false;
    if (dateFromMs != null && Number.isFinite(dateFromMs) && time < dateFromMs) return false;
    if (dateToMs != null && Number.isFinite(dateToMs) && time > dateToMs) return false;
    return true;
  };
  const sessionMatches = (session: {
    stageId: string;
    operatorId: string;
    participantOperatorIds?: string[];
    eventAt: string;
  }) => {
    if (filters.stageId && session.stageId !== filters.stageId) return false;
    if (filters.operatorId && !contributorOperatorIds({
      operatorId: session.operatorId,
      participantOperatorIds: session.participantOperatorIds ?? [],
    }).includes(filters.operatorId)) {
      return false;
    }
    return withinPeriod(session.eventAt);
  };
  const effectiveSessions = buildEffectivePointingSessions(snapshot).filter(sessionMatches);
  const productiveIntervals = buildProductiveIntervals(snapshot).filter((interval) =>
    sessionMatches(interval.session),
  );
  const pausedIntervals = buildPausedIntervals(snapshot, Date.now(), { includeActive: false }).filter(
    (interval) => sessionMatches(interval.session),
  );

  for (const session of effectiveSessions) {
    const contributors = contributorOperatorIds(session).filter((operatorId) =>
      operatorById.has(operatorId),
    );
    if (!contributors.length) continue;

    const stage = stageById.get(session.stageId);
    let completedPieces = 0;
    let completedWeightKg = 0;

    if (session.action === "concluir") {
      const completedPieceIds = new Set<string>();

      for (const entry of session.entries) {
        if (entry.action !== "concluir" || completedPieceIds.has(entry.piece_id)) continue;
        completedPieceIds.add(entry.piece_id);

        const piece = pieceById.get(entry.piece_id);
        completedPieces += Number(piece?.quantity ?? 0);
        completedWeightKg += Number(piece?.total_weight_kg ?? 0);
      }
    }

    const share = 1 / contributors.length;

    for (const operatorId of contributors) {
      const operator = operatorById.get(operatorId);
      if (!operator) continue;

      const operatorRow =
        operatorRows.get(operator.id) ??
        {
          operatorId: operator.id,
          operatorName: operator.name,
          registration: operator.registration,
          productiveSeconds: 0,
          pausedSeconds: 0,
          completedPieces: 0,
          completedWeightKg: 0,
          piecesPerHour: 0,
          kgPerHour: 0,
        };
      const stageKey = `${operator.id}:${session.stageId}`;
      const stageRow =
        stageRows.get(stageKey) ??
        {
          operatorId: operator.id,
          operatorName: operator.name,
          stageName: stage?.name ?? "Etapa não informada",
          productiveSeconds: 0,
          pausedSeconds: 0,
          completedPieces: 0,
          completedWeightKg: 0,
          piecesPerHour: 0,
          kgPerHour: 0,
        };

      operatorRow.completedPieces += completedPieces * share;
      operatorRow.completedWeightKg += completedWeightKg * share;
      stageRow.completedPieces += completedPieces * share;
      stageRow.completedWeightKg += completedWeightKg * share;

      operatorRows.set(operator.id, operatorRow);
      stageRows.set(stageKey, stageRow);
    }
  }

  for (const row of operatorRows.values()) {
    row.productiveSeconds = sumMergedIntervalSeconds(
      productiveIntervals.filter((interval) => interval.operatorId === row.operatorId),
    );
    row.pausedSeconds = sumMergedIntervalSeconds(
      pausedIntervals.filter((interval) => interval.operatorId === row.operatorId),
    );
  }

  for (const [stageKey, row] of stageRows) {
    const [, stageId] = stageKey.split(":");
    row.productiveSeconds = sumMergedIntervalSeconds(
      productiveIntervals.filter(
        (interval) => interval.operatorId === row.operatorId && interval.stageId === stageId,
      ),
    );
    row.pausedSeconds = sumMergedIntervalSeconds(
      pausedIntervals.filter(
        (interval) => interval.operatorId === row.operatorId && interval.stageId === stageId,
      ),
    );
  }

  const normalizedOperatorRows = Array.from(operatorRows.values())
    .map((row) => {
      const productiveSeconds = Math.max(0, row.productiveSeconds);
      const pausedSeconds = Math.max(0, row.pausedSeconds);

      return {
        ...row,
        productiveSeconds,
        pausedSeconds,
        completedPieces: round(row.completedPieces, 2),
        completedWeightKg: round(row.completedWeightKg, 3),
        piecesPerHour: round(rate(row.completedPieces, productiveSeconds), 2),
        kgPerHour: round(rate(row.completedWeightKg, productiveSeconds), 2),
      };
    })
    .sort((left, right) => right.kgPerHour - left.kgPerHour || right.completedPieces - left.completedPieces);

  const normalizedStageRows = Array.from(stageRows.values())
    .map((row) => {
      const productiveSeconds = Math.max(0, row.productiveSeconds);
      const pausedSeconds = Math.max(0, row.pausedSeconds);

      return {
        ...row,
        productiveSeconds,
        pausedSeconds,
        completedPieces: round(row.completedPieces, 2),
        completedWeightKg: round(row.completedWeightKg, 3),
        piecesPerHour: round(rate(row.completedPieces, productiveSeconds), 2),
        kgPerHour: round(rate(row.completedWeightKg, productiveSeconds), 2),
      };
    })
    .sort((left, right) => left.operatorName.localeCompare(right.operatorName, "pt-BR"));

  const productiveSeconds = normalizedOperatorRows.reduce(
    (sum, row) => sum + row.productiveSeconds,
    0,
  );
  const pausedSeconds = normalizedOperatorRows.reduce((sum, row) => sum + row.pausedSeconds, 0);
  const completedPieces = normalizedOperatorRows.reduce(
    (sum, row) => sum + row.completedPieces,
    0,
  );
  const completedWeightKg = normalizedOperatorRows.reduce(
    (sum, row) => sum + row.completedWeightKg,
    0,
  );

  return {
    generatedAt: new Date().toISOString(),
    operatorRows: normalizedOperatorRows,
    stageRows: normalizedStageRows,
    metrics: {
      operators: normalizedOperatorRows.length,
      productiveHours: round(productiveSeconds / 3600, 2),
      pausedHours: round(pausedSeconds / 3600, 2),
      completedPieces: round(completedPieces, 2),
      completedWeightKg: round(completedWeightKg, 3),
    },
    filters,
  };
}
