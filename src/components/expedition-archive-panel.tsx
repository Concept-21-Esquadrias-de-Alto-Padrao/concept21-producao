"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { setExpeditionArchiveAction } from "@/app/expedition-archive-actions";
import { activeExpeditionArchive } from "@/lib/expedition-archive";
import type { Client, ProductionContract, ProductionProd, ProductionPieceStage } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export function ExpeditionArchivePanel({ clients, contracts, prods, activeRows, archivedRows, stageName }: {
  stageName: "Usinagem" | "Preparação e montagem" | "Embalagem" | "Expedição";
  clients: Client[]; contracts: ProductionContract[]; prods: ProductionProd[];
  activeRows: ProductionPieceStage[]; archivedRows: ProductionPieceStage[];
}) {
  const [mode, setMode] = useState<"archive" | "restore">("archive");
  const [selected, setSelected] = useState<string[]>([]);
  const [state, action, pending] = useActionState(setExpeditionArchiveAction, { ok: false, message: "" });
  const router = useRouter();
  const rows = mode === "archive" ? activeRows : archivedRows;
  const groups = prods.map((prod) => {
    const contract = contracts.find((item) => item.id === prod.contract_id);
    const client = clients.find((item) => item.id === contract?.client_id);
    return { prod, contract, client, rows: rows.filter((row) => row.prod_id === prod.id) };
  }).filter((group) => group.rows.length);
  useEffect(() => {
    if (!state.ok) return;
    const timer = window.setTimeout(() => { setSelected([]); router.refresh(); }, 0);
    return () => window.clearTimeout(timer);
  }, [state, router]);
  const selectedRows = rows.filter((row) => selected.includes(row.prod_id));

  return <details className="rounded-md border border-border bg-white p-4">
    <summary className="cursor-pointer font-semibold">Arquivamento da {stageName} · {archivedRows.length} peça(s) arquivada(s)</summary>
    <p className="my-3 text-sm text-muted-foreground">Arquivar retira da fila sem concluir a etapa. Tempos e apontamentos permanecem no histórico. A reativação devolve as peças à fila quando atendem às condições operacionais.</p>
    <label className="block text-sm font-medium">Operação
      <select value={mode} disabled={pending} onChange={(event) => { setMode(event.target.value as typeof mode); setSelected([]); }} className="ml-3 rounded border p-2">
        <option value="archive">Arquivar peças abertas</option><option value="restore">Reativar peças arquivadas</option>
      </select>
    </label>
    <form action={action} className="mt-3 space-y-3">
      <input type="hidden" name="operation" value={mode} />
      {selectedRows.map((row) => <input key={row.id} type="hidden" name="piece_stage_id" value={row.id} />)}
      <fieldset disabled={pending} className="max-h-80 space-y-2 overflow-y-auto">
        <legend className="sr-only">PRODs para {mode === "archive" ? "arquivar" : "reativar"}</legend>
        {groups.map((group) => {
          const archive = activeExpeditionArchive(group.rows[0].expedition_archive);
          return <label key={group.prod.id} className="flex items-start gap-2 rounded border border-border p-2 text-sm">
            <input type="checkbox" checked={selected.includes(group.prod.id)} onChange={(event) => setSelected((previous) => event.target.checked ? [...previous, group.prod.id] : previous.filter((id) => id !== group.prod.id))} />
            <span>{group.client?.name} — {group.contract?.contract_number} — PROD {group.prod.prod_number} · {group.rows.length} peça(s)
              {archive && <small className="block text-muted-foreground">Arquivada em {formatDateTime(archive.archived_at)} · {archive.reason}</small>}
            </span>
          </label>;
        })}
        {!groups.length && <p className="text-sm">Nenhuma PROD nesta seleção.</p>}
      </fieldset>
      <label className="block text-sm font-medium">Motivo
        <textarea name="reason" required minLength={3} maxLength={1000} disabled={pending} className="mt-1 block w-full rounded border border-border p-2" />
      </label>
      <button disabled={pending || !selectedRows.length} className="rounded bg-charcoal px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
        {pending ? "Salvando…" : `${mode === "archive" ? "Arquivar" : "Reativar"} ${selectedRows.length} peça(s)`}
      </button>
      {state.message && <p role="status" className={state.ok ? "text-success" : "text-danger"}>{state.message}</p>}
    </form>
  </details>;
}
