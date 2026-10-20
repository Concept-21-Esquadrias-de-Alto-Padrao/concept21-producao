"use client";

import { FloatingMessage } from "@/components/floating-feedback";

import { ActionFeedback } from "@/components/floating-feedback";

import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Loader2,
  Pencil,
  RotateCcw,
  Save,
  Trash2,
  UploadCloud,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useMemo, useState } from "react";
import {
  adjustProductionPieceStageTimeAction,
  deleteProdPieceAction,
  importProdPiecesAction,
  registerPieceReworkAction,
  releasePieceReworkAction,
  releaseProdPiecesToProductionAction,
  revertProdPiecesReleaseAction,
  saveManualProdPieceAction,
  updateProdPieceAction,
} from "@/app/actions";
import { Field, inputClass, textareaClass } from "@/components/action-form";
import { StatusBadge } from "@/components/badges";
import { useServerSyncedNow } from "@/hooks/use-server-synced-now";
import { reworkStatusLabels, stageStatusLabels } from "@/lib/labels";
import {
  POINTING_STAGE_MAX_ORDER,
  currentProductiveSeconds,
  formatDurationClock,
  getPointingStages,
  isPieceStageDone,
} from "@/lib/pointing";
import type {
  PointingAction,
  ProductionPiece,
  ProductionPieceImport,
  ProductionPieceRework,
  ProductionPieceStage,
  ProductionPointingSession,
  ProductionPointingSessionParticipant,
  ProductionOperator,
  ProductionReworkReason,
  ProductionStage,
  ProductionStageTimeEntry,
} from "@/lib/types";
import { accentDisplayText, cn, formatDate, formatDateTime } from "@/lib/utils";

type ActionState = {
  ok: boolean;
  message: string;
};

type PreviewPiece = {
  piece_code: string;
  system_code: string | null;
  system_description: string | null;
  quantity: number;
  width_mm: number | null;
  height_mm: number | null;
  measure_a: number | null;
  measure_b: number | null;
  location: string | null;
  area_m2: number;
  unit_weight_kg: number;
  total_weight_kg: number;
  sort_order: number;
  duplicate_of_existing?: boolean;
};

type PreviewResult = {
  fileName: string;
  metadata: {
    client: string | null;
    work: string | null;
    address: string | null;
    city_state: string | null;
    treatment: string | null;
    pages: number;
  };
  totals: {
    quantity: number | null;
    area_m2: number | null;
    weight_kg: number | null;
  };
  pieces: PreviewPiece[];
  duplicatePieceCodes?: string[];
  warnings: string[];
};

const initialState: ActionState = {
  ok: false,
  message: "",
};

const editableStageStatuses = [
  "nao_iniciada",
  "aguardando",
  "em_andamento",
  "pausada",
  "com_pendencia",
  "concluida",
  "nao_aplicavel",
];

const pointingActionLabels: Record<PointingAction, string> = {
  iniciar: "Início",
  pausar: "Pausa",
  retomar: "Retomada",
  concluir: "Conclusão",
  pendencia: "Pendência",
  nao_aplicavel: "Não aplicável",
  retornar: "Retorno de etapa",
  ajuste_tempo: "Ajuste de tempo",
};

function numberLabel(value: number | null | undefined, digits = 2) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function summarizePieces<
  T extends {
    quantity: number | null;
    area_m2: number | null;
    total_weight_kg: number | null;
  },
>(items: T[]) {
  return {
    itemCount: items.length,
    quantity: items.reduce((sum, piece) => sum + Number(piece.quantity ?? 0), 0),
    areaM2: items.reduce((sum, piece) => sum + Number(piece.area_m2 ?? 0), 0),
    weightKg: items.reduce((sum, piece) => sum + Number(piece.total_weight_kg ?? 0), 0),
  };
}

function normalizedPieceCode(value: string | null | undefined) {
  return (value ?? "").trim();
}

function previewNumberInputValue(value: number | null | undefined) {
  return value ?? "";
}

function previewNumberFromInput(value: string) {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function calculatedPreviewArea(piece: PreviewPiece) {
  const quantity = Number(piece.quantity ?? 0);
  const width = Number(piece.width_mm ?? 0);
  const height = Number(piece.height_mm ?? 0);

  if (
    !Number.isFinite(quantity) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    quantity <= 0 ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }

  return Number(((quantity * width * height) / 1_000_000).toFixed(3));
}

function datetimeLocalValue(value: string | number | Date | null | undefined) {
  const date = value ? new Date(value) : new Date();
  if (!Number.isFinite(date.getTime())) return "";
  const pad = (part: number) => String(part).padStart(2, "0");

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`;
}

function ActionMessage({ state }: { state: ActionState }) {
  return <ActionFeedback state={state} />;
}

function DeletePieceButton({ prodId, pieceId }: { prodId: string; pieceId: string }) {
  const [state, formAction, pending] = useActionState(deleteProdPieceAction, initialState);

  return (
    <form action={formAction} className="flex items-center gap-2">
      <input type="hidden" name="prod_id" value={prodId} />
      <input type="hidden" name="piece_id" value={pieceId} />
      <button
        type="submit"
        disabled={pending}
        className="inline-flex size-9 items-center justify-center rounded-md border border-red-200 bg-white text-red-700 transition hover:bg-red-50 disabled:opacity-60"
        title="Excluir peça"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function ReleaseProdPiecesButton({ prodId, count }: { prodId: string; count: number }) {
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
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <CheckCircle2 className="size-4" />}
        Liberar {count} peça(s) para produção
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function RevertProdPiecesReleaseButton({ prodId, count }: { prodId: string; count: number }) {
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
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-amber-300 bg-white px-4 py-2 text-sm font-semibold text-amber-900 transition hover:bg-amber-50 disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <RotateCcw className="size-4" />}
        Estornar liberação de {count} peça(s)
      </button>
      <ActionMessage state={state} />
    </form>
  );
}

function ManualPieceForm({ prodId }: { prodId: string }) {
  const [state, formAction, pending] = useActionState(saveManualProdPieceAction, initialState);

  return (
    <section className="rounded-md border border-border bg-white p-4">
      <div className="mb-3 flex items-center gap-2 font-semibold text-charcoal">
        <Save className="size-4 text-accent" />
        Cadastrar peça manualmente
      </div>
      <form action={formAction} className="space-y-3">
        <input type="hidden" name="prod_id" value={prodId} />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Código da peça">
            <input name="piece_code" className={inputClass} required />
          </Field>
          <Field label="Sistema">
            <input name="system_code" className={inputClass} />
          </Field>
          <Field label="Quantidade">
            <input
              name="quantity"
              type="number"
              min={1}
              defaultValue={1}
              className={inputClass}
              required
            />
          </Field>
        </div>
        <Field label="Descrição do sistema">
          <textarea name="system_description" className={textareaClass} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Localização">
            <input name="location" className={inputClass} />
          </Field>
          <Field label="Largura (mm)">
            <input name="width_mm" type="number" min={0} step="0.01" className={inputClass} />
          </Field>
          <Field label="Altura (mm)">
            <input name="height_mm" type="number" min={0} step="0.01" className={inputClass} />
          </Field>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Área (m²)">
            <input name="area_m2" type="number" min={0} step="0.001" className={inputClass} />
          </Field>
          <Field label="Peso unitário (kg)">
            <input
              name="unit_weight_kg"
              type="number"
              min={0}
              step="0.001"
              className={inputClass}
            />
          </Field>
          <Field label="Peso total (kg)">
            <input
              name="total_weight_kg"
              type="number"
              min={0}
              step="0.001"
              className={inputClass}
            />
          </Field>
        </div>
        <Field label="Observações">
          <textarea name="notes" className={textareaClass} />
        </Field>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            Salvar peça
          </button>
          <ActionMessage state={state} />
        </div>
      </form>
    </section>
  );
}

type PieceStageDetail = {
  stage: ProductionStage;
  pieceStage: ProductionPieceStage | null;
  productiveSeconds: number;
  operators: string[];
  events: PieceStageEvent[];
};

type PieceStageEvent = {
  id: string;
  label: string;
  eventAt: string;
  operatorName: string;
  participantNames: string[];
  productiveSeconds: number;
  pausedSeconds: number;
  notes: string;
  reason: string;
};

function PieceReworkModal({
  prodId,
  piece,
  stages,
  reworkReasons,
  reworks,
  canManage,
  onClose,
}: {
  prodId: string;
  piece: ProductionPiece;
  stages: ProductionStage[];
  reworkReasons: ProductionReworkReason[];
  reworks: ProductionPieceRework[];
  canManage: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(registerPieceReworkAction, initialState);
  const [releaseState, releaseFormAction, releasePending] = useActionState(
    releasePieceReworkAction,
    initialState,
  );
  const reasons = reworkReasons
    .filter((reason) => reason.active && reason.kind === "motivo")
    .sort((left, right) => left.sort_order - right.sort_order || left.label.localeCompare(right.label, "pt-BR"));
  const origins = reworkReasons
    .filter((reason) => reason.active && reason.kind === "origem")
    .sort((left, right) => left.sort_order - right.sort_order || left.label.localeCompare(right.label, "pt-BR"));
  const pointingStages = getPointingStages(stages);
  const openReworks = reworks.filter((rework) => rework.status !== "concluido");

  useEffect(() => {
    if (!state.ok && !releaseState.ok) return;
    const timeout = window.setTimeout(() => router.refresh(), 0);
    return () => window.clearTimeout(timeout);
  }, [router, releaseState.ok, state.ok]);

  function reasonLabel(id: string | null) {
    if (!id) return "Não informado";
    return accentDisplayText(reworkReasons.find((reason) => reason.id === id)?.label ?? "Não informado");
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-3">
      <div className="w-full max-w-5xl rounded-md border border-border bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="text-base font-semibold text-charcoal">Retrabalho da peça</p>
            <p className="text-sm text-muted-foreground">
              {piece.piece_code} · {piece.system_code ?? "Sistema não informado"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-charcoal"
            aria-label="Fechar retrabalho"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="max-h-[82dvh] space-y-4 overflow-y-auto p-4">
          <section className="rounded-md border border-border bg-muted/20 p-3">
            <p className="font-semibold text-charcoal">Registros da peça</p>
            {reworks.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">
                Nenhum retrabalho registrado para esta peça.
              </p>
            ) : (
              <div className="mt-3 space-y-2">
                {reworks.map((rework) => (
                  <article key={rework.id} className="rounded-md border border-border bg-white p-3">
                    <div className="flex flex-col gap-2 md:flex-row md:items-start md:justify-between">
                      <div>
                        <p className="font-semibold text-charcoal">
                          {reasonLabel(rework.reason_id)} · {reasonLabel(rework.origin_id)}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          {reworkStatusLabels[rework.status]} · Retorno em {formatDate(rework.returned_at)}
                        </p>
                        {rework.description ? (
                          <p className="mt-2 text-sm text-muted-foreground">
                            {accentDisplayText(rework.description)}
                          </p>
                        ) : null}
                        {rework.technical_guidance ? (
                          <p className="mt-2 rounded-md border border-blue-200 bg-blue-50 px-2 py-1 text-xs text-blue-900">
                            Técnica: {accentDisplayText(rework.technical_guidance)}
                          </p>
                        ) : null}
                        {rework.material_notes ? (
                          <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs text-amber-900">
                            Material: {accentDisplayText(rework.material_notes)}
                          </p>
                        ) : null}
                      </div>
                      <StatusBadge status={reworkStatusLabels[rework.status]} type="plain" />
                    </div>
                    {canManage &&
                    ["em_analise_tecnica", "aguardando_material", "registrado"].includes(
                      rework.status,
                    ) ? (
                      <form action={releaseFormAction} className="mt-3 grid gap-3 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-3">
                        <input type="hidden" name="rework_id" value={rework.id} />
                        <Field label="Etapa de retorno">
                          <select
                            name="target_stage_id"
                            className={inputClass}
                            defaultValue={rework.target_stage_id ?? ""}
                            required
                          >
                            <option value="">Selecione</option>
                            {pointingStages.map((stage) => (
                              <option key={stage.id} value={stage.id}>
                                {accentDisplayText(stage.name)}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Orientação técnica">
                          <input
                            name="technical_guidance"
                            className={inputClass}
                            defaultValue={rework.technical_guidance ?? ""}
                          />
                        </Field>
                        <Field label="Observação de material">
                          <input
                            name="material_notes"
                            className={inputClass}
                            defaultValue={rework.material_notes ?? ""}
                          />
                        </Field>
                        <div className="md:col-span-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                          <button
                            type="submit"
                            disabled={releasePending}
                            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
                          >
                            {releasePending ? (
                              <Loader2 className="size-4 animate-spin" />
                            ) : (
                              <CheckCircle2 className="size-4" />
                            )}
                            Liberar retrabalho
                          </button>
                          <ActionMessage state={releaseState} />
                        </div>
                      </form>
                    ) : null}
                  </article>
                ))}
              </div>
            )}
          </section>

          {canManage ? (
            <form action={formAction} className="space-y-3 rounded-md border border-border bg-white p-3">
              <input type="hidden" name="prod_id" value={prodId} />
              <input type="hidden" name="piece_id" value={piece.id} />
              <div className="flex items-center gap-2 font-semibold text-charcoal">
                <RotateCcw className="size-4 text-accent" />
                Registrar novo retrabalho
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <Field label="Motivo">
                  <select name="reason_id" className={inputClass} required>
                    <option value="">Selecione</option>
                    {reasons.map((reason) => (
                      <option key={reason.id} value={reason.id}>
                        {accentDisplayText(reason.label)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Origem">
                  <select name="origin_id" className={inputClass} required>
                    <option value="">Selecione</option>
                    {origins.map((origin) => (
                      <option key={origin.id} value={origin.id}>
                        {accentDisplayText(origin.label)}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Data do retorno">
                  <input
                    name="returned_at"
                    type="date"
                    className={inputClass}
                    defaultValue={new Date().toISOString().slice(0, 10)}
                    required
                  />
                </Field>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Prioridade">
                  <select name="priority" className={inputClass} defaultValue="normal">
                    <option value="baixa">Baixa</option>
                    <option value="normal">Normal</option>
                    <option value="alta">Alta</option>
                    <option value="urgente">Urgente</option>
                  </select>
                </Field>
                <Field label="Etapa de retorno">
                  <select name="target_stage_id" className={inputClass}>
                    <option value="">Definir depois</option>
                    {pointingStages.map((stage) => (
                      <option key={stage.id} value={stage.id}>
                        {accentDisplayText(stage.name)}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <label className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm font-semibold text-charcoal">
                  <input type="checkbox" name="needs_technical_info" className="size-4 rounded border-border" />
                  Precisa de análise técnica
                </label>
                <label className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-muted/20 px-3 py-2 text-sm font-semibold text-charcoal">
                  <input type="checkbox" name="needs_material_purchase" className="size-4 rounded border-border" />
                  Precisa de compra de material
                </label>
              </div>
              <Field label="Descrição do retrabalho">
                <textarea name="description" className={textareaClass} required />
              </Field>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label="Orientação técnica">
                  <textarea name="technical_guidance" className={textareaClass} />
                </Field>
                <Field label="Observação de material">
                  <textarea name="material_notes" className={textareaClass} />
                </Field>
              </div>
              {openReworks.length ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  Já existe retrabalho aberto para esta peça. Registre outro apenas se for uma nova ocorrência.
                </div>
              ) : null}
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  disabled={pending}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Registrar retrabalho
                </button>
                <ActionMessage state={state} />
              </div>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function StageOperatorHistory({ detail }: { detail: PieceStageDetail }) {
  return (
    <div className="mt-2 space-y-2 text-xs">
      <p className="text-muted-foreground">
        <span className="font-semibold text-charcoal">Operador(es): </span>
        {detail.operators.length ? detail.operators.join(", ") : "Sem apontamento registrado"}
      </p>

      {detail.events.length ? (
        <details className="rounded-md border border-border bg-muted/20">
          <summary className="cursor-pointer px-2 py-1 font-semibold text-charcoal">
            Histórico da etapa ({detail.events.length})
          </summary>
          <div className="space-y-2 border-t border-border p-2">
            {detail.events.map((event) => (
              <div key={event.id} className="rounded-md bg-white p-2">
                <p className="font-semibold text-charcoal">
                  {event.label} · {formatDateTime(event.eventAt)}
                </p>
                <p className="text-muted-foreground">
                  Responsável: {event.operatorName}
                  {event.participantNames.length
                    ? ` · Participante(s): ${event.participantNames.join(", ")}`
                    : ""}
                </p>
                {event.productiveSeconds > 0 ? (
                  <p className="text-muted-foreground">
                    Tempo produtivo: {formatDurationClock(event.productiveSeconds)}
                  </p>
                ) : null}
                {event.pausedSeconds > 0 ? (
                  <p className="text-muted-foreground">
                    Tempo parado: {formatDurationClock(event.pausedSeconds)}
                  </p>
                ) : null}
                {event.reason ? (
                  <p className="mt-1 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 font-medium text-amber-800">
                    Motivo: {event.reason}
                  </p>
                ) : null}
                {event.notes ? (
                  <p className="mt-1 text-muted-foreground">Observação: {event.notes}</p>
                ) : null}
              </div>
            ))}
          </div>
        </details>
      ) : null}
    </div>
  );
}

function PieceReviewModal({
  mode,
  prodId,
  piece,
  stageDetails,
  canEditPiece,
  canUpdateStages,
  canAdjustTime,
  nowMs,
  onClose,
}: {
  mode: "view" | "edit";
  prodId: string;
  piece: ProductionPiece;
  stageDetails: PieceStageDetail[];
  canEditPiece: boolean;
  canUpdateStages: boolean;
  canAdjustTime: boolean;
  nowMs: number;
  onClose: () => void;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState(updateProdPieceAction, initialState);
  const [timeState, timeFormAction, timePending] = useActionState(
    adjustProductionPieceStageTimeAction,
    initialState,
  );
  const [editingTimeStage, setEditingTimeStage] = useState<ProductionPieceStage | null>(null);
  const [timezoneOffsetMinutes, setTimezoneOffsetMinutes] = useState(0);
  const title = mode === "edit" ? "Editar peça" : "Visualizar peça";
  const readonly = mode === "view" || !canEditPiece;

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

  const fields = (
    <>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Código da peça">
          <input
            name="piece_code"
            className={inputClass}
            defaultValue={piece.piece_code}
            readOnly={readonly}
            required
          />
        </Field>
        <Field label="Sistema">
          <input
            name="system_code"
            className={inputClass}
            defaultValue={piece.system_code ?? ""}
            readOnly={readonly}
          />
        </Field>
        <Field label="Quantidade">
          <input
            name="quantity"
            type="number"
            min={1}
            className={inputClass}
            defaultValue={piece.quantity}
            readOnly={readonly}
            required
          />
        </Field>
      </div>
      <Field label="Descrição do sistema">
        <textarea
          name="system_description"
          className={textareaClass}
          defaultValue={piece.system_description ?? ""}
          readOnly={readonly}
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Localização">
          <input
            name="location"
            className={inputClass}
            defaultValue={piece.location ?? ""}
            readOnly={readonly}
          />
        </Field>
        <Field label="Largura (mm)">
          <input
            name="width_mm"
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            defaultValue={piece.width_mm ?? ""}
            readOnly={readonly}
          />
        </Field>
        <Field label="Altura (mm)">
          <input
            name="height_mm"
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            defaultValue={piece.height_mm ?? ""}
            readOnly={readonly}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Área (m²)">
          <input
            name="area_m2"
            type="number"
            min={0}
            step="0.001"
            className={inputClass}
            defaultValue={piece.area_m2}
            readOnly={readonly}
          />
        </Field>
        <Field label="Peso unitário (kg)">
          <input
            name="unit_weight_kg"
            type="number"
            min={0}
            step="0.001"
            className={inputClass}
            defaultValue={piece.unit_weight_kg}
            readOnly={readonly}
          />
        </Field>
        <Field label="Peso total (kg)">
          <input
            name="total_weight_kg"
            type="number"
            min={0}
            step="0.001"
            className={inputClass}
            defaultValue={piece.total_weight_kg}
            readOnly={readonly}
          />
        </Field>
      </div>
      <Field label="Observações">
        <textarea
          name="notes"
          className={textareaClass}
          defaultValue={piece.notes ?? ""}
          readOnly={readonly}
        />
      </Field>
    </>
  );

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-3">
      <div className="w-full max-w-4xl rounded-md border border-border bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <p className="text-base font-semibold text-charcoal">{title}</p>
            <p className="text-sm text-muted-foreground">
              {piece.piece_code} · {piece.system_code ?? "Sistema não informado"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex size-9 items-center justify-center rounded-md border border-border text-muted-foreground transition hover:bg-muted hover:text-charcoal"
            aria-label="Fechar"
          >
            <X className="size-4" />
          </button>
        </div>

        {mode === "edit" ? (
          <form action={formAction} className="max-h-[80dvh] space-y-4 overflow-y-auto p-4">
            <input type="hidden" name="prod_id" value={prodId} />
            <input type="hidden" name="piece_id" value={piece.id} />
            <input type="hidden" name="sort_order" value={piece.sort_order} />
            {fields}

            {canUpdateStages ? (
              <section className="rounded-md border border-border bg-muted/20 p-3">
                <p className="font-semibold text-charcoal">Etapas da peça</p>
                <p className="text-sm text-muted-foreground">
                  Alterações aqui atualizam a mesma fila usada nos apontamentos.
                </p>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  {stageDetails.map((detail) => {
                    const { stage, pieceStage, productiveSeconds } = detail;
                    if (!pieceStage) return null;

                    return (
                      <div
                        key={pieceStage.id}
                        className="rounded-md border border-border bg-white p-3"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <p className="font-semibold text-charcoal">{stage.name}</p>
                            <p className="text-xs text-muted-foreground">
                              Tempo produtivo: {formatDurationClock(productiveSeconds)}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-2">
                            <StatusBadge status={pieceStage.status} type="stage" />
                            {canAdjustTime && stage.sort_order !== POINTING_STAGE_MAX_ORDER ? (
                              <button
                                type="button"
                                onClick={() => openTimeEditor(pieceStage)}
                                className="inline-flex min-h-8 items-center justify-center gap-2 rounded-md border border-border bg-white px-2 py-1 text-xs font-semibold text-charcoal transition hover:bg-muted"
                              >
                                <Pencil className="size-3.5" />
                                Ajustar tempo
                              </button>
                            ) : null}
                          </div>
                        </div>
                        <StageOperatorHistory detail={detail} />
                        <Field label="Status" className="mt-3">
                          <select
                            name="piece_stage_status"
                            className={inputClass}
                            defaultValue={`${pieceStage.id}:${pieceStage.status}`}
                          >
                            {editableStageStatuses.map((status) => (
                              <option key={status} value={`${pieceStage.id}:${status}`}>
                                {stageStatusLabels[status as keyof typeof stageStatusLabels]}
                              </option>
                            ))}
                          </select>
                        </Field>
                        <Field label="Pendência" className="mt-3">
                          <textarea
                            name={`stage_blockers_${pieceStage.id}`}
                            className={textareaClass}
                            defaultValue={pieceStage.blockers ?? ""}
                          />
                        </Field>
                        <Field label="Observações da etapa" className="mt-3">
                          <textarea
                            name={`stage_notes_${pieceStage.id}`}
                            className={textareaClass}
                            defaultValue={pieceStage.notes ?? ""}
                          />
                        </Field>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <button
                type="submit"
                disabled={pending}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
              >
                {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Salvar alterações
              </button>
              <ActionMessage state={state} />
            </div>
          </form>
        ) : (
          <div className="max-h-[80dvh] space-y-4 overflow-y-auto p-4">
            {fields}
            <section className="rounded-md border border-border bg-muted/20 p-3">
              <p className="font-semibold text-charcoal">Etapas da peça</p>
              <div className="mt-3 grid gap-2 lg:grid-cols-2">
                {stageDetails.map((detail) => {
                  const { stage, pieceStage, productiveSeconds } = detail;

                  return (
                  <div key={stage.id} className="rounded-md border border-border bg-white p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-charcoal">{stage.name}</p>
                        <p className="text-xs text-muted-foreground">
                          Tempo produtivo: {formatDurationClock(productiveSeconds)}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-2">
                        {pieceStage ? <StatusBadge status={pieceStage.status} type="stage" /> : null}
                        {pieceStage && canAdjustTime && stage.sort_order !== POINTING_STAGE_MAX_ORDER ? (
                          <button
                            type="button"
                            onClick={() => openTimeEditor(pieceStage)}
                            className="inline-flex min-h-8 items-center justify-center gap-2 rounded-md border border-border bg-white px-2 py-1 text-xs font-semibold text-charcoal transition hover:bg-muted"
                          >
                            <Pencil className="size-3.5" />
                            Ajustar tempo
                          </button>
                        ) : null}
                      </div>
                    </div>
                    {pieceStage?.blockers ? (
                      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                        Pendência: {accentDisplayText(pieceStage.blockers)}
                      </p>
                    ) : null}
                    <StageOperatorHistory detail={detail} />
                  </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}
      </div>

      {editingTimeStage ? (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/30 p-3">
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
              <ActionMessage state={timeState} />
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}

export function ProdPiecesPanel({
  prodId,
  stages,
  serverNowIso,
  pieces,
  imports,
  pieceStages,
  operators,
  pointingSessions,
  pointingSessionParticipants,
  stageTimeEntries,
  reworkReasons,
  pieceReworks,
  canImport,
  canManage,
  canReleaseProduction,
  canViewRework,
  canManageRework,
  canUpdateStages,
  canAdjustTime,
}: {
  prodId: string;
  stages: ProductionStage[];
  serverNowIso: string;
  pieces: ProductionPiece[];
  imports: ProductionPieceImport[];
  pieceStages: ProductionPieceStage[];
  operators: ProductionOperator[];
  pointingSessions: ProductionPointingSession[];
  pointingSessionParticipants: ProductionPointingSessionParticipant[];
  stageTimeEntries: ProductionStageTimeEntry[];
  reworkReasons: ProductionReworkReason[];
  pieceReworks: ProductionPieceRework[];
  canImport: boolean;
  canManage: boolean;
  canReleaseProduction: boolean;
  canViewRework: boolean;
  canManageRework: boolean;
  canUpdateStages: boolean;
  canAdjustTime: boolean;
}) {
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [reviewingPiece, setReviewingPiece] = useState<ProductionPiece | null>(null);
  const [editingPiece, setEditingPiece] = useState<ProductionPiece | null>(null);
  const [reworkingPiece, setReworkingPiece] = useState<ProductionPiece | null>(null);
  const nowMs = useServerSyncedNow(serverNowIso);
  const [state, formAction, pending] = useActionState(importProdPiecesAction, initialState);
  const pointingStages = useMemo(() => getPointingStages(stages), [stages]);
  const pointingStageIds = useMemo(
    () => new Set(pointingStages.map((stage) => stage.id)),
    [pointingStages],
  );
  const operatorById = useMemo(
    () => new Map(operators.map((operator) => [operator.id, operator])),
    [operators],
  );
  const sessionById = useMemo(
    () => new Map(pointingSessions.map((session) => [session.id, session])),
    [pointingSessions],
  );
  const participantIdsBySession = useMemo(() => {
    const participantMap = new Map<string, string[]>();

    for (const participant of pointingSessionParticipants) {
      const sessionParticipants = participantMap.get(participant.pointing_session_id) ?? [];
      sessionParticipants.push(participant.operator_id);
      participantMap.set(participant.pointing_session_id, sessionParticipants);
    }

    return participantMap;
  }, [pointingSessionParticipants]);
  const timeEntriesByPieceStage = useMemo(() => {
    const entryMap = new Map<string, ProductionStageTimeEntry[]>();

    for (const entry of stageTimeEntries) {
      const key = `${entry.piece_id}:${entry.stage_id}`;
      const entries = entryMap.get(key) ?? [];
      entries.push(entry);
      entryMap.set(key, entries);
    }

    return entryMap;
  }, [stageTimeEntries]);
  const totals = useMemo(() => summarizePieces(pieces), [pieces]);
  const previewTotals = useMemo(() => (preview ? summarizePieces(preview.pieces) : null), [preview]);
  const existingPieceCodeSet = useMemo(
    () => new Set(pieces.map((piece) => normalizedPieceCode(piece.piece_code)).filter(Boolean)),
    [pieces],
  );
  const previewPieceCodeCounts = useMemo(() => {
    const counts = new Map<string, number>();

    if (!preview) return counts;

    for (const piece of preview.pieces) {
      const code = normalizedPieceCode(piece.piece_code);
      if (!code) continue;
      counts.set(code, (counts.get(code) ?? 0) + 1);
    }

    return counts;
  }, [preview]);
  const previewDuplicateCount = useMemo(
    () =>
      preview
        ? preview.pieces.filter((piece) => existingPieceCodeSet.has(normalizedPieceCode(piece.piece_code))).length
        : 0,
    [existingPieceCodeSet, preview],
  );
  const previewRepeatedCount = useMemo(
    () =>
      preview
        ? preview.pieces.filter(
            (piece) => (previewPieceCodeCounts.get(normalizedPieceCode(piece.piece_code)) ?? 0) > 1,
          ).length
        : 0,
    [preview, previewPieceCodeCounts],
  );
  const previewImportableCount = useMemo(
    () =>
      preview
        ? preview.pieces.filter((piece) => {
            const code = normalizedPieceCode(piece.piece_code);
            return (
              code &&
              !existingPieceCodeSet.has(code) &&
              (previewPieceCodeCounts.get(code) ?? 0) === 1
            );
          }).length
        : 0,
    [existingPieceCodeSet, preview, previewPieceCodeCounts],
  );
  const lastImport = imports[0] ?? null;
  const canEditPiece = canImport || canManage;
  const unreleasedPieces = useMemo(
    () => pieces.filter((piece) => !piece.released_to_production),
    [pieces],
  );
  const releasedPieces = useMemo(
    () => pieces.filter((piece) => piece.released_to_production),
    [pieces],
  );
  const releasedPieceIds = useMemo(
    () => new Set(releasedPieces.map((piece) => piece.id)),
    [releasedPieces],
  );
  const releasedPiecesHaveMovement = useMemo(
    () =>
      stageTimeEntries.some(
        (entry) => entry.prod_id === prodId && releasedPieceIds.has(entry.piece_id),
      ) ||
      pieceStages.some(
        (stage) =>
          releasedPieceIds.has(stage.piece_id) &&
          !["nao_iniciada", "aguardando"].includes(stage.status),
      ),
    [pieceStages, prodId, releasedPieceIds, stageTimeEntries],
  );

  async function uploadPreview(file: File | null) {
    setPreview(null);
    setPreviewError(null);

    if (!file) return;

    setLoadingPreview(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/prods/${prodId}/pieces/preview`, {
        method: "POST",
        body: formData,
      });
      const data = (await response.json().catch(() => ({}))) as PreviewResult & { error?: string };

      if (!response.ok) {
        throw new Error(data.error ?? "Não foi possível ler o PDF.");
      }

      setPreview(data);
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : "Não foi possível ler o PDF.");
    } finally {
      setLoadingPreview(false);
    }
  }

  function updatePreviewPiece(index: number, values: Partial<PreviewPiece>) {
    setPreview((current) =>
      current
        ? {
            ...current,
            pieces: current.pieces.map((piece, pieceIndex) => {
              if (pieceIndex !== index) return piece;

              const nextPiece = { ...piece, ...values };

              if ("quantity" in values || "width_mm" in values || "height_mm" in values) {
                nextPiece.area_m2 = calculatedPreviewArea(nextPiece) ?? nextPiece.area_m2;

                if (nextPiece.quantity > 0 && nextPiece.unit_weight_kg > 0) {
                  nextPiece.total_weight_kg = Number(
                    (nextPiece.quantity * nextPiece.unit_weight_kg).toFixed(3),
                  );
                }
              }

              return nextPiece;
            }),
          }
        : current,
    );
  }

  function operatorName(operatorId: string | null | undefined) {
    if (!operatorId) return "Operador não informado";
    return accentDisplayText(operatorById.get(operatorId)?.name ?? "Operador não informado");
  }

  function pieceStageEvents(pieceId: string, stageId: string) {
    return [...(timeEntriesByPieceStage.get(`${pieceId}:${stageId}`) ?? [])]
      .sort((left, right) => left.event_at.localeCompare(right.event_at))
      .map<PieceStageEvent>((entry) => {
        const session = entry.pointing_session_id ? sessionById.get(entry.pointing_session_id) : null;
        const participantNames = Array.from(
          new Set(
            (entry.pointing_session_id
              ? participantIdsBySession.get(entry.pointing_session_id) ?? []
              : []
            )
              .filter((operatorId) => operatorId !== entry.operator_id)
              .map(operatorName),
          ),
        );

        return {
          id: entry.id,
          label: pointingActionLabels[session?.action ?? entry.action] ?? entry.action,
          eventAt: entry.event_at,
          operatorName: operatorName(entry.operator_id),
          participantNames,
          productiveSeconds: Number(entry.productive_seconds_delta ?? 0),
          pausedSeconds: Number(entry.paused_seconds_delta ?? 0),
          notes: accentDisplayText(entry.notes ?? "").trim(),
          reason: accentDisplayText(entry.pause_reason ?? "").trim(),
        };
      });
  }

  function pieceStageSummary(pieceId: string) {
    const stagesForPiece = pieceStages.filter(
      (stage) => stage.piece_id === pieceId && pointingStageIds.has(stage.stage_id),
    );
    const stageDetails = pointingStages.map((stage) => {
      const pieceStage = stagesForPiece.find((item) => item.stage_id === stage.id) ?? null;
      const events = pieceStageEvents(pieceId, stage.id);
      const operatorNames = Array.from(
        new Set(
          events.flatMap((event) => [
            event.operatorName,
            ...event.participantNames,
          ]),
        ),
      ).filter((name) => name !== "Operador não informado");

      return {
        stage,
        pieceStage,
        productiveSeconds: pieceStage ? currentProductiveSeconds(pieceStage, nowMs) : 0,
        operators: operatorNames,
        events,
      };
    });
    const done = stageDetails.filter((item) =>
      item.pieceStage ? isPieceStageDone(item.pieceStage.status) : false,
    ).length;
    const productiveSeconds = stageDetails.reduce(
      (sum, item) => sum + item.productiveSeconds,
      0,
    );
    const currentStage =
      stageDetails.find(
        (item) => item.pieceStage && !isPieceStageDone(item.pieceStage.status),
      )?.pieceStage ??
      stageDetails.find((item) => item.pieceStage)?.pieceStage ??
      null;

    return { done, total: stageDetails.length, productiveSeconds, currentStage, stageDetails };
  }

  return (
    <div className="space-y-4">
      {reviewingPiece ? (
        <PieceReviewModal
          mode="view"
          prodId={prodId}
          piece={reviewingPiece}
          stageDetails={pieceStageSummary(reviewingPiece.id).stageDetails}
          canEditPiece={canEditPiece}
          canUpdateStages={canUpdateStages}
          canAdjustTime={canAdjustTime}
          nowMs={nowMs}
          onClose={() => setReviewingPiece(null)}
        />
      ) : null}

      {editingPiece ? (
        <PieceReviewModal
          mode="edit"
          prodId={prodId}
          piece={editingPiece}
          stageDetails={pieceStageSummary(editingPiece.id).stageDetails}
          canEditPiece={canEditPiece}
          canUpdateStages={canUpdateStages}
          canAdjustTime={canAdjustTime}
          nowMs={nowMs}
          onClose={() => setEditingPiece(null)}
        />
      ) : null}

      {reworkingPiece ? (
        <PieceReworkModal
          prodId={prodId}
          piece={reworkingPiece}
          stages={stages}
          reworkReasons={reworkReasons}
          reworks={pieceReworks.filter((rework) => rework.piece_id === reworkingPiece.id)}
          canManage={canManageRework}
          onClose={() => setReworkingPiece(null)}
        />
      ) : null}

      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-md border border-border bg-white p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Itens lançados</p>
          <p className="mt-1 text-2xl font-bold text-charcoal">{totals.itemCount}</p>
        </div>
        <div className="rounded-md border border-border bg-white p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Quantidade total</p>
          <p className="mt-1 text-2xl font-bold text-charcoal">{totals.quantity}</p>
        </div>
        <div className="rounded-md border border-border bg-white p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Área total</p>
          <p className="mt-1 text-2xl font-bold text-charcoal">{numberLabel(totals.areaM2)} m²</p>
        </div>
        <div className="rounded-md border border-border bg-white p-3">
          <p className="text-xs font-semibold uppercase text-muted-foreground">Peso total</p>
          <p className="mt-1 text-2xl font-bold text-charcoal">{numberLabel(totals.weightKg, 3)} kg</p>
        </div>
      </div>

      {lastImport ? (
        <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-muted-foreground">
          Última importação: {lastImport.file_name} em {formatDateTime(lastImport.created_at)}
        </div>
      ) : null}

      {unreleasedPieces.length ? (
        <section className="rounded-md border border-amber-200 bg-amber-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 size-5 text-amber-700" />
              <div>
                <p className="font-semibold text-amber-950">Lote aguardando liberação para produção</p>
                <p className="text-sm text-amber-900">
                  {unreleasedPieces.length} peça(s) já cadastrada(s) ainda não aparecem para os operadores.
                </p>
              </div>
            </div>
            {canReleaseProduction ? (
              <ReleaseProdPiecesButton prodId={prodId} count={unreleasedPieces.length} />
            ) : null}
          </div>
        </section>
      ) : null}

      {canReleaseProduction && releasedPieces.length > 0 && !releasedPiecesHaveMovement ? (
        <section className="rounded-md border border-amber-200 bg-white p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <RotateCcw className="mt-0.5 size-5 text-amber-700" />
              <div>
                <p className="font-semibold text-charcoal">Liberação ainda pode ser estornada</p>
                <p className="text-sm text-muted-foreground">
                  Esta PROD foi liberada, mas ainda não possui apontamentos. Use o estorno caso a
                  liberação tenha sido feita por engano.
                </p>
              </div>
            </div>
            <RevertProdPiecesReleaseButton prodId={prodId} count={releasedPieces.length} />
          </div>
        </section>
      ) : null}

      {canImport ? (
        <section className="rounded-md border border-border bg-muted/20 p-4">
          <div className="mb-3 flex items-center gap-2 font-semibold text-charcoal">
            <UploadCloud className="size-4 text-accent" />
            Importar peças por PDF
          </div>
          <Field label="Relatório de itens da obra">
            <input
              type="file"
              accept="application/pdf"
              className={inputClass}
              onChange={(event) => uploadPreview(event.target.files?.[0] ?? null)}
            />
          </Field>
          {loadingPreview ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" />
              Lendo PDF...
            </p>
          ) : null}
          <FloatingMessage message={previewError} />

          {preview ? (
            <form action={formAction} className="mt-4 space-y-4">
              <input type="hidden" name="prod_id" value={prodId} />
              <input type="hidden" name="file_name" value={preview.fileName} />
              <input
                type="hidden"
                name="totals_json"
                value={JSON.stringify({
                  quantity: previewTotals?.quantity ?? preview.totals.quantity,
                  area_m2: previewTotals?.areaM2 ?? preview.totals.area_m2,
                  weight_kg: previewTotals?.weightKg ?? preview.totals.weight_kg,
                })}
              />
              <input type="hidden" name="pieces_json" value={JSON.stringify(preview.pieces)} />

              <div className="rounded-md border border-border bg-white p-3 text-sm">
                <p className="font-semibold text-charcoal">{preview.fileName}</p>
                <p className="text-muted-foreground">
                  {previewTotals?.itemCount ?? preview.pieces.length} item(ns) identificado(s) ·{" "}
                  {previewTotals?.quantity ?? preview.pieces.length} un. ·{" "}
                  {numberLabel(previewTotals?.areaM2 ?? preview.totals.area_m2)} m² ·{" "}
                  {numberLabel(previewTotals?.weightKg ?? preview.totals.weight_kg, 3)} kg
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {previewImportableCount} item(ns) novo(s) pronto(s) para importar
                  {previewDuplicateCount ? ` · ${previewDuplicateCount} duplicado(s) ignorado(s)` : ""}
                </p>
                {preview.totals.quantity !== null ||
                preview.totals.area_m2 !== null ||
                preview.totals.weight_kg !== null ? (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Total informado no PDF: {preview.totals.quantity ?? "-"} un. ·{" "}
                    {numberLabel(preview.totals.area_m2)} m² ·{" "}
                    {numberLabel(preview.totals.weight_kg, 3)} kg
                  </p>
                ) : null}
                {preview.metadata.work || preview.metadata.client ? (
                  <p className="mt-1 text-muted-foreground">
                    {preview.metadata.client ?? "Cliente não identificado"} ·{" "}
                    {preview.metadata.work ?? "Obra não identificada"}
                  </p>
                ) : null}
              </div>

              {preview.warnings.length ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                  {preview.warnings.map((warning) => (
                    <p key={warning}>{warning}</p>
                  ))}
                </div>
              ) : null}

              {previewDuplicateCount || previewRepeatedCount ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {previewDuplicateCount ? (
                    <p>
                      {previewDuplicateCount} peça(s) já existem nesta PROD e serão ignorada(s) ao
                      confirmar. Para importar como nova peça, altere o código na prévia.
                    </p>
                  ) : null}
                  {previewRepeatedCount ? (
                    <p>
                      Há {previewRepeatedCount} peça(s) com código repetido dentro da própria prévia.
                      Ajuste os códigos antes de confirmar a importação.
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="max-h-[460px] overflow-auto rounded-md border border-border bg-white">
                <table className="min-w-[980px] w-full text-left text-sm">
                  <thead className="sticky top-0 bg-muted text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2">Peça</th>
                      <th className="px-3 py-2">Sistema</th>
                      <th className="px-3 py-2">Qtd.</th>
                      <th className="px-3 py-2">L</th>
                      <th className="px-3 py-2">H</th>
                      <th className="px-3 py-2">Localização</th>
                      <th className="px-3 py-2">Área</th>
                      <th className="px-3 py-2">Peso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {preview.pieces.map((piece, index) => {
                      const code = normalizedPieceCode(piece.piece_code);
                      const isExistingDuplicate = existingPieceCodeSet.has(code);
                      const isRepeatedInPreview = (previewPieceCodeCounts.get(code) ?? 0) > 1;

                      return (
                        <tr
                          key={`${piece.piece_code}-${index}`}
                          className={cn(
                            "border-t border-border",
                            isExistingDuplicate ? "bg-amber-50/70" : "",
                            isRepeatedInPreview && !isExistingDuplicate ? "bg-red-50/60" : "",
                          )}
                        >
                          <td className="px-3 py-2">
                            <input
                              className={inputClass}
                              value={piece.piece_code}
                              onChange={(event) =>
                                updatePreviewPiece(index, { piece_code: event.target.value })
                              }
                            />
                            {isExistingDuplicate ? (
                              <span className="mt-1 inline-flex rounded-md bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                                Já cadastrada
                              </span>
                            ) : null}
                            {isRepeatedInPreview && !isExistingDuplicate ? (
                              <span className="mt-1 inline-flex rounded-md bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
                                Código repetido
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2">
                            <p className="font-semibold text-charcoal">{piece.system_code}</p>
                            <p className="line-clamp-2 text-xs text-muted-foreground">
                              {piece.system_description}
                            </p>
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={1}
                              className={inputClass}
                              value={piece.quantity}
                              onChange={(event) =>
                                updatePreviewPiece(index, { quantity: Number(event.target.value) })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step="1"
                              className={inputClass}
                              value={previewNumberInputValue(piece.width_mm)}
                              onChange={(event) =>
                                updatePreviewPiece(index, {
                                  width_mm: previewNumberFromInput(event.target.value),
                                })
                              }
                              aria-label={`Largura da peça ${piece.piece_code}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              min={0}
                              step="1"
                              className={inputClass}
                              value={previewNumberInputValue(piece.height_mm)}
                              onChange={(event) =>
                                updatePreviewPiece(index, {
                                  height_mm: previewNumberFromInput(event.target.value),
                                })
                              }
                              aria-label={`Altura da peça ${piece.piece_code}`}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              className={inputClass}
                              value={piece.location ?? ""}
                              onChange={(event) =>
                                updatePreviewPiece(index, { location: event.target.value })
                              }
                            />
                          </td>
                          <td className="px-3 py-2">{numberLabel(piece.area_m2)} m²</td>
                          <td className="px-3 py-2">{numberLabel(piece.total_weight_kg, 3)} kg</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="border-t border-border bg-muted/50 text-sm font-semibold text-charcoal">
                    <tr>
                      <td className="px-3 py-2" colSpan={2}>
                        Total conferido
                      </td>
                      <td className="px-3 py-2">{previewTotals?.quantity ?? 0}</td>
                      <td className="px-3 py-2" colSpan={3}>
                        {previewTotals?.itemCount ?? 0} item(ns)
                      </td>
                      <td className="px-3 py-2">{numberLabel(previewTotals?.areaM2)} m²</td>
                      <td className="px-3 py-2">{numberLabel(previewTotals?.weightKg, 3)} kg</td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <button
                  type="submit"
                  disabled={pending || previewImportableCount === 0 || previewRepeatedCount > 0}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
                >
                  {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                  Confirmar importação
                </button>
                <ActionMessage state={state} />
              </div>
            </form>
          ) : null}
        </section>
      ) : null}

      {canImport || canManage ? <ManualPieceForm prodId={prodId} /> : null}

      <section className="space-y-3">
        <h3 className="text-base font-semibold text-charcoal">Peças cadastradas</h3>
        {pieces.length === 0 ? (
          <p className="rounded-md border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            Nenhuma peça cadastrada para esta PROD.
          </p>
        ) : (
          <div className="space-y-2">
            {pieces.map((piece) => {
              const summary = pieceStageSummary(piece.id);
              const currentStage = summary.currentStage;
              const currentStageReason =
                currentStage?.status === "com_pendencia"
                  ? accentDisplayText(currentStage.blockers ?? "").trim()
                  : "";
              const pieceReworkRows = pieceReworks.filter((rework) => rework.piece_id === piece.id);
              const hasOpenRework = pieceReworkRows.some((rework) => rework.status !== "concluido");

              return (
                <article
                  key={piece.id}
                  className="grid gap-3 rounded-md border border-border bg-white p-3 lg:grid-cols-[1fr_auto]"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-charcoal">{piece.piece_code}</p>
                      {currentStage ? <StatusBadge status={currentStage.status} type="stage" /> : null}
                      <span
                        className={cn(
                          "rounded-md px-2 py-1 text-xs font-semibold ring-1",
                          piece.released_to_production
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-amber-50 text-amber-800 ring-amber-200",
                        )}
                      >
                        {piece.released_to_production ? "Liberada" : "Aguardando liberação"}
                      </span>
                      {hasOpenRework ? (
                        <span className="rounded-md bg-red-50 px-2 py-1 text-xs font-semibold text-red-700 ring-1 ring-red-200">
                          Retrabalho aberto
                        </span>
                      ) : null}
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {piece.system_code ?? "Sistema não informado"} ·{" "}
                      {piece.location ?? "Localização não informada"}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {summary.done}/{summary.total} etapa(s) concluída(s) · Tempo produtivo{" "}
                      {formatDurationClock(summary.productiveSeconds)}
                    </p>
                    {currentStageReason ? (
                      <p className="mt-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800">
                        Motivo da pendência: {currentStageReason}
                      </p>
                    ) : null}
                    {summary.stageDetails.length ? (
                      <div className="mt-2 grid gap-1 sm:grid-cols-2 xl:grid-cols-5">
                        {summary.stageDetails.map(({ stage, productiveSeconds }) => (
                          <span
                            key={stage.id}
                            className="rounded-md border border-border bg-muted/30 px-2 py-1 text-[11px] text-muted-foreground"
                          >
                            <strong className="block text-charcoal">{stage.name}</strong>
                            Tempo produtivo: {formatDurationClock(productiveSeconds)}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="rounded-md bg-muted px-2 py-1">{piece.quantity} un.</span>
                    <span className="rounded-md bg-muted px-2 py-1">
                      L: {piece.width_mm ? numberLabel(piece.width_mm, 0) : "-"} mm
                    </span>
                    <span className="rounded-md bg-muted px-2 py-1">
                      H: {piece.height_mm ? numberLabel(piece.height_mm, 0) : "-"} mm
                    </span>
                    <span className="rounded-md bg-muted px-2 py-1">{numberLabel(piece.area_m2)} m²</span>
                    <span className="rounded-md bg-muted px-2 py-1">
                      {numberLabel(piece.total_weight_kg, 3)} kg
                    </span>
                    <button
                      type="button"
                      onClick={() => setReviewingPiece(piece)}
                      className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-white text-charcoal transition hover:bg-muted"
                      title="Visualizar peça"
                    >
                      <Eye className="size-4" />
                    </button>
                    {canEditPiece || canUpdateStages ? (
                      <button
                        type="button"
                        onClick={() => setEditingPiece(piece)}
                        className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-white text-charcoal transition hover:bg-muted"
                        title="Editar peça"
                      >
                        <Pencil className="size-4" />
                      </button>
                    ) : null}
                    {canViewRework || canManageRework ? (
                      <button
                        type="button"
                        onClick={() => setReworkingPiece(piece)}
                        className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-white text-charcoal transition hover:bg-muted"
                        title="Retrabalho"
                      >
                        <RotateCcw className="size-4" />
                      </button>
                    ) : null}
                    {canManage ? <DeletePieceButton prodId={prodId} pieceId={piece.id} /> : null}
                  </div>
                </article>
              );
            })}
            <div className="grid gap-2 rounded-md border border-border bg-muted/30 p-3 text-sm sm:grid-cols-4">
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Itens lançados</p>
                <p className="mt-1 text-base font-bold text-charcoal">{totals.itemCount}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Quantidade total</p>
                <p className="mt-1 text-base font-bold text-charcoal">{totals.quantity}</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Área total</p>
                <p className="mt-1 text-base font-bold text-charcoal">{numberLabel(totals.areaM2)} m²</p>
              </div>
              <div>
                <p className="text-xs font-semibold uppercase text-muted-foreground">Peso total</p>
                <p className="mt-1 text-base font-bold text-charcoal">{numberLabel(totals.weightKg, 3)} kg</p>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
