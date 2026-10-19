"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Loader2,
  Pause,
  Pencil,
  Play,
  RotateCcw,
  Undo2,
  X,
  Ban,
} from "lucide-react";
import { useActionState, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  adjustProductionPieceStageTimeAction,
  finishIndirectActivityAction,
  pointProductionPiecesAction,
  releaseProdPiecesToProductionAction,
  revertProdPiecesReleaseAction,
  startIndirectActivityAction,
} from "@/app/actions";
import { Field, inputClass, textareaClass } from "@/components/action-form";
import { StatusBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import { ExpeditionLoadControlPanel } from "@/components/expedition-load-control-panel";
import { ExpeditionArchivePanel } from "@/components/expedition-archive-panel";
import { isExpeditionArchived } from "@/lib/expedition-archive";
import { useServerSyncedNow } from "@/hooks/use-server-synced-now";
import { stageStatusLabels } from "@/lib/labels";
import {
  POINTING_STAGE_MAX_ORDER,
  currentProductiveSeconds,
  formatDurationClock,
  getPointingStages,
  isPieceStageUnlocked,
} from "@/lib/pointing";
import { calculateAdjustedPausedSeconds } from "@/lib/pointing-productivity";
import type {
  Client,
  PointingAction,
  ProductionContract,
  ProductionOperator,
  ProductionPiece,
  ProductionPieceStage,
  ProductionIndirectActivityReason,
  ProductionIndirectActivitySession,
  ProductionPointingSettings,
  ProductionPointingReason,
  ProductionProd,
  ProductionStage,
  ProductionStageTimeEntry,
} from "@/lib/types";
import { accentDisplayText, cn } from "@/lib/utils";

type OperationalPointingAction = Exclude<PointingAction, "ajuste_tempo" | "nao_aplicavel">;

type ActionState = {
  ok: boolean;
  message: string;
};

type PointingBoardProps = {
  clients: Client[];
  contracts: ProductionContract[];
  prods: ProductionProd[];
  stages: ProductionStage[];
  pieces: ProductionPiece[];
  pieceStages: ProductionPieceStage[];
  operators: ProductionOperator[];
  pointingReasons: ProductionPointingReason[];
  pointingSettings: ProductionPointingSettings | null;
  indirectActivityReasons: ProductionIndirectActivityReason[];
  indirectActivitySessions: ProductionIndirectActivitySession[];
  timeEntries: ProductionStageTimeEntry[];
  canPerform: boolean;
  canArchiveExpedition: boolean;
  canRollback: boolean;
  canAdjustTime: boolean;
  canReleaseProduction: boolean;
  serverNowIso: string;
};

const initialState: ActionState = {
  ok: false,
  message: "",
};

const actionLabels: Record<PointingAction, string> = {
  iniciar: "Iniciar",
  pausar: "Pausar",
  retomar: "Retomar",
  concluir: "Concluir",
  pendencia: "Pendência",
  nao_aplicavel: "Não aplicável",
  retornar: "Voltar etapa",
  ajuste_tempo: "Ajuste de tempo",
};

const operationalActions: OperationalPointingAction[] = [
  "iniciar",
  "pausar",
  "retomar",
  "concluir",
  "pendencia",
  "retornar",
];

const actionIcons: Record<OperationalPointingAction, typeof Play> = {
  iniciar: Play,
  pausar: Pause,
  retomar: RotateCcw,
  concluir: CheckCircle2,
  pendencia: AlertTriangle,
  retornar: Undo2,
};

function datetimeLocalValue(value: string | number | Date | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function ReleaseProductionButton({ prodId, piecesCount }: { prodId: string; piecesCount: number }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    releaseProdPiecesToProductionAction,
    initialState,
  );

  useEffect(() => {
    if (!state.ok) return;
    const timeout = window.setTimeout(() => router.refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [router, state.ok]);

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="prod_id" value={prodId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        Liberar {piecesCount} peça(s) para produção
      </button>
      {state.message ? (
        <span className={cn("text-xs font-medium", state.ok ? "text-success" : "text-danger")}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

function RevertReleaseButton({ prodId }: { prodId: string }) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(
    revertProdPiecesReleaseAction,
    initialState,
  );

  useEffect(() => {
    if (!state.ok) return;
    const timeout = window.setTimeout(() => router.refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [router, state.ok]);

  return (
    <form action={formAction} className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <input type="hidden" name="prod_id" value={prodId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-3 py-2 text-xs font-semibold text-amber-900 transition hover:bg-amber-50 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        Estornar liberação
      </button>
      {state.message ? (
        <span className={cn("text-xs font-medium", state.ok ? "text-success" : "text-danger")}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

function IndirectActivityStartForm({
  reasons,
}: {
  reasons: ProductionIndirectActivityReason[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(startIndirectActivityAction, initialState);

  useEffect(() => {
    if (!state.ok) return;
    const timeout = window.setTimeout(() => router.refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [router, state.ok]);

  return (
    <form action={formAction} className="rounded-md border border-border bg-white p-3">
      <div className="grid gap-3 md:grid-cols-3">
        <Field label="Atividade">
          <select name="reason_id" className={inputClass} required disabled={reasons.length === 0}>
            <option value="">
              {reasons.length ? "Selecione" : "Cadastre atividades em Configurações > Apontamentos"}
            </option>
            {reasons.map((reason) => (
              <option key={reason.id} value={reason.id}>
                {accentDisplayText(reason.label)}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Matrícula">
          <input
            name="operator_registration"
            className={inputClass}
            autoComplete="off"
            inputMode="numeric"
            maxLength={3}
            pattern="[0-9]{3}"
            placeholder="000"
            required
          />
        </Field>
        <Field label="Senha/PIN">
          <input
            name="operator_pin"
            type="password"
            className={inputClass}
            autoComplete="off"
            inputMode="numeric"
            maxLength={4}
            pattern="[0-9]{4}"
            placeholder="0000"
            required
          />
        </Field>
      </div>
      <Field label="Observações" className="mt-3">
        <textarea name="notes" className={textareaClass} />
      </Field>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <button
          type="submit"
          disabled={pending || reasons.length === 0}
          className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
          Iniciar atividade
        </button>
        {state.message ? (
          <span className={cn("text-sm font-medium", state.ok ? "text-success" : "text-danger")}>
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

function IndirectActivityFinishForm({
  session,
}: {
  session: ProductionIndirectActivitySession;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(finishIndirectActivityAction, initialState);

  useEffect(() => {
    if (!state.ok) return;
    const timeout = window.setTimeout(() => router.refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [router, state.ok]);

  return (
    <form action={formAction} className="mt-3 grid gap-2 md:grid-cols-[1fr_1fr_auto]">
      <input type="hidden" name="session_id" value={session.id} />
      <Field label="Matrícula">
        <input
          name="operator_registration"
          className={inputClass}
          autoComplete="off"
          inputMode="numeric"
          maxLength={3}
          pattern="[0-9]{3}"
          placeholder="000"
          required
        />
      </Field>
      <Field label="Senha/PIN">
        <input
          name="operator_pin"
          type="password"
          className={inputClass}
          autoComplete="off"
          inputMode="numeric"
          maxLength={4}
          pattern="[0-9]{4}"
          placeholder="0000"
          required
        />
      </Field>
      <button
        type="submit"
        disabled={pending}
        className="inline-flex min-h-10 items-center justify-center gap-2 self-end rounded-md bg-charcoal px-4 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        Finalizar
      </button>
      {state.message ? (
        <span
          className={cn(
            "md:col-span-3 text-sm font-medium",
            state.ok ? "text-success" : "text-danger",
          )}
        >
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

function IndirectActivitiesPanel({
  reasons,
  sessions,
  operators,
  nowMs,
}: {
  reasons: ProductionIndirectActivityReason[];
  sessions: ProductionIndirectActivitySession[];
  operators: ProductionOperator[];
  nowMs: number;
}) {
  const activeReasons = reasons
    .filter((reason) => reason.active)
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order ||
        left.label.localeCompare(right.label, "pt-BR"),
    );
  const operatorById = new Map(operators.map((operator) => [operator.id, operator]));
  const reasonById = new Map(reasons.map((reason) => [reason.id, reason]));
  const activeSessions = sessions.filter((session) => session.status === "em_andamento");

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
        Use esta área para registrar limpeza, organização, apoio, reuniões ou outras atividades fora da peça.
      </div>
      <IndirectActivityStartForm reasons={activeReasons} />

      <div className="space-y-2">
        <div>
          <p className="font-semibold text-charcoal">Atividades em andamento</p>
          <p className="text-sm text-muted-foreground">
            Finalize com a mesma matrícula usada no início da atividade.
          </p>
        </div>
        {activeSessions.length === 0 ? (
          <EmptyState
            icon={Clock3}
            title="Nenhuma atividade indireta em andamento"
            description="Inicie uma atividade quando o operador estiver fora do apontamento direto de peça."
          />
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {activeSessions.map((session) => {
              const operator = operatorById.get(session.operator_id);
              const reason = session.reason_id ? reasonById.get(session.reason_id) : null;
              const startedMs = Date.parse(session.started_at);
              const elapsedSeconds = Number.isFinite(startedMs)
                ? Math.max(0, Math.floor((nowMs - startedMs) / 1000))
                : Number(session.total_seconds ?? 0);

              return (
                <article key={session.id} className="rounded-md border border-border bg-white p-3">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-semibold text-charcoal">
                        {operator ? accentDisplayText(operator.name) : "Operador não informado"}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {reason ? accentDisplayText(reason.label) : "Atividade não informada"}
                      </p>
                      {session.notes ? (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {accentDisplayText(session.notes)}
                        </p>
                      ) : null}
                    </div>
                    <span className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
                      <Clock3 className="size-3" />
                      {formatDurationClock(elapsedSeconds)}
                    </span>
                  </div>
                  <IndirectActivityFinishForm session={session} />
                </article>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export function ProductionPointingBoard({
  clients,
  contracts,
  prods,
  stages,
  pieces,
  pieceStages,
  operators,
  pointingReasons,
  pointingSettings,
  indirectActivityReasons,
  indirectActivitySessions,
  timeEntries,
  canPerform,
  canArchiveExpedition,
  canRollback,
  canAdjustTime,
  canReleaseProduction,
  serverNowIso,
}: PointingBoardProps) {
  const router = useRouter();
  const pointingStages = useMemo(() => getPointingStages(stages), [stages]);
  const [activeStageId, setActiveStageId] = useState(pointingStages[0]?.id ?? "");
  const [activePanel, setActivePanel] = useState<"production" | "indirect">("production");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [activeAction, setActiveAction] = useState<OperationalPointingAction | null>(null);
  const [participantRegistrations, setParticipantRegistrations] = useState("");
  const [editingTimeStage, setEditingTimeStage] = useState<ProductionPieceStage | null>(null);
  const [timezoneOffsetMinutes, setTimezoneOffsetMinutes] = useState(0);
  const nowMs = useServerSyncedNow(serverNowIso);
  const [state, formAction, pending] = useActionState(pointProductionPiecesAction, initialState);
  const [timeState, timeFormAction, timePending] = useActionState(
    adjustProductionPieceStageTimeAction,
    initialState,
  );
  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const contractById = useMemo(
    () => new Map(contracts.map((contract) => [contract.id, contract])),
    [contracts],
  );
  const prodById = useMemo(() => new Map(prods.map((prod) => [prod.id, prod])), [prods]);
  const pieceById = useMemo(() => new Map(pieces.map((piece) => [piece.id, piece])), [pieces]);
  const operatorById = useMemo(
    () => new Map(operators.map((operator) => [operator.id, operator])),
    [operators],
  );
  const entriesByPieceStageId = useMemo(() => {
    const entries = new Map<string, ProductionStageTimeEntry[]>();

    for (const entry of timeEntries) {
      const currentEntries = entries.get(entry.piece_stage_id) ?? [];
      currentEntries.push(entry);
      entries.set(entry.piece_stage_id, currentEntries);
    }

    return entries;
  }, [timeEntries]);
  const activePointingReasons = useMemo(
    () =>
      pointingReasons
        .filter((reason) => reason.active)
        .sort(
          (left, right) =>
            left.kind.localeCompare(right.kind, "pt-BR") ||
            left.sort_order - right.sort_order ||
            left.label.localeCompare(right.label, "pt-BR"),
        ),
    [pointingReasons],
  );
  const pointingStageIds = useMemo(
    () => new Set(pointingStages.map((stage) => stage.id)),
    [pointingStages],
  );
  const resolvedActiveStageId = pointingStageIds.has(activeStageId)
    ? activeStageId
    : pointingStages[0]?.id ?? "";
  const pointingPieceStages = useMemo(
    () => pieceStages.filter((pieceStage) => pointingStageIds.has(pieceStage.stage_id)),
    [pieceStages, pointingStageIds],
  );
  const firstPointingStageId = pointingStages[0]?.id ?? "";
  const firstPointingStageByPieceId = useMemo(() => {
    const rows = new Map<string, ProductionPieceStage>();
    if (!firstPointingStageId) return rows;

    for (const pieceStage of pointingPieceStages) {
      if (pieceStage.stage_id === firstPointingStageId) {
        rows.set(pieceStage.piece_id, pieceStage);
      }
    }

    return rows;
  }, [firstPointingStageId, pointingPieceStages]);
  const stageRows = useMemo(() => pointingPieceStages.filter(
    (pieceStage) => pieceStage.stage_id === resolvedActiveStageId,
  ), [pointingPieceStages, resolvedActiveStageId]);
  const activeStageIndex = pointingStages.findIndex((stage) => stage.id === resolvedActiveStageId);
  const activeStage = activeStageIndex >= 0 ? pointingStages[activeStageIndex] : null;
  const activeStageOrder = activeStage?.sort_order ?? 0;
  const activeStageCanBeNotApplicable =
    activeStageOrder >= 5 &&
    activeStageOrder <= 7;
  const isExpeditionStage = activeStageOrder === POINTING_STAGE_MAX_ORDER;
  const canRollbackActiveStage = activeStageIndex > 0;
  const rowIsReleased = useCallback((pieceStage: ProductionPieceStage) => {
    const piece = pieceById.get(pieceStage.piece_id);
    if (!piece?.released_to_production) return false;
    if (piece.released_by) return true;

    const firstStage = firstPointingStageByPieceId.get(pieceStage.piece_id);
    return Boolean(firstStage && firstStage.status !== "nao_iniciada");
  }, [firstPointingStageByPieceId, pieceById]);

  const openRows = useMemo(() => stageRows.filter((pieceStage) => {
    if (isExpeditionStage && isExpeditionArchived(pieceStage)) return false;
    if (pieceStage.status === "concluida") return false;
    if (!isPieceStageUnlocked(pieceStage, pointingPieceStages, pointingStages)) return false;
    if (rowIsReleased(pieceStage)) return true;
    return canReleaseProduction && activeStageIndex === 0;
  }), [stageRows, isExpeditionStage, pointingPieceStages, pointingStages, rowIsReleased, canReleaseProduction, activeStageIndex]);
  const groupedOpenRows = useMemo(() => {
    const groups = new Map<
      string,
      {
        key: string;
        clientName: string;
        contractLabel: string;
        prodLabel: string;
        workName: string;
        released: boolean;
        rows: ProductionPieceStage[];
      }
    >();

    for (const row of openRows) {
      const piece = pieceById.get(row.piece_id);
      const prod = prodById.get(piece?.prod_id ?? row.prod_id) ?? null;
      const contract = prod ? contractById.get(prod.contract_id) : null;
      const client = contract ? clientById.get(contract.client_id) : null;
      const released = rowIsReleased(row);
      const key = `${prod?.id ?? row.prod_id ?? row.id}:${released ? "released" : "unreleased"}`;
      const current =
        groups.get(key) ??
        {
          key,
          clientName: accentDisplayText(client?.name ?? "Cliente não informado"),
          contractLabel: contract?.contract_number
            ? `Contrato ${accentDisplayText(contract.contract_number)}`
            : "Contrato não informado",
          prodLabel: prod?.prod_number
            ? `PROD ${accentDisplayText(String(prod.prod_number))}`
            : "PROD não informada",
          workName: accentDisplayText(contract?.work_name ?? "Obra não informada"),
          released,
          rows: [],
        };
      current.rows.push(row);
      groups.set(key, current);
    }

    return Array.from(groups.values());
  }, [clientById, contractById, openRows, pieceById, prodById, rowIsReleased]);
  const prodIdsWithMovement = useMemo(() => {
    const movedProdIds = new Set<string>();

    for (const entry of timeEntries) {
      movedProdIds.add(entry.prod_id);
    }

    for (const pieceStage of pointingPieceStages) {
      if (!["nao_iniciada", "aguardando"].includes(pieceStage.status)) {
        movedProdIds.add(pieceStage.prod_id);
      }
    }

    return movedProdIds;
  }, [pointingPieceStages, timeEntries]);
  const visibleOpenRows = useMemo(
    () =>
      groupedOpenRows.flatMap((group) =>
        expandedGroupIds.has(group.key) ? group.rows : [],
      ),
    [expandedGroupIds, groupedOpenRows],
  );
  const selectedRows = openRows.filter((pieceStage) => selectedIds.has(pieceStage.id));
  const selectedJson = JSON.stringify(Array.from(selectedIds));

  useEffect(() => {
    if (!state.ok) return;

    const timeout = window.setTimeout(() => {
      setSelectedIds(new Set());
      setActiveAction(null);
      setParticipantRegistrations("");
      router.refresh();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [router, state.ok]);

  useEffect(() => {
    if (!timeState.ok) return;

    const timeout = window.setTimeout(() => {
      setEditingTimeStage(null);
      router.refresh();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [router, timeState.ok]);

  function openTimeEditor(pieceStage: ProductionPieceStage) {
    setTimezoneOffsetMinutes(new Date().getTimezoneOffset());
    setEditingTimeStage(pieceStage);
  }

  function toggleSelected(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  function selectAllVisible() {
    const visibleIds = visibleOpenRows.map((pieceStage) => pieceStage.id);
    const allSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(visibleIds));
  }

  function toggleGroupExpanded(groupId: string, rowIds: string[]) {
    const willCollapse = expandedGroupIds.has(groupId);

    setExpandedGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) {
        next.delete(groupId);
      } else {
        next.add(groupId);
      }
      return next;
    });

    if (!willCollapse) return;

    const rowIdSet = new Set(rowIds);
    setSelectedIds((current) => new Set([...current].filter((id) => !rowIdSet.has(id))));
    setActiveAction(null);
  }

  function resetAction() {
    setSelectedIds(new Set());
    setActiveAction(null);
    setParticipantRegistrations("");
  }

  function startSinglePieceAction(pieceStageId: string, action: OperationalPointingAction) {
    setSelectedIds(new Set([pieceStageId]));
    setActiveAction(action);
  }

  function availableActionsForPieceStage(pieceStage: ProductionPieceStage) {
    const actions: OperationalPointingAction[] = [];

    if (canPerform) {
      if (["nao_iniciada", "aguardando"].includes(pieceStage.status)) actions.push("iniciar");
      if (pieceStage.status === "em_andamento") actions.push("pausar", "pendencia", "concluir");
      if (["pausada", "com_pendencia"].includes(pieceStage.status)) actions.push("retomar");
      if (
        activeStageCanBeNotApplicable &&
        ["nao_iniciada", "aguardando", "pausada", "com_pendencia"].includes(pieceStage.status)
      ) {
        actions.push("concluir");
      }
    }

    if (
      canRollback &&
      canRollbackActiveStage &&
      !["nao_iniciada", "nao_aplicavel"].includes(pieceStage.status)
    ) {
      actions.push("retornar");
    }

    return actions;
  }

  function lastEntry(pieceStage: ProductionPieceStage) {
    const entries = entriesByPieceStageId.get(pieceStage.id) ?? [];
    return entries
      .slice()
      .sort((left, right) => right.event_at.localeCompare(left.event_at))[0] ?? null;
  }

  function adjustedPausedSecondsForStage(
    pieceStage: ProductionPieceStage,
    entry: ProductionStageTimeEntry | null,
  ) {
    const entries = entriesByPieceStageId.get(pieceStage.id) ?? [];
    const closedEntries = entries.filter((item) => Number(item.paused_seconds_delta ?? 0) > 0);
    const closedSeconds = closedEntries.length
      ? closedEntries.reduce((sum, item) => {
          const endMs = Date.parse(item.event_at);
          const pausedSeconds = Math.max(0, Number(item.paused_seconds_delta ?? 0));
          const startMs = endMs - pausedSeconds * 1000;

          return (
            sum +
            calculateAdjustedPausedSeconds({
              startMs,
              endMs,
              pointingReasonId: item.pointing_reason_id,
              pauseReason: item.pause_reason,
              pointingReasons,
              pointingSettings,
            })
          );
        }, 0)
      : Number(pieceStage.total_paused_seconds ?? 0);

    if (
      !["pausada", "com_pendencia"].includes(pieceStage.status) ||
      !["pausar", "pendencia"].includes(pieceStage.last_action ?? "")
    ) {
      return closedSeconds;
    }

    const startMs = Date.parse(pieceStage.last_action_at ?? "");
    if (!Number.isFinite(startMs)) return closedSeconds;

    return (
      closedSeconds +
      calculateAdjustedPausedSeconds({
        startMs,
        endMs: nowMs,
        pointingReasonId: entry?.pointing_reason_id,
        pauseReason: entry?.pause_reason ?? pieceStage.blockers,
        pointingReasons,
        pointingSettings,
      })
    );
  }

  function operatorNameForPieceStage(
    pieceStage: ProductionPieceStage,
    entry: ProductionStageTimeEntry | null,
  ) {
    const operatorId = pieceStage.current_operator_id ?? entry?.operator_id ?? null;
    const operator = operatorId ? operatorById.get(operatorId) : null;
    return operator ? accentDisplayText(operator.name) : "";
  }

  function reasonForStage(pieceStage: ProductionPieceStage, entry: ProductionStageTimeEntry | null) {
    const reason = entry?.pause_reason ?? pieceStage.blockers ?? "";
    return accentDisplayText(reason).trim();
  }

  const activeActionReasonKind =
    activeAction === "pausar" ? "pausa" : activeAction === "pendencia" ? "pendencia" : null;
  const activeActionReasons = activeActionReasonKind
    ? activePointingReasons.filter((reason) => reason.kind === activeActionReasonKind)
    : [];
  const participantRegistrationList = useMemo(
    () =>
      Array.from(
        new Set(
          participantRegistrations
            .split(/[\s,;]+/)
            .map((registration) => registration.trim())
            .filter(Boolean),
        ),
      ),
    [participantRegistrations],
  );
  const participantsPreview = participantRegistrationList.map((registration) => {
    const operator = operators.find((item) => item.registration === registration);
    return operator
      ? `${registration} - ${accentDisplayText(operator.name)}`
      : `${registration} - não encontrado`;
  });
  const activeIndirectSessionsCount = indirectActivitySessions.filter(
    (session) => session.status === "em_andamento",
  ).length;

  if (!pointingStages.length) {
    return (
      <EmptyState
        icon={AlertTriangle}
        title="Nenhuma etapa de apontamento ativa"
        description="Mantenha ativas as etapas de Corte a Expedição para usar o apontamento de produção."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto border-b border-border">
        <div className="flex min-w-max gap-1">
          {pointingStages.map((stage) => {
            const count = pointingPieceStages.filter(
              (pieceStage) => {
                if (pieceStage.stage_id !== stage.id) return false;
                if (stage.sort_order === POINTING_STAGE_MAX_ORDER && isExpeditionArchived(pieceStage)) return false;
                if (pieceStage.status === "concluida") return false;
                if (!isPieceStageUnlocked(pieceStage, pointingPieceStages, pointingStages)) return false;
                if (rowIsReleased(pieceStage)) return true;
                return canReleaseProduction && pointingStages.findIndex((item) => item.id === stage.id) === 0;
              },
            ).length;
            const active = activePanel === "production" && resolvedActiveStageId === stage.id;

            return (
              <button
                key={stage.id}
                type="button"
                onClick={() => {
                  setActivePanel("production");
                  setActiveStageId(stage.id);
                  setSelectedIds(new Set());
                  setExpandedGroupIds(new Set());
                  setActiveAction(null);
                }}
                className={cn(
                  "border-b-2 px-4 py-3 text-sm font-medium transition",
                  active
                    ? "border-accent text-accent"
                    : "border-transparent text-muted-foreground hover:text-charcoal",
                )}
              >
                {stage.name}
                <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                  {count}
                </span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => {
              setActivePanel("indirect");
              setSelectedIds(new Set());
              setExpandedGroupIds(new Set());
              setActiveAction(null);
            }}
            className={cn(
              "border-b-2 px-4 py-3 text-sm font-medium transition",
              activePanel === "indirect"
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-charcoal",
            )}
          >
            Atividades indiretas
            <span className="ml-2 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              {activeIndirectSessionsCount}
            </span>
          </button>
        </div>
      </div>

      {activePanel === "indirect" ? (
        <IndirectActivitiesPanel
          reasons={indirectActivityReasons}
          sessions={indirectActivitySessions}
          operators={operators}
          nowMs={nowMs}
        />
      ) : isExpeditionStage ? (
        <>
        {canArchiveExpedition && (
          <ExpeditionArchivePanel
            clients={clients} contracts={contracts} prods={prods}
            activeRows={openRows} archivedRows={stageRows.filter(isExpeditionArchived)}
          />
        )}
        <ExpeditionLoadControlPanel
          clients={clients}
          contracts={contracts}
          prods={prods}
          pieces={pieces}
          stageRows={stageRows}
          openRows={openRows}
          canPerform={canPerform}
        />
        </>
      ) : (
        <>
      <div className="hidden flex-col gap-3 rounded-md border border-border bg-white p-3 md:flex lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="font-semibold text-charcoal">
            {selectedRows.length} peça(s) selecionada(s)
          </p>
          <p className="text-sm text-muted-foreground">
            Selecione peças da mesma etapa e confirme com matrícula e senha do operador.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={selectAllVisible}
            disabled={visibleOpenRows.length === 0}
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-charcoal transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
          >
            {visibleOpenRows.length > 0 &&
            visibleOpenRows.every((pieceStage) => selectedIds.has(pieceStage.id))
              ? "Limpar seleção"
              : "Selecionar visíveis"}
          </button>
          {operationalActions.map((action) => {
            const Icon = actionIcons[action];
            const allowed = action === "retornar" ? canRollback : canPerform;
            const disabled =
              !allowed ||
              selectedIds.size === 0 ||
              (action === "retornar" && !canRollbackActiveStage);
            return (
              <button
                key={action}
                type="button"
                disabled={disabled}
                onClick={() => setActiveAction(action)}
                className={cn(
                  "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50",
                  activeAction === action
                    ? "bg-charcoal text-white"
                    : "border border-border bg-white text-charcoal hover:bg-muted",
                )}
              >
                <Icon className="size-4" />
                {actionLabels[action]}
              </button>
            );
          })}
        </div>
      </div>

      {activeAction ? (
        <>
          <button
            type="button"
            aria-label="Cancelar apontamento"
            onClick={resetAction}
            className="fixed inset-0 z-40 bg-black/20 md:hidden"
          />
          <form
            action={formAction}
            className="rounded-md border border-accent bg-orange-50/50 p-4 shadow-2xl max-md:fixed max-md:inset-x-3 max-md:bottom-3 max-md:z-50 max-md:max-h-[calc(100dvh-1.5rem)] max-md:overflow-y-auto md:shadow-none"
          >
          <input type="hidden" name="action_type" value={activeAction} />
          <input type="hidden" name="piece_stage_ids_json" value={selectedJson} />
          <div className="mb-3 flex items-start justify-between gap-3">
            <div>
              <p className="font-semibold text-charcoal">
                Confirmar: {actionLabels[activeAction]} ({selectedRows.length} peça(s))
              </p>
              <p className="text-sm text-muted-foreground">
                O apontamento será vinculado ao operador informado abaixo.
              </p>
            </div>
            <button
              type="button"
              onClick={resetAction}
              className="inline-flex size-9 flex-none items-center justify-center rounded-md border border-border bg-white text-muted-foreground transition hover:bg-muted hover:text-charcoal"
              aria-label="Cancelar apontamento"
            >
              <X className="size-4" />
            </button>
          </div>
          {activeAction === "retornar" ? (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              A etapa anterior será reaberta com o tempo zerado, e as próximas etapas voltarão para a sequência normal.
            </div>
          ) : null}
          {activeAction === "concluir" && activeStageCanBeNotApplicable ? (
            <label className="mb-3 flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
              <input
                type="checkbox"
                name="stage_not_applicable"
                className="mt-1 size-4 rounded border-amber-300"
              />
              <span>
                <span className="flex items-center gap-2 font-semibold text-charcoal">
                  <Ban className="size-4 text-accent" />
                  Não possui {accentDisplayText(activeStage?.name ?? "esta etapa")}
                </span>
                <span className="mt-1 block text-xs text-amber-800">
                  Use esta opção quando a peça não passa por esta etapa. O sistema vai marcar a etapa
                  como não aplicável, zerar o tempo produtivo e liberar a próxima etapa.
                </span>
              </span>
            </label>
          ) : null}
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Matrícula">
              <input
                name="operator_registration"
                className={inputClass}
                autoComplete="off"
                inputMode="numeric"
                maxLength={3}
                pattern="[0-9]{3}"
                placeholder="000"
              />
            </Field>
            <Field label="Senha/PIN">
              <input
                name="operator_pin"
                type="password"
                className={inputClass}
                autoComplete="off"
                inputMode="numeric"
                maxLength={4}
                pattern="[0-9]{4}"
                placeholder="0000"
              />
            </Field>
          </div>
          {activeAction !== "retornar" ? (
            <Field label="Participantes de apoio" className="mt-3">
              <input
                name="participant_registrations"
                className={inputClass}
                value={participantRegistrations}
                onChange={(event) => setParticipantRegistrations(event.target.value)}
                autoComplete="off"
                inputMode="numeric"
                placeholder="Ex.: 158, 204, 311"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                Informe as matrículas de quem ajudou nesta execução, separadas por vírgula ou espaço.
              </span>
              {participantsPreview.length ? (
                <span className="mt-2 flex flex-wrap gap-1">
                  {participantsPreview.map((label) => (
                    <span
                      key={label}
                      className="rounded-full bg-white px-2 py-1 text-xs font-medium text-muted-foreground ring-1 ring-border"
                    >
                      {label}
                    </span>
                  ))}
                </span>
              ) : null}
            </Field>
          ) : null}
          {activeActionReasonKind ? (
            <Field
              label={activeAction === "pendencia" ? "Motivo da pendência" : "Motivo da pausa"}
              className="mt-3"
            >
              <select
                name="pointing_reason_id"
                className={inputClass}
                required
                disabled={activeActionReasons.length === 0}
              >
                <option value="">
                  {activeActionReasons.length
                    ? "Selecione"
                    : "Cadastre motivos em Configurações > Apontamentos"}
                </option>
                {activeActionReasons.map((reason) => (
                  <option key={reason.id} value={reason.id}>
                    {accentDisplayText(reason.label)}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
          {activeAction === "retornar" ? (
            <Field label="Motivo do retorno" className="mt-3">
              <textarea name="pause_reason" className={textareaClass} required />
            </Field>
          ) : null}
          <Field label="Observações" className="mt-3">
            <textarea name="notes" className={textareaClass} />
          </Field>
          <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
            <button
              type="submit"
              disabled={pending || Boolean(activeActionReasonKind && activeActionReasons.length === 0)}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
            >
              {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
              Registrar apontamento
            </button>
            {state.message ? (
              <p className={cn("text-sm font-medium", state.ok ? "text-success" : "text-danger")}>
                {state.message}
              </p>
            ) : null}
          </div>
          </form>
        </>
      ) : null}

      {editingTimeStage ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-3">
          <form
            action={timeFormAction}
            className="w-full max-w-xl rounded-md border border-border bg-white p-4 shadow-2xl"
          >
            <input type="hidden" name="piece_stage_id" value={editingTimeStage.id} />
            <input
              type="hidden"
              name="timezone_offset_minutes"
              value={timezoneOffsetMinutes}
            />
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-charcoal">Ajustar tempo produtivo</p>
                <p className="text-sm text-muted-foreground">
                  Informe o período real trabalhado e confirme com matrícula e senha do operador.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingTimeStage(null)}
                className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-charcoal"
                aria-label="Fechar ajuste de tempo"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <Field label="Horário inicial">
                <input
                  name="started_at"
                  type="datetime-local"
                  className={inputClass}
                  defaultValue={datetimeLocalValue(
                    editingTimeStage.started_at ??
                      (editingTimeStage.total_productive_seconds
                        ? nowMs - editingTimeStage.total_productive_seconds * 1000
                        : undefined),
                  )}
                  required
                />
              </Field>
              <Field label="Horário final">
                <input
                  name="finished_at"
                  type="datetime-local"
                  className={inputClass}
                  defaultValue={datetimeLocalValue(editingTimeStage.completed_at ?? nowMs)}
                  required
                />
              </Field>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <Field label="Matrícula">
                <input
                  name="operator_registration"
                  className={inputClass}
                  autoComplete="off"
                  inputMode="numeric"
                  maxLength={3}
                  pattern="[0-9]{3}"
                  placeholder="000"
                  required
                />
              </Field>
              <Field label="Senha/PIN">
                <input
                  name="operator_pin"
                  type="password"
                  className={inputClass}
                  autoComplete="off"
                  inputMode="numeric"
                  maxLength={4}
                  pattern="[0-9]{4}"
                  placeholder="0000"
                  required
                />
              </Field>
            </div>
            <Field label="Observações" className="mt-3">
              <textarea name="notes" className={textareaClass} />
            </Field>

            <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={timePending}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
              >
                {timePending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Pencil className="size-4" />
                )}
                Salvar ajuste
              </button>
              {timeState.message ? (
                <p
                  className={cn(
                    "text-sm font-medium",
                    timeState.ok ? "text-success" : "text-danger",
                  )}
                >
                  {timeState.message}
                </p>
              ) : null}
            </div>
          </form>
        </div>
      ) : null}

      {openRows.length === 0 ? (
        <EmptyState
          icon={CheckCircle2}
          title="Nada pendente nesta etapa"
          description="As peças desta etapa já foram concluídas ou ainda aguardam a conclusão da etapa anterior."
        />
      ) : (
        <div className="space-y-3">
          {groupedOpenRows.map((group) => {
            const expanded = expandedGroupIds.has(group.key);
            const selectedCount = group.rows.filter((row) => selectedIds.has(row.id)).length;
            const GroupIcon = expanded ? ChevronDown : ChevronRight;
            const prodId = group.key.split(":")[0] ?? "";
            const canRevertRelease =
              canReleaseProduction &&
              group.released &&
              activeStageIndex === 0 &&
              !prodIdsWithMovement.has(prodId);

            return (
              <section key={group.key} className="overflow-hidden rounded-md border border-border bg-white">
                <button
                  type="button"
                  onClick={() => {
                    if (!group.released) return;
                    toggleGroupExpanded(
                      group.key,
                      group.rows.map((row) => row.id),
                    );
                  }}
                  aria-expanded={expanded}
                  className="flex w-full flex-col gap-3 p-3 text-left transition hover:bg-muted/40 md:flex-row md:items-center md:justify-between"
                >
                  <span className="flex min-w-0 items-start gap-3">
                    <span className="mt-1 inline-flex size-7 flex-none items-center justify-center rounded-md border border-border bg-white text-muted-foreground">
                      <GroupIcon className="size-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-semibold leading-tight text-charcoal">
                        {group.clientName}
                      </span>
                      <span className="mt-1 block text-sm font-medium text-muted-foreground">
                        {group.contractLabel} · {group.prodLabel}
                      </span>
                      <span className="mt-1 block text-sm text-muted-foreground">
                        {group.workName}
                      </span>
                    </span>
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-xs font-semibold">
                    <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                      {group.rows.length} peça(s)
                    </span>
                    {!group.released ? (
                      <span className="rounded-full bg-amber-50 px-2 py-1 text-amber-800 ring-1 ring-amber-200">
                        Aguardando liberação
                      </span>
                    ) : null}
                    {selectedCount ? (
                      <span className="rounded-full bg-orange-50 px-2 py-1 text-accent ring-1 ring-orange-200">
                        {selectedCount} selecionada(s)
                      </span>
                    ) : null}
                  </span>
                </button>

                {canRevertRelease ? (
                  <div className="border-t border-border bg-amber-50/40 p-3">
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <p className="text-sm text-amber-900">
                        Este lote ainda não possui apontamentos. Se foi liberado por engano, ele pode voltar para aguardando liberação.
                      </p>
                      <RevertReleaseButton prodId={prodId} />
                    </div>
                  </div>
                ) : null}

                {!group.released ? (
                  <div className="border-t border-border bg-amber-50/40 p-3">
                    <p className="mb-3 text-sm text-amber-900">
                      Este lote ainda não aparece para os operadores. Libere para produção quando a gestão autorizar o início.
                    </p>
                    <ReleaseProductionButton
                      prodId={group.key.split(":")[0] ?? ""}
                      piecesCount={group.rows.length}
                    />
                  </div>
                ) : expanded ? (
                  <div className="space-y-2 border-t border-border p-3">
                    {group.rows.map((pieceStage) => {
                      const piece = pieceById.get(pieceStage.piece_id);
                      const entry = lastEntry(pieceStage);
                      const productiveSeconds = currentProductiveSeconds(pieceStage, nowMs);
                      const pausedSeconds = adjustedPausedSecondsForStage(pieceStage, entry);
                      const timerActive = pieceStage.status === "em_andamento";
                      const timerPaused = ["pausada", "com_pendencia"].includes(pieceStage.status);
                      const reason = reasonForStage(pieceStage, entry);
                      const timerOperatorName = operatorNameForPieceStage(pieceStage, entry);
                      const reasonLabel =
                        pieceStage.status === "com_pendencia"
                          ? "Motivo da pendência"
                          : pieceStage.status === "pausada"
                            ? "Motivo da pausa"
                            : null;

                      return (
                        <article
                          key={pieceStage.id}
                          className={cn(
                            "grid gap-3 rounded-md border bg-muted/20 p-3 transition md:grid-cols-[auto_1fr] lg:grid-cols-[auto_1fr_auto]",
                            selectedIds.has(pieceStage.id)
                              ? "border-accent shadow-sm"
                              : "border-border hover:border-accent/50",
                          )}
                        >
                          <label className="hidden items-start md:flex">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(pieceStage.id)}
                              onChange={() => toggleSelected(pieceStage.id)}
                              className="mt-1 size-5 rounded border-border"
                            />
                          </label>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-base font-semibold text-charcoal">
                                {piece?.piece_code ?? "Peça"}
                              </p>
                              <StatusBadge status={pieceStage.status} type="stage" />
                              {timerActive || timerPaused ? (
                                <span
                                  className={cn(
                                    "rounded-full px-2 py-0.5 text-xs font-semibold ring-1",
                                    timerActive
                                      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                                      : "bg-amber-50 text-amber-700 ring-amber-200",
                                  )}
                                >
                                  {timerActive ? "Cronômetro" : "Pausado"}:{" "}
                                  {formatDurationClock(timerActive ? productiveSeconds : pausedSeconds)}
                                </span>
                              ) : null}
                              {(timerActive || timerPaused) && timerOperatorName ? (
                                <span className="rounded-full bg-slate-50 px-2 py-0.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200">
                                  Operador: {timerOperatorName}
                                </span>
                              ) : null}
                            </div>
                            <p className="text-sm text-muted-foreground">
                              {piece?.system_description ?? "Descrição não informada"}
                            </p>
                            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>Local: {piece?.location ?? "Não informado"}</span>
                              <span>Qtd.: {piece?.quantity ?? 1}</span>
                              <span>L: {piece?.width_mm ?? "-"} mm</span>
                              <span>H: {piece?.height_mm ?? "-"} mm</span>
                              <span>
                                Tempo produtivo: {formatDurationClock(productiveSeconds)}
                              </span>
                              <span>Tempo parado: {formatDurationClock(pausedSeconds)}</span>
                            </div>
                            {entry ? (
                              <p className="mt-1 text-xs text-muted-foreground">
                                Última ação: {actionLabels[entry.action]} ·{" "}
                                {stageStatusLabels[pieceStage.status]}
                              </p>
                            ) : null}
                            {reason && reasonLabel ? (
                              <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                                {reasonLabel}: {reason}
                              </p>
                            ) : null}
                            <div className="mt-3 grid grid-cols-2 gap-2 md:hidden">
                              {availableActionsForPieceStage(pieceStage).map((action) => {
                                const Icon = actionIcons[action];
                                return (
                                  <button
                                    key={action}
                                    type="button"
                                    onClick={() => startSinglePieceAction(pieceStage.id, action)}
                                    className={cn(
                                      "inline-flex min-h-10 items-center justify-center gap-2 rounded-md px-3 py-2 text-sm font-semibold transition",
                                      action === "iniciar" || action === "retomar"
                                        ? "bg-accent text-accent-foreground hover:bg-orange-500"
                                        : "border border-border bg-white text-charcoal hover:bg-muted",
                                    )}
                                  >
                                    <Icon className="size-4" />
                                    {actionLabels[action]}
                                  </button>
                                );
                              })}
                              {canAdjustTime ? (
                                <button
                                  type="button"
                                  onClick={() => openTimeEditor(pieceStage)}
                                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-charcoal transition hover:bg-muted"
                                >
                                  <Pencil className="size-4" />
                                  Ajustar tempo
                                </button>
                              ) : null}
                            </div>
                          </div>
                          <div className="space-y-2 text-sm font-semibold text-charcoal lg:text-right">
                            <p>{piece?.system_code ?? "Sistema não informado"}</p>
                            {canAdjustTime ? (
                              <button
                                type="button"
                                onClick={() => openTimeEditor(pieceStage)}
                                className="hidden min-h-9 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-xs font-semibold text-charcoal transition hover:bg-muted md:inline-flex"
                              >
                                <Pencil className="size-3.5" />
                                Ajustar tempo
                              </button>
                            ) : null}
                          </div>
                        </article>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      )}
        </>
      )}
    </div>
  );
}
