"use client";

import { FloatingMessage } from "@/components/floating-feedback";

import {
  AlertTriangle,
  Clock3,
  Eye,
  Loader2,
  MessageSquareWarning,
  Pencil,
  Plus,
  Save,
  UserRound,
  UserX,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Field, inputClass, textareaClass } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { toUserFriendlyErrorMessage } from "@/lib/errors";
import {
  isValidOperatorPin,
  isValidOperatorRegistration,
  normalizeOperatorPin,
  normalizeOperatorRegistration,
} from "@/lib/operator-credentials";
import type {
  PointingReasonKind,
  ProductionPointingBreak,
  ProductionPointingSettings,
  ProductionIndirectActivityReason,
  ProductionOperator,
  ProductionPointingReason,
  ProductionReworkReason,
  ProductionStage,
  ReworkReasonKind,
} from "@/lib/types";
import { accentDisplayText } from "@/lib/utils";

type PointingSettingsData = {
  canManageOperators: boolean;
  canManageReasons: boolean;
  canManageCalendar: boolean;
  canManageRework: boolean;
  stages: ProductionStage[];
  operators: ProductionOperator[];
  reasons: ProductionPointingReason[];
  settings: ProductionPointingSettings | null;
  indirectReasons: ProductionIndirectActivityReason[];
  reworkReasons: ProductionReworkReason[];
};

type PointingSettingsResponse = Partial<PointingSettingsData> & {
  error?: string;
};

type OperatorDraft = {
  name: string;
  registration: string;
  pin: string;
  notes: string;
  active: boolean;
  stageIds: string[];
};

type ReasonDraft = {
  kind: PointingReasonKind;
  label: string;
  description: string;
  active: boolean;
  countsAsDowntime: boolean;
  sortOrder: number;
};

type PointingCalendarDraft = {
  timezone: string;
  workdayStart: string;
  workdayEnd: string;
  workdays: number[];
  breaks: ProductionPointingBreak[];
};

type ReworkReasonDraft = {
  kind: ReworkReasonKind;
  label: string;
  description: string;
  active: boolean;
  sortOrder: number;
};

type IndirectReasonDraft = {
  label: string;
  description: string;
  active: boolean;
  sortOrder: number;
};

type PointingSettingsPayload =
  | {
      action: "createOperator";
      name: string;
      registration: string;
      pin: string;
      notes: string;
      active: boolean;
      stageIds: string[];
    }
  | {
      action: "updateOperator";
      id: string;
      name: string;
      registration: string;
      pin: string;
      notes: string;
      active: boolean;
      stageIds: string[];
    }
  | { action: "deleteOperator"; id: string }
  | {
      action: "createReason";
      kind: PointingReasonKind;
      label: string;
      description: string;
      active: boolean;
      countsAsDowntime: boolean;
      sortOrder: number;
    }
  | {
      action: "updateReason";
      id: string;
      kind: PointingReasonKind;
      label: string;
      description: string;
      active: boolean;
      countsAsDowntime: boolean;
      sortOrder: number;
    }
  | { action: "deleteReason"; id: string }
  | {
      action: "createIndirectReason";
      label: string;
      description: string;
      active: boolean;
      sortOrder: number;
    }
  | {
      action: "updateIndirectReason";
      id: string;
      label: string;
      description: string;
      active: boolean;
      sortOrder: number;
    }
  | { action: "deleteIndirectReason"; id: string }
  | {
      action: "updateCalendar";
      timezone: string;
      workdayStart: string;
      workdayEnd: string;
      workdays: number[];
      breaks: ProductionPointingBreak[];
    }
  | {
      action: "createReworkReason";
      kind: ReworkReasonKind;
      label: string;
      description: string;
      active: boolean;
      sortOrder: number;
    }
  | {
      action: "updateReworkReason";
      id: string;
      kind: ReworkReasonKind;
      label: string;
      description: string;
      active: boolean;
      sortOrder: number;
    }
  | { action: "deleteReworkReason"; id: string };

type OperatorPanelState = {
  operator: ProductionOperator;
  mode: "view" | "edit";
} | null;

const emptyOperatorDraft: OperatorDraft = {
  name: "",
  registration: "",
  pin: "",
  notes: "",
  active: true,
  stageIds: [],
};

const emptyReasonDraft: ReasonDraft = {
  kind: "pausa",
  label: "",
  description: "",
  active: true,
  countsAsDowntime: true,
  sortOrder: 0,
};

const defaultCalendarDraft: PointingCalendarDraft = {
  timezone: "America/Sao_Paulo",
  workdayStart: "08:00",
  workdayEnd: "18:00",
  workdays: [1, 2, 3, 4, 5],
  breaks: [
    { label: "Almoço", start: "12:00", end: "13:00" },
    { label: "Lanche", start: "15:00", end: "15:15" },
  ],
};

const emptyReworkReasonDraft: ReworkReasonDraft = {
  kind: "motivo",
  label: "",
  description: "",
  active: true,
  sortOrder: 0,
};

const emptyIndirectReasonDraft: IndirectReasonDraft = {
  label: "",
  description: "",
  active: true,
  sortOrder: 0,
};

const reasonKindLabels: Record<PointingReasonKind, string> = {
  pausa: "Pausa",
  pendencia: "Pendência",
};

const weekdayOptions = [
  { value: 1, label: "Seg" },
  { value: 2, label: "Ter" },
  { value: 3, label: "Qua" },
  { value: 4, label: "Qui" },
  { value: 5, label: "Sex" },
  { value: 6, label: "Sáb" },
  { value: 0, label: "Dom" },
];

const reworkReasonKindLabels: Record<ReworkReasonKind, string> = {
  motivo: "Motivo",
  origem: "Origem",
};

function hasValidOperatorCredentials(registration: string, pin: string) {
  return isValidOperatorRegistration(registration) && isValidOperatorPin(pin);
}

async function loadPointingSettings(): Promise<PointingSettingsData> {
  const response = await fetch("/api/settings/pointing", {
    headers: { Accept: "application/json" },
  });
  const data = (await response.json().catch(() => ({}))) as PointingSettingsResponse;

  if (!response.ok) {
    throw new Error(data.error ?? "Não foi possível carregar os operadores.");
  }

  return {
    canManageOperators: Boolean(data.canManageOperators),
    canManageReasons: Boolean(data.canManageReasons),
    canManageCalendar: Boolean(data.canManageCalendar),
    canManageRework: Boolean(data.canManageRework),
    stages: data.stages ?? [],
    operators: data.operators ?? [],
    reasons: data.reasons ?? [],
    settings: data.settings ?? null,
    indirectReasons: data.indirectReasons ?? [],
    reworkReasons: data.reworkReasons ?? [],
  };
}

async function postPointingSettings(payload: PointingSettingsPayload) {
  const response = await fetch("/api/settings/pointing", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await response.json().catch(() => ({}))) as PointingSettingsResponse;

  if (!response.ok) {
    throw new Error(data.error ?? "Não foi possível salvar as configurações de apontamento.");
  }
}

function operatorToDraft(operator: ProductionOperator): OperatorDraft {
  return {
    name: accentDisplayText(operator.name),
    registration: accentDisplayText(operator.registration),
    pin: "",
    notes: accentDisplayText(operator.notes ?? ""),
    active: operator.active,
    stageIds: operator.stage_ids ?? [],
  };
}

function reasonToDraft(reason: ProductionPointingReason): ReasonDraft {
  return {
    kind: reason.kind,
    label: accentDisplayText(reason.label),
    description: accentDisplayText(reason.description ?? ""),
    active: reason.active,
    countsAsDowntime: reason.counts_as_downtime !== false,
    sortOrder: reason.sort_order,
  };
}

function settingsToCalendarDraft(settings: ProductionPointingSettings | null): PointingCalendarDraft {
  if (!settings) return defaultCalendarDraft;

  return {
    timezone: settings.timezone || defaultCalendarDraft.timezone,
    workdayStart: String(settings.workday_start ?? defaultCalendarDraft.workdayStart).slice(0, 5),
    workdayEnd: String(settings.workday_end ?? defaultCalendarDraft.workdayEnd).slice(0, 5),
    workdays: Array.isArray(settings.workdays) && settings.workdays.length
      ? settings.workdays
      : defaultCalendarDraft.workdays,
    breaks: Array.isArray(settings.breaks)
      ? settings.breaks.map((item) => ({
          label: accentDisplayText(item.label),
          start: String(item.start ?? "").slice(0, 5),
          end: String(item.end ?? "").slice(0, 5),
        }))
      : defaultCalendarDraft.breaks,
  };
}

function reworkReasonToDraft(reason: ProductionReworkReason): ReworkReasonDraft {
  return {
    kind: reason.kind,
    label: accentDisplayText(reason.label),
    description: accentDisplayText(reason.description ?? ""),
    active: reason.active,
    sortOrder: reason.sort_order,
  };
}

function indirectReasonToDraft(reason: ProductionIndirectActivityReason): IndirectReasonDraft {
  return {
    label: accentDisplayText(reason.label),
    description: accentDisplayText(reason.description ?? ""),
    active: reason.active,
    sortOrder: reason.sort_order,
  };
}

function StageChecklist({
  stages,
  selected,
  onChange,
}: {
  stages: ProductionStage[];
  selected: string[];
  onChange: (stageIds: string[]) => void;
}) {
  const selectedSet = new Set(selected);

  function toggle(stageId: string) {
    onChange(
      selectedSet.has(stageId)
        ? selected.filter((id) => id !== stageId)
        : [...selected, stageId],
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {stages.map((stage) => (
        <label
          key={stage.id}
          className="flex min-h-11 items-start gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm"
        >
          <input
            type="checkbox"
            checked={selectedSet.has(stage.id)}
            onChange={() => toggle(stage.id)}
            className="mt-1 size-4 rounded border-border"
          />
          <span>
            <span className="block font-semibold text-charcoal">{accentDisplayText(stage.name)}</span>
            {stage.description ? (
              <span className="block text-xs text-muted-foreground">
                {accentDisplayText(stage.description)}
              </span>
            ) : null}
          </span>
        </label>
      ))}
    </div>
  );
}

function StageSummary({
  stages,
  selected,
}: {
  stages: ProductionStage[];
  selected: string[];
}) {
  const selectedSet = new Set(selected);
  const selectedStages = stages.filter((stage) => selectedSet.has(stage.id));

  if (!selectedStages.length) {
    return (
      <div className="rounded-md border border-dashed border-border bg-muted/20 p-3 text-sm text-muted-foreground">
        Nenhuma etapa liberada para este operador.
      </div>
    );
  }

  return (
    <div className="grid gap-2 sm:grid-cols-2">
      {selectedStages.map((stage) => (
        <div key={stage.id} className="rounded-md border border-border bg-muted/20 p-3 text-sm">
          <p className="font-semibold text-charcoal">{accentDisplayText(stage.name)}</p>
          {stage.description ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {accentDisplayText(stage.description)}
            </p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

export function PointingSettingsManager() {
  const resource = useAsyncResource<PointingSettingsData>(
    "settings:pointing",
    loadPointingSettings,
  );
  const data = resource.data;
  const loading = resource.loading && !data;
  const resourceError = resource.error
    ? toUserFriendlyErrorMessage(resource.error, "Não foi possível carregar os apontamentos.")
    : null;
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newOperator, setNewOperator] = useState<OperatorDraft>(emptyOperatorDraft);
  const [operatorDrafts, setOperatorDrafts] = useState<Record<string, OperatorDraft>>({});
  const [operatorPanel, setOperatorPanel] = useState<OperatorPanelState>(null);
  const [newReason, setNewReason] = useState<ReasonDraft>(emptyReasonDraft);
  const [editingReasonId, setEditingReasonId] = useState<string | null>(null);
  const [reasonDrafts, setReasonDrafts] = useState<Record<string, ReasonDraft>>({});
  const [newIndirectReason, setNewIndirectReason] =
    useState<IndirectReasonDraft>(emptyIndirectReasonDraft);
  const [editingIndirectReasonId, setEditingIndirectReasonId] = useState<string | null>(null);
  const [indirectReasonDrafts, setIndirectReasonDrafts] = useState<
    Record<string, IndirectReasonDraft>
  >({});
  const [calendarDraft, setCalendarDraft] =
    useState<PointingCalendarDraft>(defaultCalendarDraft);
  const [newReworkReason, setNewReworkReason] =
    useState<ReworkReasonDraft>(emptyReworkReasonDraft);
  const [editingReworkReasonId, setEditingReworkReasonId] = useState<string | null>(null);
  const [reworkReasonDrafts, setReworkReasonDrafts] = useState<
    Record<string, ReworkReasonDraft>
  >({});

  useEffect(() => {
    if (!data) return;

    const timeout = window.setTimeout(() => {
      setOperatorDrafts(
        Object.fromEntries(
          data.operators.map((operator) => [operator.id, operatorToDraft(operator)]),
        ),
      );
      setReasonDrafts(
        Object.fromEntries(data.reasons.map((reason) => [reason.id, reasonToDraft(reason)])),
      );
      setIndirectReasonDrafts(
        Object.fromEntries(
          data.indirectReasons.map((reason) => [reason.id, indirectReasonToDraft(reason)]),
        ),
      );
      setCalendarDraft(settingsToCalendarDraft(data.settings));
      setReworkReasonDrafts(
        Object.fromEntries(
          data.reworkReasons.map((reason) => [reason.id, reworkReasonToDraft(reason)]),
        ),
      );
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [data]);

  async function runMutation(action: () => Promise<void>, successMessage: string) {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await action();
      setMessage(successMessage);
      await resource.reload();
    } catch (mutationError) {
      setError(toUserFriendlyErrorMessage(mutationError, "Não foi possível salvar."));
    } finally {
      setSaving(false);
    }
  }

  async function createOperator() {
    if (!newOperator.name.trim() || !hasValidOperatorCredentials(newOperator.registration, newOperator.pin)) {
      setError("Informe nome, matrícula com 3 dígitos e senha com 4 dígitos.");
      return;
    }

    if (!newOperator.stageIds.length) {
      setError("Selecione ao menos uma etapa liberada para o operador.");
      return;
    }

    await runMutation(async () => {
      await postPointingSettings({ action: "createOperator", ...newOperator });
      setNewOperator(emptyOperatorDraft);
    }, "Operador cadastrado.");
  }

  async function updateOperator(operatorId: string) {
    const draft = operatorDrafts[operatorId];
    if (!draft?.name.trim() || !isValidOperatorRegistration(draft.registration)) {
      setError("Informe nome e matrícula com 3 dígitos.");
      return;
    }

    if (draft.pin && !isValidOperatorPin(draft.pin)) {
      setError("A nova senha deve possuir 4 dígitos.");
      return;
    }

    if (!draft.stageIds.length) {
      setError("Selecione ao menos uma etapa liberada para o operador.");
      return;
    }

    await runMutation(async () => {
      await postPointingSettings({ action: "updateOperator", id: operatorId, ...draft });
      setOperatorPanel(null);
    }, "Operador atualizado.");
  }

  async function inactivateOperator(operator: ProductionOperator) {
    if (!window.confirm(`Inativar o operador ${operator.name}?`)) return;

    await runMutation(async () => {
      await postPointingSettings({ action: "deleteOperator", id: operator.id });
      setOperatorPanel(null);
    }, "Operador inativado.");
  }

  async function createReason() {
    if (!newReason.label.trim()) {
      setError("Informe o motivo de apontamento.");
      return;
    }

    await runMutation(async () => {
      await postPointingSettings({ action: "createReason", ...newReason });
      setNewReason(emptyReasonDraft);
    }, "Motivo cadastrado.");
  }

  async function updateReason(reasonId: string) {
    const draft = reasonDrafts[reasonId];
    if (!draft?.label.trim()) {
      setError("Informe o motivo de apontamento.");
      return;
    }

    await runMutation(async () => {
      await postPointingSettings({ action: "updateReason", id: reasonId, ...draft });
      setEditingReasonId(null);
    }, "Motivo atualizado.");
  }

  async function inactivateReason(reason: ProductionPointingReason) {
    if (!window.confirm(`Inativar o motivo ${reason.label}?`)) return;

    await runMutation(async () => {
      await postPointingSettings({ action: "deleteReason", id: reason.id });
      setEditingReasonId(null);
    }, "Motivo inativado.");
  }

  async function createIndirectReason() {
    if (!newIndirectReason.label.trim()) {
      setError("Informe o motivo da atividade indireta.");
      return;
    }

    await runMutation(async () => {
      await postPointingSettings({ action: "createIndirectReason", ...newIndirectReason });
      setNewIndirectReason(emptyIndirectReasonDraft);
    }, "Atividade indireta cadastrada.");
  }

  async function updateIndirectReason(reasonId: string) {
    const draft = indirectReasonDrafts[reasonId];
    if (!draft?.label.trim()) {
      setError("Informe o motivo da atividade indireta.");
      return;
    }

    await runMutation(async () => {
      await postPointingSettings({ action: "updateIndirectReason", id: reasonId, ...draft });
      setEditingIndirectReasonId(null);
    }, "Atividade indireta atualizada.");
  }

  async function inactivateIndirectReason(reason: ProductionIndirectActivityReason) {
    if (!window.confirm(`Inativar a atividade indireta ${reason.label}?`)) return;

    await runMutation(async () => {
      await postPointingSettings({ action: "deleteIndirectReason", id: reason.id });
      setEditingIndirectReasonId(null);
    }, "Atividade indireta inativada.");
  }

  async function updateCalendar() {
    if (!calendarDraft.workdays.length) {
      setError("Selecione ao menos um dia de trabalho.");
      return;
    }

    await runMutation(async () => {
      await postPointingSettings({ action: "updateCalendar", ...calendarDraft });
    }, "Jornada de apontamento atualizada.");
  }

  function toggleWorkday(day: number) {
    setCalendarDraft((current) => {
      const days = current.workdays.includes(day)
        ? current.workdays.filter((item) => item !== day)
        : [...current.workdays, day];

      return { ...current, workdays: days.sort((left, right) => left - right) };
    });
  }

  function updateBreak(index: number, values: Partial<ProductionPointingBreak>) {
    setCalendarDraft((current) => ({
      ...current,
      breaks: current.breaks.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...values } : item,
      ),
    }));
  }

  function addBreak() {
    setCalendarDraft((current) => ({
      ...current,
      breaks: [...current.breaks, { label: "Novo intervalo", start: "12:00", end: "13:00" }],
    }));
  }

  function removeBreak(index: number) {
    setCalendarDraft((current) => ({
      ...current,
      breaks: current.breaks.filter((_, itemIndex) => itemIndex !== index),
    }));
  }

  async function createReworkReason() {
    if (!newReworkReason.label.trim()) {
      setError("Informe o motivo ou a origem de retrabalho.");
      return;
    }

    await runMutation(async () => {
      await postPointingSettings({ action: "createReworkReason", ...newReworkReason });
      setNewReworkReason(emptyReworkReasonDraft);
    }, "Cadastro de retrabalho criado.");
  }

  async function updateReworkReason(reasonId: string) {
    const draft = reworkReasonDrafts[reasonId];
    if (!draft?.label.trim()) {
      setError("Informe o motivo ou a origem de retrabalho.");
      return;
    }

    await runMutation(async () => {
      await postPointingSettings({ action: "updateReworkReason", id: reasonId, ...draft });
      setEditingReworkReasonId(null);
    }, "Cadastro de retrabalho atualizado.");
  }

  async function inactivateReworkReason(reason: ProductionReworkReason) {
    if (!window.confirm(`Inativar ${reason.label}?`)) return;

    await runMutation(async () => {
      await postPointingSettings({ action: "deleteReworkReason", id: reason.id });
      setEditingReworkReasonId(null);
    }, "Cadastro de retrabalho inativado.");
  }

  function openOperatorPanel(operator: ProductionOperator, mode: "view" | "edit") {
    setOperatorDrafts((current) => ({
      ...current,
      [operator.id]: current[operator.id] ?? operatorToDraft(operator),
    }));
    setOperatorPanel({ operator, mode });
  }

  if (loading) {
    return (
      <Panel>
        <PanelBody className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando configurações de apontamento...
        </PanelBody>
      </Panel>
    );
  }

  if (!data) {
    return (
      <Panel>
        <PanelBody>
          <EmptyState
            icon={AlertTriangle}
            title="Apontamentos indisponíveis"
            description={error ?? resourceError ?? "Não foi possível carregar os apontamentos."}
          />
        </PanelBody>
      </Panel>
    );
  }

  const activeStages = data.stages.filter((stage) => stage.active);
  const panelOperator = operatorPanel?.operator ?? null;
  const panelDraft = panelOperator
    ? operatorDrafts[panelOperator.id] ?? operatorToDraft(panelOperator)
    : null;

  return (
    <div className="space-y-4">
      <FloatingMessage message={error ?? resourceError} />

      <FloatingMessage message={message} kind="success" />

      {data.canManageCalendar ? (
        <Panel>
          <PanelHeader
            title="Jornada dos apontamentos"
            description="Defina quais horários entram no cálculo de tempo parado dos relatórios."
          />
          <PanelBody className="space-y-4">
            <div className="grid gap-3 md:grid-cols-3">
              <Field label="Início da jornada">
                <input
                  type="time"
                  className={inputClass}
                  value={calendarDraft.workdayStart}
                  onChange={(event) =>
                    setCalendarDraft((current) => ({
                      ...current,
                      workdayStart: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Fim da jornada">
                <input
                  type="time"
                  className={inputClass}
                  value={calendarDraft.workdayEnd}
                  onChange={(event) =>
                    setCalendarDraft((current) => ({
                      ...current,
                      workdayEnd: event.target.value,
                    }))
                  }
                />
              </Field>
              <Field label="Fuso horário">
                <input
                  className={inputClass}
                  value={calendarDraft.timezone}
                  onChange={(event) =>
                    setCalendarDraft((current) => ({ ...current, timezone: event.target.value }))
                  }
                />
              </Field>
            </div>

            <div>
              <p className="mb-2 text-sm font-semibold text-charcoal">Dias considerados</p>
              <div className="flex flex-wrap gap-2">
                {weekdayOptions.map((day) => {
                  const selected = calendarDraft.workdays.includes(day.value);

                  return (
                    <button
                      key={day.value}
                      type="button"
                      onClick={() => toggleWorkday(day.value)}
                      className={`min-h-9 rounded-md border px-3 text-sm font-semibold transition ${
                        selected
                          ? "border-accent bg-orange-50 text-accent"
                          : "border-border bg-white text-muted-foreground hover:bg-muted"
                      }`}
                    >
                      {day.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="text-sm font-semibold text-charcoal">Intervalos descontados</p>
                  <p className="text-xs text-muted-foreground">
                    Esses períodos não entram como tempo parado, mesmo que a peça fique pausada.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addBreak}
                  className="inline-flex min-h-9 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-semibold text-charcoal transition hover:bg-muted"
                >
                  <Plus className="size-4" />
                  Adicionar intervalo
                </button>
              </div>

              {calendarDraft.breaks.map((item, index) => (
                <div
                  key={`${item.label}-${index}`}
                  className="grid gap-2 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-[1fr_9rem_9rem_auto]"
                >
                  <Field label="Nome">
                    <input
                      className={inputClass}
                      value={item.label}
                      onChange={(event) => updateBreak(index, { label: event.target.value })}
                    />
                  </Field>
                  <Field label="Início">
                    <input
                      type="time"
                      className={inputClass}
                      value={item.start}
                      onChange={(event) => updateBreak(index, { start: event.target.value })}
                    />
                  </Field>
                  <Field label="Fim">
                    <input
                      type="time"
                      className={inputClass}
                      value={item.end}
                      onChange={(event) => updateBreak(index, { end: event.target.value })}
                    />
                  </Field>
                  <button
                    type="button"
                    title="Remover intervalo"
                    aria-label={`Remover intervalo ${item.label}`}
                    onClick={() => removeBreak(index)}
                    className="inline-flex size-10 self-end items-center justify-center rounded-md border border-red-200 bg-white text-red-700 transition hover:bg-red-50"
                  >
                    <UserX className="size-4" />
                  </button>
                </div>
              ))}
            </div>

            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              O tempo pausado continua registrado integralmente para auditoria. Os relatórios
              gerenciais usam esta jornada para calcular somente a parada operacional.
            </div>

            <button
              type="button"
              disabled={saving}
              onClick={updateCalendar}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Clock3 className="size-4" />}
              Salvar jornada
            </button>
          </PanelBody>
        </Panel>
      ) : null}

      {data.canManageOperators ? (
        <>
          <Panel>
            <PanelHeader
              title="Novo operador"
              description="Cadastre matrícula, senha e etapas que o colaborador pode apontar no chão de fábrica."
            />
            <PanelBody className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-3">
                <Field label="Nome do operador">
                  <input
                    className={inputClass}
                    value={newOperator.name}
                    onChange={(event) =>
                      setNewOperator((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Matrícula">
                  <input
                    className={inputClass}
                    inputMode="numeric"
                    maxLength={3}
                    pattern="[0-9]{3}"
                    placeholder="000"
                    value={newOperator.registration}
                    onChange={(event) =>
                      setNewOperator((current) => ({
                        ...current,
                        registration: normalizeOperatorRegistration(event.target.value),
                      }))
                    }
                  />
                </Field>
                <Field label="Senha/PIN">
                  <input
                    type="password"
                    className={inputClass}
                    inputMode="numeric"
                    maxLength={4}
                    pattern="[0-9]{4}"
                    placeholder="0000"
                    value={newOperator.pin}
                    onChange={(event) =>
                      setNewOperator((current) => ({
                        ...current,
                        pin: normalizeOperatorPin(event.target.value),
                      }))
                    }
                  />
                </Field>
              </div>
              <Field label="Observações">
                <textarea
                  className={textareaClass}
                  value={newOperator.notes}
                  onChange={(event) =>
                    setNewOperator((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </Field>
              <div>
                <p className="mb-2 text-sm font-semibold text-charcoal">Etapas liberadas</p>
                <StageChecklist
                  stages={activeStages}
                  selected={newOperator.stageIds}
                  onChange={(stageIds) => setNewOperator((current) => ({ ...current, stageIds }))}
                />
              </div>
              <button
                type="button"
                disabled={saving}
                onClick={createOperator}
                className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Criar operador
              </button>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader
              title="Operadores cadastrados"
              description="A senha fica protegida; preencha o campo apenas quando precisar redefini-la."
            />
            <PanelBody className="space-y-3">
              {data.operators.length === 0 ? (
                <EmptyState
                  icon={UserRound}
                  title="Nenhum operador cadastrado"
                  description="Cadastre o primeiro operador para liberar apontamentos por matrícula."
                />
              ) : (
                data.operators.map((operator) => {
                  const operatorStages = data.stages.filter((stage) =>
                    operator.stage_ids?.includes(stage.id),
                  );

                  return (
                    <article
                      key={operator.id}
                      className="flex flex-col gap-3 rounded-md border border-border bg-white p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
                          <UserRound className="size-5" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate font-semibold text-charcoal">
                              {accentDisplayText(operator.name)}
                            </p>
                            <span
                              className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                operator.active
                                  ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                  : "border-slate-200 bg-slate-50 text-slate-500"
                              }`}
                            >
                              {operator.active ? "Ativo" : "Inativo"}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Matrícula {accentDisplayText(operator.registration)}
                          </p>
                          <p className="mt-1 truncate text-xs text-muted-foreground">
                            {operatorStages.length
                              ? operatorStages
                                  .map((stage) => accentDisplayText(stage.name))
                                  .join(", ")
                              : "Sem etapas liberadas"}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 sm:justify-end">
                        <button
                          type="button"
                          title="Visualizar operador"
                          aria-label={`Visualizar operador ${accentDisplayText(operator.name)}`}
                          onClick={() => openOperatorPanel(operator, "view")}
                          className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-white text-muted-foreground transition hover:bg-muted hover:text-charcoal"
                        >
                          <Eye className="size-4" />
                        </button>
                        <button
                          type="button"
                          title="Editar operador"
                          aria-label={`Editar operador ${accentDisplayText(operator.name)}`}
                          onClick={() => openOperatorPanel(operator, "edit")}
                          className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-white text-muted-foreground transition hover:bg-muted hover:text-charcoal"
                        >
                          <Pencil className="size-4" />
                        </button>
                        <button
                          type="button"
                          title="Inativar operador"
                          aria-label={`Inativar operador ${accentDisplayText(operator.name)}`}
                          disabled={saving || !operator.active}
                          onClick={() => inactivateOperator(operator)}
                          className="inline-flex size-9 items-center justify-center rounded-md border border-red-200 bg-white text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <UserX className="size-4" />
                        </button>
                      </div>
                    </article>
                  );
                })
              )}
            </PanelBody>
          </Panel>
        </>
      ) : null}

      {data.canManageReasons ? (
        <Panel>
          <PanelHeader
            title="Motivos de pausa e pendência"
            description="Cadastre opções padronizadas para evitar preenchimentos diferentes para a mesma situação."
          />
          <PanelBody className="space-y-4">
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="mb-3 font-semibold text-charcoal">Novo motivo</p>
              <div className="grid gap-3 lg:grid-cols-[12rem_1fr_7rem]">
                <Field label="Tipo">
                  <select
                    className={inputClass}
                    value={newReason.kind}
                    onChange={(event) =>
                      setNewReason((current) => ({
                        ...current,
                        kind: event.target.value as PointingReasonKind,
                      }))
                    }
                  >
                    <option value="pausa">Pausa</option>
                    <option value="pendencia">Pendência</option>
                  </select>
                </Field>
                <Field label="Motivo">
                  <input
                    className={inputClass}
                    value={newReason.label}
                    onChange={(event) =>
                      setNewReason((current) => ({ ...current, label: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Ordem">
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={newReason.sortOrder}
                    onChange={(event) =>
                      setNewReason((current) => ({
                        ...current,
                        sortOrder: Number(event.target.value) || 0,
                      }))
                    }
                  />
                </Field>
              </div>
              <Field label="Descrição" className="mt-3">
                <textarea
                  className={textareaClass}
                  value={newReason.description}
                  onChange={(event) =>
                    setNewReason((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </Field>
              <label className="mt-3 flex items-start gap-2 text-sm font-semibold text-charcoal">
                <input
                  type="checkbox"
                  checked={newReason.countsAsDowntime}
                  onChange={(event) =>
                    setNewReason((current) => ({
                      ...current,
                      countsAsDowntime: event.target.checked,
                    }))
                  }
                  className="mt-0.5 size-4 rounded border-border"
                />
                <span>
                  Conta como tempo parado nos indicadores
                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                    Desmarque para almoço, lanche, fim de expediente ou pausas que não representam perda produtiva.
                  </span>
                </span>
              </label>
              <button
                type="button"
                disabled={saving}
                onClick={createReason}
                className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Criar motivo
              </button>
            </div>

            {data.reasons.length === 0 ? (
              <EmptyState
                icon={MessageSquareWarning}
                title="Nenhum motivo cadastrado"
                description="Cadastre motivos de pausa e pendência para liberar o apontamento padronizado."
              />
            ) : (
              (["pausa", "pendencia"] as const).map((kind) => {
                const reasons = data.reasons.filter((reason) => reason.kind === kind);
                if (!reasons.length) return null;

                return (
                  <div key={kind} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                      {reasonKindLabels[kind]}
                    </p>
                    {reasons.map((reason) => {
                      const draft = reasonDrafts[reason.id] ?? reasonToDraft(reason);
                      const editing = editingReasonId === reason.id;

                      return (
                        <article
                          key={reason.id}
                          className="rounded-md border border-border bg-white p-3"
                        >
                          {editing ? (
                            <div className="space-y-3">
                              <div className="grid gap-3 lg:grid-cols-[12rem_1fr_7rem]">
                                <Field label="Tipo">
                                  <select
                                    className={inputClass}
                                    value={draft.kind}
                                    onChange={(event) =>
                                      setReasonDrafts((current) => ({
                                        ...current,
                                        [reason.id]: {
                                          ...draft,
                                          kind: event.target.value as PointingReasonKind,
                                        },
                                      }))
                                    }
                                  >
                                    <option value="pausa">Pausa</option>
                                    <option value="pendencia">Pendência</option>
                                  </select>
                                </Field>
                                <Field label="Motivo">
                                  <input
                                    className={inputClass}
                                    value={draft.label}
                                    onChange={(event) =>
                                      setReasonDrafts((current) => ({
                                        ...current,
                                        [reason.id]: { ...draft, label: event.target.value },
                                      }))
                                    }
                                  />
                                </Field>
                                <Field label="Ordem">
                                  <input
                                    type="number"
                                    min={0}
                                    className={inputClass}
                                    value={draft.sortOrder}
                                    onChange={(event) =>
                                      setReasonDrafts((current) => ({
                                        ...current,
                                        [reason.id]: {
                                          ...draft,
                                          sortOrder: Number(event.target.value) || 0,
                                        },
                                      }))
                                    }
                                  />
                                </Field>
                              </div>
                              <Field label="Descrição">
                                <textarea
                                  className={textareaClass}
                                  value={draft.description}
                                  onChange={(event) =>
                                    setReasonDrafts((current) => ({
                                      ...current,
                                      [reason.id]: {
                                        ...draft,
                                        description: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </Field>
                              <label className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                                <input
                                  type="checkbox"
                                  checked={draft.active}
                                  onChange={(event) =>
                                    setReasonDrafts((current) => ({
                                      ...current,
                                      [reason.id]: { ...draft, active: event.target.checked },
                                    }))
                                  }
                                  className="size-4 rounded border-border"
                                />
                                Ativo
                              </label>
                              <label className="flex items-start gap-2 text-sm font-semibold text-charcoal">
                                <input
                                  type="checkbox"
                                  checked={draft.countsAsDowntime}
                                  onChange={(event) =>
                                    setReasonDrafts((current) => ({
                                      ...current,
                                      [reason.id]: {
                                        ...draft,
                                        countsAsDowntime: event.target.checked,
                                      },
                                    }))
                                  }
                                  className="mt-0.5 size-4 rounded border-border"
                                />
                                <span>
                                  Conta como tempo parado nos indicadores
                                  <span className="mt-0.5 block text-xs font-normal text-muted-foreground">
                                    Desmarque quando a pausa não representar perda produtiva.
                                  </span>
                                </span>
                              </label>
                              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => setEditingReasonId(null)}
                                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-charcoal transition hover:bg-muted disabled:opacity-60"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => updateReason(reason.id)}
                                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
                                >
                                  {saving ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <Save className="size-4" />
                                  )}
                                  Salvar motivo
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-charcoal">
                                    {accentDisplayText(reason.label)}
                                  </p>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                      reason.active
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border-slate-200 bg-slate-50 text-slate-500"
                                    }`}
                                  >
                                    {reason.active ? "Ativo" : "Inativo"}
                                  </span>
                                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                                    Ordem {reason.sort_order}
                                  </span>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                      reason.counts_as_downtime !== false
                                        ? "border-amber-200 bg-amber-50 text-amber-800"
                                        : "border-slate-200 bg-slate-50 text-slate-500"
                                    }`}
                                  >
                                    {reason.counts_as_downtime !== false
                                      ? "Conta parada"
                                      : "Não conta parada"}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {reason.description
                                    ? accentDisplayText(reason.description)
                                    : "Sem descrição."}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 sm:justify-end">
                                <button
                                  type="button"
                                  title="Editar motivo"
                                  aria-label={`Editar motivo ${accentDisplayText(reason.label)}`}
                                  onClick={() => {
                                    setReasonDrafts((current) => ({
                                      ...current,
                                      [reason.id]: current[reason.id] ?? reasonToDraft(reason),
                                    }));
                                    setEditingReasonId(reason.id);
                                  }}
                                  className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-white text-muted-foreground transition hover:bg-muted hover:text-charcoal"
                                >
                                  <Pencil className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  title="Inativar motivo"
                                  aria-label={`Inativar motivo ${accentDisplayText(reason.label)}`}
                                  disabled={saving || !reason.active}
                                  onClick={() => inactivateReason(reason)}
                                  className="inline-flex size-9 items-center justify-center rounded-md border border-red-200 bg-white text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <UserX className="size-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                );
              })
            )}
          </PanelBody>
        </Panel>
      ) : null}

      {data.canManageReasons ? (
        <Panel>
          <PanelHeader
            title="Atividades indiretas"
            description="Cadastre atividades fora da produção direta para registrar o tempo sem apontamento de peça."
          />
          <PanelBody className="space-y-4">
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="mb-3 font-semibold text-charcoal">Nova atividade indireta</p>
              <div className="grid gap-3 lg:grid-cols-[1fr_7rem]">
                <Field label="Atividade">
                  <input
                    className={inputClass}
                    value={newIndirectReason.label}
                    onChange={(event) =>
                      setNewIndirectReason((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Ordem">
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={newIndirectReason.sortOrder}
                    onChange={(event) =>
                      setNewIndirectReason((current) => ({
                        ...current,
                        sortOrder: Number(event.target.value) || 0,
                      }))
                    }
                  />
                </Field>
              </div>
              <Field label="Descrição" className="mt-3">
                <textarea
                  className={textareaClass}
                  value={newIndirectReason.description}
                  onChange={(event) =>
                    setNewIndirectReason((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </Field>
              <button
                type="button"
                disabled={saving}
                onClick={createIndirectReason}
                className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Criar atividade
              </button>
            </div>

            {data.indirectReasons.length === 0 ? (
              <EmptyState
                icon={Clock3}
                title="Nenhuma atividade indireta cadastrada"
                description="Cadastre as opções usadas pelo operador quando estiver fora de apontamento direto."
              />
            ) : (
              <div className="grid gap-2 lg:grid-cols-2">
                {data.indirectReasons.map((reason) => {
                  const draft =
                    indirectReasonDrafts[reason.id] ?? indirectReasonToDraft(reason);
                  const editing = editingIndirectReasonId === reason.id;

                  return (
                    <article key={reason.id} className="rounded-md border border-border bg-white p-3">
                      {editing ? (
                        <div className="space-y-3">
                          <div className="grid gap-3 lg:grid-cols-[1fr_7rem]">
                            <Field label="Atividade">
                              <input
                                className={inputClass}
                                value={draft.label}
                                onChange={(event) =>
                                  setIndirectReasonDrafts((current) => ({
                                    ...current,
                                    [reason.id]: { ...draft, label: event.target.value },
                                  }))
                                }
                              />
                            </Field>
                            <Field label="Ordem">
                              <input
                                type="number"
                                min={0}
                                className={inputClass}
                                value={draft.sortOrder}
                                onChange={(event) =>
                                  setIndirectReasonDrafts((current) => ({
                                    ...current,
                                    [reason.id]: {
                                      ...draft,
                                      sortOrder: Number(event.target.value) || 0,
                                    },
                                  }))
                                }
                              />
                            </Field>
                          </div>
                          <Field label="Descrição">
                            <textarea
                              className={textareaClass}
                              value={draft.description}
                              onChange={(event) =>
                                setIndirectReasonDrafts((current) => ({
                                  ...current,
                                  [reason.id]: { ...draft, description: event.target.value },
                                }))
                              }
                            />
                          </Field>
                          <label className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                            <input
                              type="checkbox"
                              checked={draft.active}
                              onChange={(event) =>
                                setIndirectReasonDrafts((current) => ({
                                  ...current,
                                  [reason.id]: { ...draft, active: event.target.checked },
                                }))
                              }
                              className="size-4 rounded border-border"
                            />
                            Ativa
                          </label>
                          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => setEditingIndirectReasonId(null)}
                              className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-charcoal transition hover:bg-muted disabled:opacity-60"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              disabled={saving}
                              onClick={() => updateIndirectReason(reason.id)}
                              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
                            >
                              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                              Salvar atividade
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-charcoal">
                                {accentDisplayText(reason.label)}
                              </p>
                              <span
                                className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                  reason.active
                                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                    : "border-slate-200 bg-slate-50 text-slate-500"
                                }`}
                              >
                                {reason.active ? "Ativa" : "Inativa"}
                              </span>
                              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                                Ordem {reason.sort_order}
                              </span>
                            </div>
                            <p className="mt-1 text-sm text-muted-foreground">
                              {reason.description
                                ? accentDisplayText(reason.description)
                                : "Sem descrição."}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              title="Editar atividade"
                              aria-label={`Editar atividade ${accentDisplayText(reason.label)}`}
                              onClick={() => {
                                setIndirectReasonDrafts((current) => ({
                                  ...current,
                                  [reason.id]: current[reason.id] ?? indirectReasonToDraft(reason),
                                }));
                                setEditingIndirectReasonId(reason.id);
                              }}
                              className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-white text-muted-foreground transition hover:bg-muted hover:text-charcoal"
                            >
                              <Pencil className="size-4" />
                            </button>
                            <button
                              type="button"
                              title="Inativar atividade"
                              aria-label={`Inativar atividade ${accentDisplayText(reason.label)}`}
                              disabled={saving || !reason.active}
                              onClick={() => inactivateIndirectReason(reason)}
                              className="inline-flex size-9 items-center justify-center rounded-md border border-red-200 bg-white text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              <UserX className="size-4" />
                            </button>
                          </div>
                        </div>
                      )}
                    </article>
                  );
                })}
              </div>
            )}
          </PanelBody>
        </Panel>
      ) : null}

      {data.canManageRework ? (
        <Panel>
          <PanelHeader
            title="Motivos e origens de retrabalho"
            description="Padronize os motivos de retorno da obra e a origem do retrabalho para manter os indicadores limpos."
          />
          <PanelBody className="space-y-4">
            <div className="rounded-md border border-border bg-muted/20 p-3">
              <p className="mb-3 font-semibold text-charcoal">Novo cadastro de retrabalho</p>
              <div className="grid gap-3 lg:grid-cols-[12rem_1fr_7rem]">
                <Field label="Tipo">
                  <select
                    className={inputClass}
                    value={newReworkReason.kind}
                    onChange={(event) =>
                      setNewReworkReason((current) => ({
                        ...current,
                        kind: event.target.value as ReworkReasonKind,
                      }))
                    }
                  >
                    <option value="motivo">Motivo</option>
                    <option value="origem">Origem</option>
                  </select>
                </Field>
                <Field label="Nome">
                  <input
                    className={inputClass}
                    value={newReworkReason.label}
                    onChange={(event) =>
                      setNewReworkReason((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Ordem">
                  <input
                    type="number"
                    min={0}
                    className={inputClass}
                    value={newReworkReason.sortOrder}
                    onChange={(event) =>
                      setNewReworkReason((current) => ({
                        ...current,
                        sortOrder: Number(event.target.value) || 0,
                      }))
                    }
                  />
                </Field>
              </div>
              <Field label="Descrição" className="mt-3">
                <textarea
                  className={textareaClass}
                  value={newReworkReason.description}
                  onChange={(event) =>
                    setNewReworkReason((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </Field>
              <button
                type="button"
                disabled={saving}
                onClick={createReworkReason}
                className="mt-3 inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                Criar cadastro
              </button>
            </div>

            {data.reworkReasons.length === 0 ? (
              <EmptyState
                icon={MessageSquareWarning}
                title="Nenhum retrabalho cadastrado"
                description="Cadastre motivos e origens para liberar registros padronizados de retrabalho."
              />
            ) : (
              (["motivo", "origem"] as const).map((kind) => {
                const reasons = data.reworkReasons.filter((reason) => reason.kind === kind);
                if (!reasons.length) return null;

                return (
                  <div key={kind} className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-accent">
                      {reworkReasonKindLabels[kind]}
                    </p>
                    {reasons.map((reason) => {
                      const draft =
                        reworkReasonDrafts[reason.id] ?? reworkReasonToDraft(reason);
                      const editing = editingReworkReasonId === reason.id;

                      return (
                        <article key={reason.id} className="rounded-md border border-border bg-white p-3">
                          {editing ? (
                            <div className="space-y-3">
                              <div className="grid gap-3 lg:grid-cols-[12rem_1fr_7rem]">
                                <Field label="Tipo">
                                  <select
                                    className={inputClass}
                                    value={draft.kind}
                                    onChange={(event) =>
                                      setReworkReasonDrafts((current) => ({
                                        ...current,
                                        [reason.id]: {
                                          ...draft,
                                          kind: event.target.value as ReworkReasonKind,
                                        },
                                      }))
                                    }
                                  >
                                    <option value="motivo">Motivo</option>
                                    <option value="origem">Origem</option>
                                  </select>
                                </Field>
                                <Field label="Nome">
                                  <input
                                    className={inputClass}
                                    value={draft.label}
                                    onChange={(event) =>
                                      setReworkReasonDrafts((current) => ({
                                        ...current,
                                        [reason.id]: { ...draft, label: event.target.value },
                                      }))
                                    }
                                  />
                                </Field>
                                <Field label="Ordem">
                                  <input
                                    type="number"
                                    min={0}
                                    className={inputClass}
                                    value={draft.sortOrder}
                                    onChange={(event) =>
                                      setReworkReasonDrafts((current) => ({
                                        ...current,
                                        [reason.id]: {
                                          ...draft,
                                          sortOrder: Number(event.target.value) || 0,
                                        },
                                      }))
                                    }
                                  />
                                </Field>
                              </div>
                              <Field label="Descrição">
                                <textarea
                                  className={textareaClass}
                                  value={draft.description}
                                  onChange={(event) =>
                                    setReworkReasonDrafts((current) => ({
                                      ...current,
                                      [reason.id]: {
                                        ...draft,
                                        description: event.target.value,
                                      },
                                    }))
                                  }
                                />
                              </Field>
                              <label className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                                <input
                                  type="checkbox"
                                  checked={draft.active}
                                  onChange={(event) =>
                                    setReworkReasonDrafts((current) => ({
                                      ...current,
                                      [reason.id]: { ...draft, active: event.target.checked },
                                    }))
                                  }
                                  className="size-4 rounded border-border"
                                />
                                Ativo
                              </label>
                              <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => setEditingReworkReasonId(null)}
                                  className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-charcoal transition hover:bg-muted disabled:opacity-60"
                                >
                                  Cancelar
                                </button>
                                <button
                                  type="button"
                                  disabled={saving}
                                  onClick={() => updateReworkReason(reason.id)}
                                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
                                >
                                  {saving ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <Save className="size-4" />
                                  )}
                                  Salvar cadastro
                                </button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="font-semibold text-charcoal">
                                    {accentDisplayText(reason.label)}
                                  </p>
                                  <span
                                    className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${
                                      reason.active
                                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                        : "border-slate-200 bg-slate-50 text-slate-500"
                                    }`}
                                  >
                                    {reason.active ? "Ativo" : "Inativo"}
                                  </span>
                                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">
                                    Ordem {reason.sort_order}
                                  </span>
                                </div>
                                <p className="mt-1 text-sm text-muted-foreground">
                                  {reason.description
                                    ? accentDisplayText(reason.description)
                                    : "Sem descrição."}
                                </p>
                              </div>
                              <div className="flex items-center gap-2 sm:justify-end">
                                <button
                                  type="button"
                                  title="Editar cadastro"
                                  aria-label={`Editar cadastro ${accentDisplayText(reason.label)}`}
                                  onClick={() => {
                                    setReworkReasonDrafts((current) => ({
                                      ...current,
                                      [reason.id]:
                                        current[reason.id] ?? reworkReasonToDraft(reason),
                                    }));
                                    setEditingReworkReasonId(reason.id);
                                  }}
                                  className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-white text-muted-foreground transition hover:bg-muted hover:text-charcoal"
                                >
                                  <Pencil className="size-4" />
                                </button>
                                <button
                                  type="button"
                                  title="Inativar cadastro"
                                  aria-label={`Inativar cadastro ${accentDisplayText(reason.label)}`}
                                  disabled={saving || !reason.active}
                                  onClick={() => inactivateReworkReason(reason)}
                                  className="inline-flex size-9 items-center justify-center rounded-md border border-red-200 bg-white text-red-700 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50"
                                >
                                  <UserX className="size-4" />
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    })}
                  </div>
                );
              })
            )}
          </PanelBody>
        </Panel>
      ) : null}

      {operatorPanel && panelOperator && panelDraft ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-md border border-border bg-white shadow-xl">
            <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent">
                  Operador
                </p>
                <h2 className="mt-1 text-xl font-bold text-charcoal">
                  {operatorPanel.mode === "view" ? "Visualizar colaborador" : "Editar colaborador"}
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  Matrícula {accentDisplayText(panelOperator.registration)}
                </p>
              </div>
              <button
                type="button"
                title="Fechar"
                aria-label="Fechar"
                onClick={() => setOperatorPanel(null)}
                className="inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-white text-muted-foreground transition hover:bg-muted hover:text-charcoal"
              >
                <X className="size-4" />
              </button>
            </div>

            {operatorPanel.mode === "view" ? (
              <div className="space-y-5 px-5 py-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <div className="rounded-md border border-border bg-muted/20 p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Nome</p>
                    <p className="mt-1 font-semibold text-charcoal">
                      {accentDisplayText(panelOperator.name)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-muted/20 p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">
                      Matrícula
                    </p>
                    <p className="mt-1 font-semibold text-charcoal">
                      {accentDisplayText(panelOperator.registration)}
                    </p>
                  </div>
                  <div className="rounded-md border border-border bg-muted/20 p-3">
                    <p className="text-xs font-semibold uppercase text-muted-foreground">Status</p>
                    <p
                      className={`mt-1 inline-flex rounded-full border px-2 py-0.5 text-xs font-semibold ${
                        panelOperator.active
                          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                          : "border-slate-200 bg-slate-50 text-slate-500"
                      }`}
                    >
                      {panelOperator.active ? "Ativo" : "Inativo"}
                    </p>
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-charcoal">Observações</p>
                  <div className="min-h-20 rounded-md border border-border bg-muted/20 p-3 text-sm text-muted-foreground">
                    {panelOperator.notes
                      ? accentDisplayText(panelOperator.notes)
                      : "Nenhuma observação registrada."}
                  </div>
                </div>

                <div>
                  <p className="mb-2 text-sm font-semibold text-charcoal">Etapas liberadas</p>
                  <StageSummary stages={data.stages} selected={panelOperator.stage_ids ?? []} />
                </div>
              </div>
            ) : (
              <div className="space-y-4 px-5 py-4">
                <div className="grid gap-3 lg:grid-cols-3">
                  <Field label="Nome">
                    <input
                      className={inputClass}
                      value={panelDraft.name}
                      onChange={(event) =>
                        setOperatorDrafts((current) => ({
                          ...current,
                          [panelOperator.id]: { ...panelDraft, name: event.target.value },
                        }))
                      }
                    />
                  </Field>
                  <Field label="Matrícula">
                    <input
                      className={inputClass}
                      inputMode="numeric"
                      maxLength={3}
                      pattern="[0-9]{3}"
                      placeholder="000"
                      value={panelDraft.registration}
                      onChange={(event) =>
                        setOperatorDrafts((current) => ({
                          ...current,
                          [panelOperator.id]: {
                            ...panelDraft,
                            registration: normalizeOperatorRegistration(event.target.value),
                          },
                        }))
                      }
                    />
                  </Field>
                  <Field label="Nova senha/PIN">
                    <input
                      type="password"
                      className={inputClass}
                      inputMode="numeric"
                      maxLength={4}
                      pattern="[0-9]{4}"
                      value={panelDraft.pin}
                      placeholder="Manter senha atual"
                      onChange={(event) =>
                        setOperatorDrafts((current) => ({
                          ...current,
                          [panelOperator.id]: {
                            ...panelDraft,
                            pin: normalizeOperatorPin(event.target.value),
                          },
                        }))
                      }
                    />
                  </Field>
                </div>
                <Field label="Observações">
                  <textarea
                    className={textareaClass}
                    value={panelDraft.notes}
                    onChange={(event) =>
                      setOperatorDrafts((current) => ({
                        ...current,
                        [panelOperator.id]: { ...panelDraft, notes: event.target.value },
                      }))
                    }
                  />
                </Field>
                <div>
                  <p className="mb-2 text-sm font-semibold text-charcoal">Etapas liberadas</p>
                  <StageChecklist
                    stages={activeStages}
                    selected={panelDraft.stageIds}
                    onChange={(stageIds) =>
                      setOperatorDrafts((current) => ({
                        ...current,
                        [panelOperator.id]: { ...panelDraft, stageIds },
                      }))
                    }
                  />
                </div>
                <div className="flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:justify-end">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setOperatorPanel(null)}
                    className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-charcoal transition hover:bg-muted disabled:opacity-60"
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => updateOperator(panelOperator.id)}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
                  >
                    {saving ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Save className="size-4" />
                    )}
                    Salvar operador
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
