"use client";

import { ActionFeedback, FieldFeedback, useActionFeedback } from "@/components/floating-feedback";

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Loader2,
  PackageCheck,
} from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  completeExpeditionLoadControlAction,
  saveExpeditionLoadControlAction,
  pointProductionPiecesAction,
} from "@/app/actions";
import { Field, inputClass, textareaClass } from "@/components/action-form";
import { StatusBadge } from "@/components/badges";
import { EmptyState } from "@/components/empty-state";
import { SelectionToolbar } from "@/components/selection-toolbar";
import { FloatingDialog } from "@/components/floating-dialog";
import {
  buildExpeditionRomaneioReport,
  LOAD_CONTROL_ITEMS,
  pieceDimensions,
} from "@/lib/expedition";
import type {
  Client,
  ProductionContract,
  ProductionPiece,
  ProductionPieceStage,
  ProductionProd,
} from "@/lib/types";
import { accentDisplayText, cn } from "@/lib/utils";

type ActionState = {
  ok: boolean;
  message: string;
};

type ExpeditionLoadControlPanelProps = {
  clients: Client[];
  contracts: ProductionContract[];
  prods: ProductionProd[];
  pieces: ProductionPiece[];
  stageRows: ProductionPieceStage[];
  openRows: ProductionPieceStage[];
  canPerform: boolean;
  canViewProds: boolean;
  canRollback: boolean;
};

const initialState: ActionState = {
  ok: false,
  message: "",
};

function ActionMessage({ state }: { state: ActionState }) {
  return <ActionFeedback state={state} />;
}

function VolumeStepper({
  name,
  defaultValue,
  disabled,
}: {
  name: string;
  defaultValue: number;
  disabled: boolean;
}) {
  const [value, setValue] = useState(Math.max(0, Math.trunc(defaultValue || 0)));

  return (
    <div className="inline-grid grid-cols-[3.25rem_1.75rem] overflow-hidden rounded-md border border-border bg-white">
      <input type="hidden" name={name} value={value} />
      <div className="grid place-items-center text-base font-semibold text-charcoal">{value}</div>
      <div className="grid border-l border-border">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setValue((current) => current + 1)}
          className="grid h-6 place-items-center text-muted-foreground transition hover:bg-muted hover:text-charcoal disabled:opacity-50"
          aria-label="Aumentar volumes"
        >
          <ChevronUp className="size-4" />
        </button>
        <button
          type="button"
          disabled={disabled || value <= 0}
          onClick={() => setValue((current) => Math.max(0, current - 1))}
          className="grid h-6 place-items-center border-t border-border text-muted-foreground transition hover:bg-muted hover:text-charcoal disabled:opacity-50"
          aria-label="Diminuir volumes"
        >
          <ChevronDown className="size-4" />
        </button>
      </div>
    </div>
  );
}

export function ExpeditionLoadControlPanel({
  clients,
  contracts,
  prods,
  pieces,
  stageRows,
  openRows,
  canPerform,
  canViewProds,
  canRollback,
}: ExpeditionLoadControlPanelProps) {
  const router = useRouter();
  const [returning, setReturning] = useState(false);
  const [rollbackState, rollbackAction, rollbackPending] = useActionState(pointProductionPiecesAction, initialState);
  useActionFeedback(rollbackState);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [expandedGroupIds, setExpandedGroupIds] = useState<Set<string>>(new Set());
  const [expandedPieceIds, setExpandedPieceIds] = useState<Set<string>>(new Set());
  const [saveState, saveAction, savePending] = useActionState(
    saveExpeditionLoadControlAction,
    initialState,
  );
  const [completeState, completeAction, completePending] = useActionState(
    completeExpeditionLoadControlAction,
    initialState,
  );
  useActionFeedback(completeState);
  const actionPending = returning ? rollbackPending : completePending;
  const actionLabel = returning ? "Voltar para Embalagem" : "Concluir preparação da carga";
  useEffect(() => {
    if (!rollbackState.ok) return;
    const timer = window.setTimeout(() => {
      setSelectedIds(new Set());
      setConfirmOpen(false);
      router.refresh();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [rollbackState, router]);
  const clientById = useMemo(() => new Map(clients.map((client) => [client.id, client])), [clients]);
  const contractById = useMemo(
    () => new Map(contracts.map((contract) => [contract.id, contract])),
    [contracts],
  );
  const prodById = useMemo(() => new Map(prods.map((prod) => [prod.id, prod])), [prods]);
  const pieceById = useMemo(() => new Map(pieces.map((piece) => [piece.id, piece])), [pieces]);
  const selectedJson = JSON.stringify(Array.from(selectedIds));
  const openRowIds = useMemo(() => new Set(openRows.map((row) => row.id)), [openRows]);

  const groupedRows = useMemo(() => {
    const groups = new Map<string, ProductionPieceStage[]>();

    for (const row of stageRows.filter((stageRow) => openRowIds.has(stageRow.id))) {
      const rows = groups.get(row.prod_id) ?? [];
      rows.push(row);
      groups.set(row.prod_id, rows);
    }

    return Array.from(groups.entries()).map(([prodId, rows]) => {
      const prod = prodById.get(prodId) ?? null;
      const contract = prod ? contractById.get(prod.contract_id) ?? null : null;
      const client = contract ? clientById.get(contract.client_id) ?? null : null;
      const groupPieces = rows
        .map((row) => pieceById.get(row.piece_id))
        .filter((piece): piece is ProductionPiece => Boolean(piece));
      const report =
        prod && contract && client
          ? buildExpeditionRomaneioReport({
              client,
              contract,
              prod,
              pieces: groupPieces,
              pieceStages: rows,
            })
          : null;

      return { prodId, prod, contract, client, rows, report };
    });
  }, [clientById, contractById, openRowIds, pieceById, prodById, stageRows]);
  const visibleOpenRows = useMemo(
    () =>
      groupedRows.flatMap((group) =>
        expandedGroupIds.has(group.prodId) ? group.rows : [],
      ),
    [expandedGroupIds, groupedRows],
  );

  useEffect(() => {
    if (saveState.ok) router.refresh();
  }, [saveState, router]);

  useEffect(() => {
    if (!completeState.ok) return;
    const timeout = window.setTimeout(() => {
      setSelectedIds(new Set());
      setConfirmOpen(false);
      router.refresh();
    }, 0);
    return () => window.clearTimeout(timeout);
  }, [completeState, router]);

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

  function toggleAllVisible() {
    const ids = visibleOpenRows.map((row) => row.id);
    const allSelected = ids.length > 0 && ids.every((id) => selectedIds.has(id));
    setSelectedIds(allSelected ? new Set() : new Set(ids));
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
    setExpandedPieceIds((current) => new Set([...current].filter((id) => !rowIdSet.has(id))));
  }

  function togglePieceExpanded(id: string) {
    setExpandedPieceIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  if (openRows.length === 0) {
    return (
      <EmptyState
        icon={PackageCheck}
        title="Nenhuma peça aberta em expedição"
        description="Peças finalizadas saem da fila operacional. O histórico permanece disponível nos relatórios."
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
        A expedição não usa cronômetro. Preencha o controle de carga, salve os volumes e finalize a
        expedição com matrícula e senha do operador.
      </div>

      <form action={saveAction} className="space-y-4">
<div className="flex flex-wrap gap-2">            <button
              type="button"
              onClick={toggleAllVisible}
              disabled={!visibleOpenRows.length}
              className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-charcoal transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {visibleOpenRows.length > 0 && visibleOpenRows.every((row) => selectedIds.has(row.id))
                ? "Limpar seleção"
                : "Selecionar visíveis"}
            </button>
            <button
              type="submit"
              disabled={!canPerform || savePending || !visibleOpenRows.length}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {savePending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ClipboardList className="size-4" />
              )}
              Salvar controle
            </button>
</div>
<SelectionToolbar active={selectedIds.size > 0} label="Ações de expedição">          <div>
            <p className="font-semibold text-charcoal">Controle de carga</p>
            <p className="text-sm text-muted-foreground">
              {selectedIds.size} peça(s) selecionada(s) · {openRows.length} disponível(is).
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => setSelectedIds(new Set())} disabled={!selectedIds.size} className="min-h-11 rounded border border-border px-3 py-2 text-sm disabled:opacity-50">Limpar</button>
            <button type="button" disabled={!canPerform || !selectedIds.size || savePending} onClick={() => { setReturning(false); setConfirmOpen(true); }} className="min-h-11 rounded bg-charcoal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Concluir preparação da carga</button>
            <button type="button" disabled={!canRollback || !selectedIds.size || savePending} onClick={() => { setReturning(true); setConfirmOpen(true); }} className="min-h-11 rounded border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50">Voltar etapa</button>
          </div>
</SelectionToolbar>
        <ActionMessage state={saveState} />

        {groupedRows.map((group) => {
          const openGroupRows = group.rows.filter((row) =>
            openRows.some((openRow) => openRow.id === row.id),
          );

          const expanded = expandedGroupIds.has(group.prodId);
          const selectedCount = group.rows.filter((row) => selectedIds.has(row.id)).length;
          const GroupIcon = expanded ? ChevronDown : ChevronRight;

          return (
            <section key={group.prodId} className="overflow-hidden rounded-md border border-border bg-white">
              <div className="flex flex-col gap-3 border-b border-border p-3 lg:flex-row lg:items-center lg:justify-between">
                <button
                  type="button"
                  onClick={() =>
                    toggleGroupExpanded(
                      group.prodId,
                      group.rows.map((row) => row.id),
                    )
                  }
                  aria-expanded={expanded}
                  className="flex min-w-0 flex-1 items-start gap-3 text-left"
                >
                  <span className="mt-1 inline-flex size-7 flex-none items-center justify-center rounded-md border border-border bg-white text-muted-foreground">
                    <GroupIcon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-charcoal">
                      {group.client?.name ?? "Cliente"} - Contrato{" "}
                      {group.contract?.contract_number ?? "-"} - PROD {group.prod?.prod_number ?? "-"}
                    </span>
                    <span className="mt-1 block text-sm text-muted-foreground">
                      {group.contract?.work_name ?? "Obra não informada"}
                    </span>
                    <span className="mt-2 flex flex-wrap items-center gap-2 text-xs font-semibold">
                      <span className="rounded-full bg-muted px-2 py-1 text-muted-foreground">
                        {openGroupRows.length} peça(s) aberta(s)
                      </span>
                      {selectedCount ? (
                        <span className="rounded-full bg-orange-50 px-2 py-1 text-accent ring-1 ring-orange-200">
                          {selectedCount} selecionada(s)
                        </span>
                      ) : null}
                    </span>
                  </span>
                </button>
                {canViewProds && group.report?.rows.length ? <Link href={`/prods/${group.prodId}#romaneios`} className="inline-flex min-h-10 items-center justify-center rounded-md bg-charcoal px-4 py-2 text-sm font-semibold text-white hover:bg-black">Emitir romaneio numerado</Link> : null}
              </div>

              {expanded ? (
                openGroupRows.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">
                    Não há peças abertas para controle nesta PROD. O romaneio pode ser gerado se já
                    houver volumes salvos.
                  </p>
                ) : (
                  <div className="space-y-3 p-3">
                  {openGroupRows.map((pieceStage) => {
                    const piece = pieceById.get(pieceStage.piece_id);
                    const loadChecklist = pieceStage.load_checklist ?? {};
                    const expandedPiece = expandedPieceIds.has(pieceStage.id);
                    const PieceIcon = expandedPiece ? ChevronDown : ChevronRight;
                    const checkedLoadItems = LOAD_CONTROL_ITEMS.filter((item) =>
                      Boolean(loadChecklist[item.key]?.checked),
                    ).length;

                    return (
                      <article
                        key={pieceStage.id}
                        className={cn(
                          "rounded-md border bg-muted/20 p-3",
                          selectedIds.has(pieceStage.id) ? "border-accent" : "border-border",
                        )}
                      >
                        <input type="hidden" name="piece_stage_id" value={pieceStage.id} />
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div className="flex min-w-0 items-start gap-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(pieceStage.id)}
                              onChange={() => toggleSelected(pieceStage.id)}
                              aria-label={`Selecionar peça ${piece?.piece_code ?? ""}`.trim()}
                              className="mt-1 size-5 rounded border-border"
                            />
                            <button
                              type="button"
                              onClick={() => togglePieceExpanded(pieceStage.id)}
                              aria-expanded={expandedPiece}
                              className="flex min-w-0 flex-1 items-start gap-2 text-left"
                            >
                              <span className="mt-0.5 inline-flex size-7 flex-none items-center justify-center rounded-md border border-border bg-white text-muted-foreground">
                                <PieceIcon className="size-4" />
                              </span>
                              <span className="min-w-0">
                                <span className="flex flex-wrap items-center gap-2">
                                  <span className="font-semibold text-charcoal">
                                    {piece?.piece_code ?? "Peça"}
                                  </span>
                                  <StatusBadge status={pieceStage.status} type="stage" />
                                  {!expandedPiece ? (
                                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-muted-foreground ring-1 ring-border">
                                      {checkedLoadItems === 1
                                        ? "1 conferência marcada"
                                        : `${checkedLoadItems} conferências marcadas`}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="mt-1 block text-sm text-muted-foreground">
                                  {piece?.system_code ?? "Sistema não informado"} ·{" "}
                                  {piece?.system_description ?? "Descrição não informada"}
                                </span>
                                <span className="mt-1 block text-xs text-muted-foreground">
                                  Local: {piece?.location ?? "Não informado"} · Qtd.:{" "}
                                  {piece?.quantity ?? 1} · {piece ? pieceDimensions(piece) : "-"}
                                </span>
                              </span>
                            </button>
                          </div>
                          <div className="flex items-center gap-3 self-start">
                            <span className="text-sm font-semibold text-charcoal">Volumes</span>
                            <VolumeStepper
                              name={`volume_${pieceStage.id}`}
                              defaultValue={pieceStage.load_volume_count}
                              disabled={!canPerform || savePending}
                            />
                          </div>
                        </div>

                        {!expandedPiece ? (
                          <p className="mt-3 rounded-md border border-dashed border-border bg-white px-3 py-2 text-xs text-muted-foreground">
                            Clique na peça para abrir os itens de conferência.
                          </p>
                        ) : null}

                        <div
                          className={cn(
                            "mt-3 gap-2 md:grid-cols-2",
                            expandedPiece ? "grid" : "hidden",
                          )}
                        >
                          {LOAD_CONTROL_ITEMS.map((item) => {
                            const value = loadChecklist[item.key];
                            return (
                              <div
                                key={item.key}
                                className="rounded-md border border-border bg-white p-2"
                              >
                                <label className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                                  <input
                                    type="checkbox"
                                    name={`load_${pieceStage.id}_${item.key}`}
                                    defaultChecked={Boolean(value?.checked)}
                                    disabled={!canPerform || savePending}
                                    className="size-4 rounded border-border"
                                  />
                                  {item.label}
                                </label>
                                <input
                                  name={`load_note_${pieceStage.id}_${item.key}`}
                                  defaultValue={accentDisplayText(value?.notes ?? "")}
                                  disabled={!canPerform || savePending}
                                  placeholder="Observação"
                                  className="mt-2 min-h-9 w-full rounded-md border border-border bg-white px-2 text-xs text-charcoal outline-none transition placeholder:text-muted-foreground focus:border-accent"
                                />
                              </div>
                            );
                          })}
                        </div>
                      </article>
                    );
                  })}
                  </div>
                )
              ) : null}
            </section>
          );
        })}
      </form>

      {confirmOpen && <FloatingDialog title={`${actionLabel} (${selectedIds.size} peças)`} busy={actionPending} onClose={() => setConfirmOpen(false)}>
      <form action={returning ? rollbackAction : completeAction} className="rounded-md border border-border bg-white p-3">
        {returning && <input type="hidden" name="action_type" value="retornar" />}
        <input type="hidden" name="piece_stage_ids_json" value={selectedJson} />
        <div className="mb-3">
          <p className="font-semibold text-charcoal">
            {actionLabel} ({selectedIds.size} peça(s))
          </p>
          <p className="text-sm text-muted-foreground">
            {returning ? "A Embalagem será reaberta com o tempo zerado. A peça sairá da fila da Expedição até concluir a Embalagem novamente. O histórico de apontamentos será mantido." : "Finaliza a etapa sem cronômetro e mantém a conclusão vinculada ao operador informado."}
          </p>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <FieldFeedback state={returning ? rollbackState : completeState} />
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
        {returning && <Field label="Motivo do retorno" className="mt-3"><textarea name="pause_reason" className={textareaClass} required /></Field>}
        <Field label="Observações" className="mt-3">
          <textarea name="notes" className={textareaClass} />
        </Field>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <button
            type="submit"
            disabled={!(returning ? canRollback : canPerform) || actionPending || selectedIds.size === 0}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-charcoal px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {actionPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {actionLabel}
          </button>

        </div>
      </form>
      </FloatingDialog>}
    </div>
  );
}
