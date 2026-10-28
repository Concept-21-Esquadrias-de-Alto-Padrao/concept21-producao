"use client";

import { LifecycleBadge } from "./lifecycle-panel";
import { MANUAL_PROD_STATUSES } from "@/lib/prod-progress";

import { ActionFeedback } from "@/components/floating-feedback";

import { Eye, Loader2, Pencil, Save, Trash2, X } from "lucide-react";
import Link from "next/link";
import { useActionState, useEffect, useState } from "react";
import { deleteProdAction, updateProdAction } from "@/app/actions";
import { Field, inputClass, textareaClass } from "@/components/action-form";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { ProdDateFields } from "@/components/prod-date-fields";
import { ProdIdentity } from "@/components/prod-identity";
import { priorityLabels, prodStatusLabels } from "@/lib/labels";
import {
  PRIORITIES,
  type ProdMaterial,
  type ProductionContract,
  type ProductionStage,
  type Profile,
} from "@/lib/types";
import type { ProdContext } from "@/lib/production";
import { describeMaterialConfirmation } from "@/lib/production";
import { formatDate } from "@/lib/utils";

type ActionState = {
  ok: boolean;
  message: string;
};

type ProdsListProps = {
  contexts: ProdContext[];
  materials: ProdMaterial[];
  contracts: ProductionContract[];
  profiles: Profile[];
  stages: ProductionStage[];
  returnHref: string;
  canEdit: boolean;
  canDelete: boolean;
};

const initialState: ActionState = {
  ok: false,
  message: "",
};

function ProdEditForm({
  context,
  contracts,
  profiles,
  stages,
  onCancel,
  onSaved,
}: {
  context: ProdContext;
  contracts: ProductionContract[];
  profiles: Profile[];
  stages: ProductionStage[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateProdAction, initialState);

  useEffect(() => {
    if (!state.ok) return;

    const timeout = window.setTimeout(onSaved, 0);
    return () => window.clearTimeout(timeout);
  }, [onSaved, state.ok]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={context.prod.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Contrato">
          <select
            name="contract_id"
            className={inputClass}
            defaultValue={context.prod.contract_id}
            required
          >
            {contracts.map((contract) => (
              <option key={contract.id} value={contract.id}>
                {contract.contract_number} - {contract.work_name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Número da PROD">
          <input
            name="prod_number"
            type="text"
            maxLength={50}
            className={inputClass}
            defaultValue={context.prod.prod_number}
            required
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Responsável">
          <select
            name="owner_profile_id"
            className={inputClass}
            defaultValue={context.prod.owner_profile_id ?? ""}
          >
            <option value="">Sem responsável</option>
            {profiles.map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Prioridade">
          <select name="priority" className={inputClass} defaultValue={context.prod.priority}>
            {PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {priorityLabels[priority]}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <ProdDateFields
        defaultPlannedEndDate={context.prod.planned_end_date}
        defaultDeliveryForecast={context.prod.delivery_forecast}
      />

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Início real">
          <input
            name="actual_start_date"
            type="date"
            className={inputClass}
            defaultValue={context.prod.actual_start_date ?? ""}
          />
        </Field>
        <Field label="Conclusão na Produção (automática)">
          <input
            readOnly
            type="date"
            className={inputClass}
            defaultValue={context.prod.actual_end_date ?? ""}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Etapa atual">
          <select
            name="current_stage_id"
            className={inputClass}
            defaultValue={context.prod.current_stage_id ?? ""}
          >
            <option value="">Sem etapa</option>
            {context.prod.current_stage_id && !stages.some((stage) => stage.id === context.prod.current_stage_id) && (
              <option value={context.prod.current_stage_id}>Etapa externa (legado)</option>
            )}
            {stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status geral">
          {context.prod.status_origin !== "manual" ? (
            <>
              <output className="block rounded-md border border-border bg-muted px-3 py-2 text-sm">{prodStatusLabels[context.prod.status]} · {context.prod.status_origin === "automatico" ? "calculado pelos apontamentos" : "registro anterior"}</output>
              {context.prod.status_origin !== "historico" && <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" name="pause_prod" value="yes" />Pausar a PROD inteira (exige motivo e apontamentos parados)</label>}
            </>
          ) : (
            <select name="status" className={inputClass} defaultValue={context.prod.status}>
              {MANUAL_PROD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {prodStatusLabels[status]}
                </option>
              ))}
            </select>
          )}
        </Field>
      </div>

      <Field label="Descrição">
        <textarea
          name="description"
          className={textareaClass}
          defaultValue={context.prod.description ?? ""}
        />
      </Field>
      <Field label="Observações (motivo obrigatório ao pausar a PROD)">
        <textarea name="notes" className={textareaClass} defaultValue={context.prod.notes ?? ""} />
      </Field>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {pending ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-charcoal transition hover:border-orange-200 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="size-4" />
            Cancelar
          </button>
        </div>
        <ActionFeedback state={state} />
      </div>
    </form>
  );
}

function ProdDeleteForm({ context }: { context: ProdContext }) {
  const [state, formAction, pending] = useActionState(deleteProdAction, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Excluir a PROD ${context.prod.prod_number} de ${context.client.name}? Esta ação é restrita ao Administrador e não pode ser desfeita.`,
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="id" value={context.prod.id} />
      <button
        type="submit"
        title="Excluir PROD"
        disabled={pending}
        className="grid size-9 place-items-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function ProdsList({
  contexts,
  materials,
  contracts,
  profiles,
  stages,
  returnHref,
  canEdit,
  canDelete,
}: ProdsListProps) {
  const [editingProdId, setEditingProdId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {contexts.map((context) => {
        const editing = editingProdId === context.prod.id;
        const prodMaterials = materials.filter((material) => material.prod_id === context.prod.id);

        return (
          <article key={context.prod.id} className="rounded-md border border-border bg-white p-3">
            {editing ? (
              <ProdEditForm
                context={context}
                contracts={contracts}
                profiles={profiles}
                stages={stages}
                onCancel={() => setEditingProdId(null)}
                onSaved={() => setEditingProdId(null)}
              />
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <ProdIdentity
                      client={context.client}
                      contract={context.contract}
                      prod={context.prod}
                      compact
                    />
                    <p className="mt-1 text-sm text-muted-foreground">
                      {context.currentStage?.name ?? "Sem etapa"} · Entrega{" "}
                      {formatDate(context.prod.delivery_forecast)}
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-start justify-end gap-2">
                    <LifecycleBadge item={context.prod} />
                    <PriorityBadge priority={context.prod.priority} />
                    <StatusBadge status={context.prod.status} />
                    <Link
                      href={`/prods/${context.prod.id}?returnTo=${encodeURIComponent(returnHref)}`}
                      title="Abrir PROD"
                      className="grid size-9 place-items-center rounded-md border border-border text-zinc-600 transition hover:border-orange-200 hover:text-accent"
                    >
                      <Eye className="size-4" />
                    </Link>
                    {canEdit ? (
                      <button
                        type="button"
                        title="Editar PROD"
                        onClick={() => setEditingProdId(context.prod.id)}
                        className="grid size-9 place-items-center rounded-md border border-border text-zinc-600 transition hover:border-orange-200 hover:text-accent"
                      >
                        <Pencil className="size-4" />
                      </button>
                    ) : null}
                    {canDelete ? <ProdDeleteForm context={context} /> : null}
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {prodMaterials.map((material) => (
                    <span
                      key={material.id}
                      className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground"
                    >
                      {material.group}: {describeMaterialConfirmation(material.confirmation_status)}
                    </span>
                  ))}
                </div>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
