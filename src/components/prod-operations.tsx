"use client";

import { Loader2, Save } from "lucide-react";
import { type ReactNode, useActionState } from "react";
import {
  updateProdDocumentCheckAction,
  updateProdMaterialAction,
  updateProdSelectedItemAction,
  updateProdShippingAction,
  updateProdStageAction,
} from "@/app/actions";
import { Field, inputClass, textareaClass } from "@/components/action-form";
import { StatusBadge } from "@/components/badges";
import { ProdPiecesPanel } from "@/components/prod-pieces-panel";
import {
  materialConfirmationLabels,
  materialForecastLabels,
  stageStatusLabels,
} from "@/lib/labels";
import {
  MATERIAL_CONFIRMATION_STATUSES,
  MATERIAL_FORECAST_STATUSES,
  STAGE_STATUSES,
  type DocumentCheck,
  type ProdMaterial,
  type ProductionPiece,
  type ProductionPieceImport,
  type ProductionPieceRework,
  type ProductionPieceStage,
  type ProductionPointingSession,
  type ProductionPointingSessionParticipant,
  type ProductionOperator,
  type ProductionReworkReason,
  type ProductionStageTimeEntry,
  type ProdStage,
  type ProductionStage,
  type Profile,
  type SelectedItem,
  type ShippingRecord,
} from "@/lib/types";
import { POINTING_STAGE_MAX_ORDER, POINTING_STAGE_MIN_ORDER } from "@/lib/pointing";
import { cn, formatDate, formatDateTime } from "@/lib/utils";

type ActionState = {
  ok: boolean;
  message: string;
};

type StageEntry = {
  prodStage: ProdStage;
  stage: ProductionStage | null;
};

type ProdOperationsProps = {
  prodId: string;
  stages: StageEntry[];
  materials: ProdMaterial[];
  checks: DocumentCheck[];
  selectedItems: SelectedItem[];
  shipping: ShippingRecord | null;
  pieces: ProductionPiece[];
  pieceImports: ProductionPieceImport[];
  pieceStages: ProductionPieceStage[];
  operators: ProductionOperator[];
  pointingSessions: ProductionPointingSession[];
  pointingSessionParticipants: ProductionPointingSessionParticipant[];
  stageTimeEntries: ProductionStageTimeEntry[];
  reworkReasons: ProductionReworkReason[];
  pieceReworks: ProductionPieceRework[];
  serverNowIso: string;
  profiles: Profile[];
  isMaster: boolean;
  permissions: Record<string, boolean>;
};

const initialState: ActionState = {
  ok: false,
  message: "",
};

const shippingStatuses = [
  { value: "pendente", label: "Pendente" },
  { value: "em_separacao", label: "Em separação" },
  { value: "pronto_para_embarque", label: "Pronto para embarque" },
  { value: "embarcado", label: "Embarcado" },
  { value: "concluido", label: "Concluído" },
] as const;

function datetimeInputValue(value?: string | null) {
  if (!value) return "";
  return value.slice(0, 16);
}

function ActionMessage({ state }: { state: ActionState }) {
  if (!state.message) return null;

  return (
    <p className={cn("text-sm font-medium", state.ok ? "text-success" : "text-danger")}>
      {state.message}
    </p>
  );
}

function SubmitButton({ pending, label = "Salvar" }: { pending: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
      {pending ? "Salvando..." : label}
    </button>
  );
}

function OperationsSection({
  title,
  description,
  defaultOpen = false,
  children,
}: {
  title: string;
  description: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={defaultOpen} className="group rounded-md border border-border bg-white shadow-sm">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 p-4">
        <span>
          <span className="block font-semibold text-charcoal">{title}</span>
          <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
        </span>
        <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted-foreground transition group-open:bg-charcoal group-open:text-white">
          Abrir
        </span>
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}

function ReadOnlyLine({ label, value }: { label: string; value: string }) {
  return (
    <p className="text-sm text-muted-foreground">
      <span className="font-semibold text-charcoal">{label}:</span> {value}
    </p>
  );
}

function StageForm({
  entry,
  profiles,
  canEdit,
}: {
  entry: StageEntry;
  profiles: Profile[];
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateProdStageAction, initialState);

  if (!canEdit) {
    const responsible = profiles.find((profile) => profile.id === entry.prodStage.owner_profile_id);
    return (
      <article className="rounded-md border border-border bg-white p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-charcoal">{entry.stage?.name ?? "Etapa"}</p>
            <ReadOnlyLine label="Responsável" value={responsible?.name ?? "Não definido"} />
            <ReadOnlyLine label="Previsto" value={formatDate(entry.prodStage.planned_date)} />
          </div>
          <StatusBadge status={entry.prodStage.status} type="stage" />
        </div>
        {entry.prodStage.blockers ? (
          <p className="mt-2 text-sm text-danger">{entry.prodStage.blockers}</p>
        ) : null}
      </article>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-border bg-white p-3">
      <input type="hidden" name="id" value={entry.prodStage.id} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="font-semibold text-charcoal">{entry.stage?.name ?? "Etapa"}</p>
          {entry.stage?.description ? (
            <p className="text-sm text-muted-foreground">{entry.stage.description}</p>
          ) : null}
        </div>
        <StatusBadge status={entry.prodStage.status} type="stage" />
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Status">
          <select name="status" className={inputClass} defaultValue={entry.prodStage.status}>
            {STAGE_STATUSES.map((status) => (
              <option key={status} value={status}>
                {stageStatusLabels[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Responsável">
          <select
            name="owner_profile_id"
            className={inputClass}
            defaultValue={entry.prodStage.owner_profile_id ?? ""}
          >
            <option value="">Sem responsável</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Previsão">
          <input
            name="planned_date"
            type="date"
            className={inputClass}
            defaultValue={entry.prodStage.planned_date ?? ""}
          />
        </Field>
      </div>
      <Field label="Pendências">
        <textarea
          name="blockers"
          className={textareaClass}
          defaultValue={entry.prodStage.blockers ?? ""}
        />
      </Field>
      <Field label="Observações">
        <textarea name="notes" className={textareaClass} defaultValue={entry.prodStage.notes ?? ""} />
      </Field>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton pending={pending} />
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function MaterialForm({ material, canEdit }: { material: ProdMaterial; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(updateProdMaterialAction, initialState);

  if (!canEdit) {
    return (
      <article className="rounded-md border border-border bg-white p-3">
        <p className="font-semibold capitalize text-charcoal">{material.group}</p>
        <ReadOnlyLine
          label="Previsão"
          value={materialForecastLabels[material.forecast_status]}
        />
        <ReadOnlyLine
          label="Confirmação"
          value={materialConfirmationLabels[material.confirmation_status]}
        />
        <ReadOnlyLine label="Localização" value={material.location ?? "Não informada"} />
        {material.blockers ? <p className="mt-2 text-sm text-danger">{material.blockers}</p> : null}
      </article>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-border bg-white p-3">
      <input type="hidden" name="id" value={material.id} />
      <p className="font-semibold capitalize text-charcoal">{material.group}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Previsão de material">
          <select name="forecast_status" className={inputClass} defaultValue={material.forecast_status}>
            {MATERIAL_FORECAST_STATUSES.map((status) => (
              <option key={status} value={status}>
                {materialForecastLabels[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Disponibilidade prevista">
          <input
            name="availability_forecast"
            type="date"
            className={inputClass}
            defaultValue={material.availability_forecast ?? ""}
          />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Confirmação">
          <select
            name="confirmation_status"
            className={inputClass}
            defaultValue={material.confirmation_status}
          >
            {MATERIAL_CONFIRMATION_STATUSES.map((status) => (
              <option key={status} value={status}>
                {materialConfirmationLabels[status]}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Localização">
          <input name="location" className={inputClass} defaultValue={material.location ?? ""} />
        </Field>
      </div>
      <Field label="Pendências">
        <textarea name="blockers" className={textareaClass} defaultValue={material.blockers ?? ""} />
      </Field>
      <Field label="Observações">
        <textarea name="notes" className={textareaClass} defaultValue={material.notes ?? ""} />
      </Field>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton pending={pending} />
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function DocumentCheckForm({ check, canEdit }: { check: DocumentCheck; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(updateProdDocumentCheckAction, initialState);

  if (!canEdit) {
    return (
      <article className="rounded-md border border-border bg-white p-3">
        <p className="font-semibold text-charcoal">{check.label}</p>
        <ReadOnlyLine
          label="Status"
          value={`${check.checked ? "Recebido" : "Pendente"} · ${formatDateTime(check.checked_at)}`}
        />
        {check.notes ? <p className="mt-2 text-sm text-muted-foreground">{check.notes}</p> : null}
      </article>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-border bg-white p-3">
      <input type="hidden" name="id" value={check.id} />
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          name="checked"
          defaultChecked={check.checked}
          className="mt-1 size-4 rounded border-border"
        />
        <span>
          <span className="block font-semibold text-charcoal">{check.label}</span>
          <span className="block text-sm text-muted-foreground">
            {check.checked ? "Recebido" : "Pendente"} · {formatDateTime(check.checked_at)}
          </span>
        </span>
      </label>
      <Field label="Observações">
        <textarea name="notes" className={textareaClass} defaultValue={check.notes ?? ""} />
      </Field>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton pending={pending} />
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function SelectedItemForm({ item, canEdit }: { item: SelectedItem; canEdit: boolean }) {
  const [state, formAction, pending] = useActionState(updateProdSelectedItemAction, initialState);

  if (!canEdit) {
    return (
      <article className="rounded-md border border-border bg-white p-3">
        <p className="font-semibold text-charcoal">{item.item_name}</p>
        <ReadOnlyLine label="Quantidade" value={item.quantity?.toString() ?? "Opcional"} />
        <ReadOnlyLine label="Localização" value={item.location ?? "Não informada"} />
        <ReadOnlyLine label="Retirado" value={item.withdrawn ? "Sim" : "Não"} />
        <ReadOnlyLine label="Embalado" value={item.packed ? "Sim" : "Não"} />
      </article>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-border bg-white p-3">
      <input type="hidden" name="id" value={item.id} />
      <p className="font-semibold text-charcoal">{item.item_name}</p>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Quantidade">
          <input
            name="quantity"
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            defaultValue={item.quantity ?? ""}
          />
        </Field>
        <Field label="Localização">
          <input name="location" className={inputClass} defaultValue={item.location ?? ""} />
        </Field>
        <Field label="Data do evento">
          <input name="event_date" type="date" className={inputClass} defaultValue={item.event_date ?? ""} />
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-charcoal">
          <input
            type="checkbox"
            name="selected"
            defaultChecked={item.selected}
            className="size-4 rounded border-border"
          />
          Selecionado
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-charcoal">
          <input
            type="checkbox"
            name="withdrawn"
            defaultChecked={item.withdrawn}
            className="size-4 rounded border-border"
          />
          Retirado
        </label>
        <label className="flex min-h-11 items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-charcoal">
          <input
            type="checkbox"
            name="packed"
            defaultChecked={item.packed}
            className="size-4 rounded border-border"
          />
          Embalado
        </label>
      </div>
      <Field label="Observações">
        <textarea name="notes" className={textareaClass} defaultValue={item.notes ?? ""} />
      </Field>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton pending={pending} />
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

function ShippingForm({
  prodId,
  shipping,
  canEdit,
}: {
  prodId: string;
  shipping: ShippingRecord | null;
  canEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(updateProdShippingAction, initialState);

  if (!canEdit) {
    if (!shipping) {
      return <p className="text-sm text-muted-foreground">Sem registro de expedição.</p>;
    }

    return (
      <article className="rounded-md border border-border bg-white p-3">
        <p className="font-semibold text-charcoal">
          {shipping.shipping_location ?? "Sem localização"}
        </p>
        <ReadOnlyLine label="Entrada" value={formatDateTime(shipping.entered_at)} />
        <ReadOnlyLine label="Saída prevista" value={formatDateTime(shipping.planned_departure)} />
        <ReadOnlyLine label="Saída real" value={formatDateTime(shipping.actual_departure)} />
        <ReadOnlyLine label="Status" value={shipping.status} />
      </article>
    );
  }

  return (
    <form action={formAction} className="space-y-3 rounded-md border border-border bg-white p-3">
      <input type="hidden" name="prod_id" value={prodId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Local de expedição">
          <input
            name="shipping_location"
            className={inputClass}
            defaultValue={shipping?.shipping_location ?? ""}
          />
        </Field>
        <Field label="Status">
          <select name="status" className={inputClass} defaultValue={shipping?.status ?? "pendente"}>
            {shippingStatuses.map((status) => (
              <option key={status.value} value={status.value}>
                {status.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Entrada">
          <input
            name="entered_at"
            type="datetime-local"
            className={inputClass}
            defaultValue={datetimeInputValue(shipping?.entered_at)}
          />
        </Field>
        <Field label="Saída prevista">
          <input
            name="planned_departure"
            type="datetime-local"
            className={inputClass}
            defaultValue={datetimeInputValue(shipping?.planned_departure)}
          />
        </Field>
        <Field label="Saída real">
          <input
            name="actual_departure"
            type="datetime-local"
            className={inputClass}
            defaultValue={datetimeInputValue(shipping?.actual_departure)}
          />
        </Field>
      </div>
      <Field label="Observações">
        <textarea name="notes" className={textareaClass} defaultValue={shipping?.notes ?? ""} />
      </Field>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <SubmitButton pending={pending} />
        <ActionMessage state={state} />
      </div>
    </form>
  );
}

export function ProdOperations({
  prodId,
  stages,
  materials,
  checks,
  selectedItems,
  shipping,
  pieces,
  pieceImports,
  pieceStages,
  operators,
  pointingSessions,
  pointingSessionParticipants,
  stageTimeEntries,
  reworkReasons,
  pieceReworks,
  serverNowIso,
  profiles,
  isMaster,
  permissions,
}: ProdOperationsProps) {
  const can = (permission: string) => isMaster || Boolean(permissions[permission]);
  const canEditMaterials =
    can("production.materials.forecast") ||
    can("production.materials.confirm") ||
    can("production.materials.update_location");
  const canEditItems =
    can("production.machining.manage") ||
    can("production.preparation_assembly.manage") ||
    can("production.packaging.manage");
  const macroStages = stages.filter(
    (entry) =>
      !entry.stage ||
      entry.stage.sort_order < POINTING_STAGE_MIN_ORDER ||
      entry.stage.sort_order > POINTING_STAGE_MAX_ORDER,
  );

  return (
    <div className="space-y-4">
      <OperationsSection
        title="1. Peças da PROD"
        description="Importe, confira, edite, libere e acompanhe as peças do lote."
        defaultOpen
      >
        <ProdPiecesPanel
          prodId={prodId}
          stages={stages
            .map((entry) => entry.stage)
            .filter((stage): stage is ProductionStage => Boolean(stage))}
          serverNowIso={serverNowIso}
          pieces={pieces}
          imports={pieceImports}
          pieceStages={pieceStages}
          operators={operators}
          pointingSessions={pointingSessions}
          pointingSessionParticipants={pointingSessionParticipants}
          stageTimeEntries={stageTimeEntries}
          reworkReasons={reworkReasons}
          pieceReworks={pieceReworks}
          canImport={can("production.prods.import_pieces")}
          canManage={can("production.prods.manage_pieces")}
          canReleaseProduction={can("production.prods.release_to_production")}
          canViewRework={can("production.rework.view") || can("production.rework.manage")}
          canManageRework={can("production.rework.manage")}
          canUpdateStages={can("production.prods.update_stage")}
          canAdjustTime={can("production.pointing.adjust_time")}
        />
      </OperationsSection>

      <OperationsSection
        title="2. Acompanhamento macro"
        description="Controle previsões e status que pertencem ao lote inteiro, antes do apontamento por peça."
      >
        <div className="grid gap-3 xl:grid-cols-2">
          {macroStages.map((entry) => (
            <StageForm
              key={entry.prodStage.id}
              entry={entry}
              profiles={profiles}
              canEdit={
                can("production.prods.update_stage") ||
                Boolean(entry.stage?.required_permission && can(entry.stage.required_permission))
              }
            />
          ))}
        </div>
      </OperationsSection>

      <OperationsSection
        title="3. Materiais"
        description="Previsão, confirmação, localização e pendências dos materiais da PROD."
      >
        <div className="grid gap-3 xl:grid-cols-2">
          {materials.map((material) => (
            <MaterialForm key={material.id} material={material} canEdit={canEditMaterials} />
          ))}
        </div>
      </OperationsSection>

      <OperationsSection
        title="4. Listas e ordens"
        description="Conferência documental do lote de produção."
      >
        <div className="grid gap-3 xl:grid-cols-2">
          {checks.map((check) => (
            <DocumentCheckForm
              key={check.id}
              check={check}
              canEdit={can("production.documents.manage")}
            />
          ))}
        </div>
      </OperationsSection>

      <OperationsSection
        title="5. Itens selecionados e expedição"
        description="Apoio de separação e dados gerais de expedição vinculados ao lote."
      >
        <div className="grid gap-4 xl:grid-cols-2">
          <div className="space-y-3">
            <h3 className="text-base font-semibold text-charcoal">Itens selecionados</h3>
            {selectedItems.map((item) => (
              <SelectedItemForm key={item.id} item={item} canEdit={canEditItems} />
            ))}
          </div>

          <div className="space-y-3">
            <h3 className="text-base font-semibold text-charcoal">Expedição</h3>
            <ShippingForm
              prodId={prodId}
              shipping={shipping}
              canEdit={can("production.shipping.manage")}
            />
          </div>
        </div>
      </OperationsSection>
    </div>
  );
}
