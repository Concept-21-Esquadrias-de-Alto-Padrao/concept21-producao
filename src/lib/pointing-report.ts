import {
  buildEffectivePointingSessions,
  buildPausedIntervals,
  sumMergedIntervalSeconds,
} from "@/lib/pointing-productivity";
import type { PointingAction, ProductionSnapshot } from "@/lib/types";
import { accentDisplayText, normalizeText } from "@/lib/utils";

export const productionPointingActionLabels: Record<PointingAction, string> = {
  iniciar: "Início",
  pausar: "Pausa",
  retomar: "Retomada",
  concluir: "Conclusão",
  pendencia: "Pendência",
  nao_aplicavel: "Não aplicável",
  retornar: "Retorno de etapa",
  ajuste_tempo: "Ajuste de tempo",
};

export type ProductionPointingReportFilters = {
  q?: string;
  clientId?: string;
  stageId?: string;
  operatorId?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
};

export type ProductionPointingReportRow = {
  id: string;
  sessionId: string | null;
  eventAt: string;
  clientId: string | null;
  contractId: string | null;
  prodId: string;
  pieceId: string;
  stageId: string;
  clientName: string;
  contractNumber: string;
  workName: string;
  prodNumber: string;
  pieceCode: string;
  systemCode: string;
  stageName: string;
  action: PointingAction;
  actionLabel: string;
  operatorId: string;
  operatorName: string;
  participantOperatorIds: string[];
  participantNames: string[];
  productiveSeconds: number;
  pausedSeconds: number;
  reason: string;
  notes: string;
};

export type ProductionPointingReport = {
  generatedAt: string;
  rows: ProductionPointingReportRow[];
  metrics: {
    events: number;
    pieces: number;
    operators: number;
    productiveSeconds: number;
    pausedSeconds: number;
  };
  filters: ProductionPointingReportFilters;
};

function periodBounds(filters: ProductionPointingReportFilters) {
  const from = filters.dateFrom ? Date.parse(`${filters.dateFrom}T00:00:00`) : null;
  const to = filters.dateTo ? Date.parse(`${filters.dateTo}T23:59:59.999`) : null;

  return {
    from: Number.isFinite(from) ? from : null,
    to: Number.isFinite(to) ? to : null,
  };
}

function numericSeconds(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function buildProductionPointingReport(
  snapshot: ProductionSnapshot,
  filters: ProductionPointingReportFilters = {},
): ProductionPointingReport {
  const operatorById = new Map(snapshot.productionOperators.map((operator) => [operator.id, operator]));
  const pieceById = new Map(snapshot.prodPieces.map((piece) => [piece.id, piece]));
  const prodById = new Map(snapshot.prods.map((prod) => [prod.id, prod]));
  const contractById = new Map(snapshot.contracts.map((contract) => [contract.id, contract]));
  const clientById = new Map(snapshot.clients.map((client) => [client.id, client]));
  const stageById = new Map(snapshot.stages.map((stage) => [stage.id, stage]));
  const participantsBySession = new Map<string, string[]>();
  const { from, to } = periodBounds(filters);
  const query = normalizeText(filters.q ?? "");

  for (const participant of snapshot.pointingSessionParticipants) {
    const participants = participantsBySession.get(participant.pointing_session_id) ?? [];
    participants.push(participant.operator_id);
    participantsBySession.set(participant.pointing_session_id, participants);
  }

  const rows = snapshot.stageTimeEntries
    .map<ProductionPointingReportRow>((entry) => {
      const piece = pieceById.get(entry.piece_id);
      const prod = prodById.get(entry.prod_id ?? piece?.prod_id ?? "");
      const contract = prod ? contractById.get(prod.contract_id) : null;
      const client = contract ? clientById.get(contract.client_id) : null;
      const stage = stageById.get(entry.stage_id);
      const participantOperatorIds = Array.from(
        new Set(
          (entry.pointing_session_id
            ? participantsBySession.get(entry.pointing_session_id) ?? []
            : []
          ).filter((operatorId) => operatorId !== entry.operator_id),
        ),
      );
      const participantNames = participantOperatorIds.map(
        (operatorId) =>
          accentDisplayText(operatorById.get(operatorId)?.name ?? "Operador não informado"),
      );

      return {
        id: entry.id,
        sessionId: entry.pointing_session_id,
        eventAt: entry.event_at,
        clientId: client?.id ?? null,
        contractId: contract?.id ?? null,
        prodId: entry.prod_id,
        pieceId: entry.piece_id,
        stageId: entry.stage_id,
        clientName: accentDisplayText(client?.name ?? "Cliente não informado"),
        contractNumber: accentDisplayText(contract?.contract_number ?? "Contrato não informado"),
        workName: accentDisplayText(contract?.work_name ?? "Obra não informada"),
        prodNumber: prod ? `PROD ${prod.prod_number}` : "PROD não informada",
        pieceCode: accentDisplayText(piece?.piece_code ?? "Peça não informada"),
        systemCode: accentDisplayText(piece?.system_code ?? "Sistema não informado"),
        stageName: accentDisplayText(stage?.name ?? "Etapa não informada"),
        action: entry.action,
        actionLabel: productionPointingActionLabels[entry.action],
        operatorId: entry.operator_id,
        operatorName: accentDisplayText(
          operatorById.get(entry.operator_id)?.name ?? "Operador não informado",
        ),
        participantOperatorIds,
        participantNames,
        productiveSeconds: numericSeconds(entry.productive_seconds_delta),
        pausedSeconds: numericSeconds(entry.paused_seconds_delta),
        reason: accentDisplayText(entry.pause_reason ?? "").trim(),
        notes: accentDisplayText(entry.notes ?? "").trim(),
      };
    })
    .filter((row) => {
      const eventTime = Date.parse(row.eventAt);

      if (!Number.isFinite(eventTime)) return false;
      if (from != null && eventTime < from) return false;
      if (to != null && eventTime > to) return false;
      if (filters.clientId && row.clientId !== filters.clientId) return false;
      if (filters.stageId && row.stageId !== filters.stageId) return false;
      if (filters.action && row.action !== filters.action) return false;
      if (
        filters.operatorId &&
        row.operatorId !== filters.operatorId &&
        !row.participantOperatorIds.includes(filters.operatorId)
      ) {
        return false;
      }
      if (!query) return true;

      return [
        row.clientName,
        row.contractNumber,
        row.workName,
        row.prodNumber,
        row.pieceCode,
        row.systemCode,
        row.stageName,
        row.actionLabel,
        row.operatorName,
        row.participantNames.join(" "),
        row.reason,
        row.notes,
      ].some((value) => normalizeText(value).includes(query));
    })
    .sort((left, right) => right.eventAt.localeCompare(left.eventAt));

  const filteredSessionIds = new Set(rows.map((row) => row.sessionId).filter(Boolean));
  const filteredEntryIds = new Set(rows.map((row) => row.id));
  const effectiveSessions = buildEffectivePointingSessions(snapshot).filter((session) =>
    filteredSessionIds.has(session.id) ||
    session.entries.some((entry) => filteredEntryIds.has(entry.id)),
  );
  const sessionMatchesRows = (session: ReturnType<typeof buildEffectivePointingSessions>[number]) =>
    filteredSessionIds.has(session.id) ||
    session.entries.some((entry) => filteredEntryIds.has(entry.id));
  const pausedIntervals = buildPausedIntervals(snapshot, Date.now(), { includeActive: false }).filter(
    (interval) => sessionMatchesRows(interval.session),
  );
  const productiveSeconds = effectiveSessions.reduce(
    (sum, session) => sum + numericSeconds(session.productiveSecondsDelta),
    0,
  );
  const pausedSeconds = sumMergedIntervalSeconds(pausedIntervals);

  return {
    generatedAt: new Date().toISOString(),
    rows,
    metrics: {
      events: rows.length,
      pieces: new Set(rows.map((row) => row.pieceId)).size,
      operators: new Set(
        rows.flatMap((row) => [row.operatorId, ...row.participantOperatorIds]).filter(Boolean),
      ).size,
      productiveSeconds,
      pausedSeconds,
    },
    filters,
  };
}
