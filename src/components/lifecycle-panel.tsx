"use client";

import Link from "next/link";
import { lifecycleAction } from "@/app/lifecycle-actions";
import { ActionForm, Field, inputClass, textareaClass } from "./action-form";
import { lifecycleView, lifecycleViewLabels, type LifecycleEvent, type PieceDispatch } from "@/lib/lifecycle";
import type { ProductionContract, ProductionPiece, ProductionProd, Profile } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

const commandLabels: Record<string, string> = {
  dispatch: "Confirmar saída física", return_dispatch: "Registrar retorno da saída",
  cancel_pieces: "Cancelar peças do escopo", restore_pieces: "Restaurar peças canceladas",
  confirm_scope: "Confirmar todo o escopo técnico", reopen_scope: "Reabrir liberações técnicas",
  close_contract: "Encerrar contrato na Produção", reopen_contract: "Reabrir contrato",
  archive_prod: "Arquivar PROD", restore_prod: "Restaurar PROD",
  archive_contract: "Arquivar contrato", restore_contract: "Restaurar contrato",
};
const eventLabels: Record<string, string> = {
  ...commandLabels, prod_concluida: "PROD concluída automaticamente", prod_reaberta: "PROD reaberta",
  prod_cancelada: "PROD integralmente cancelada", contrato_reaberto: "Contrato reaberto",
  escopo_reaberto: "Confirmação de escopo invalidada", saida_invalidada: "Saída anterior invalidada",
};
export function LifecycleBadge({ item }: { item: ProductionContract | ProductionProd }) {
  const view = lifecycleView(item);
  return <span className={`inline-flex rounded-md px-2 py-1 text-xs font-semibold ${view === "concluidos" ? "bg-emerald-50 text-emerald-800" : view === "arquivados" ? "bg-zinc-100 text-zinc-700" : "bg-orange-50 text-orange-900"}`}>{lifecycleViewLabels[view]}</span>;
}
export function LifecycleCommand({ entity, command, pieces = [], description }: {
  entity: string; command: string; pieces?: ProductionPiece[]; description?: string;
}) {
  return <details className="rounded-md border border-border bg-white p-3">
    <summary className="cursor-pointer font-semibold">{commandLabels[command]}</summary>
    <ActionForm action={lifecycleAction} submitLabel={commandLabels[command]} className="mt-3">
      <input type="hidden" name="entity" value={entity} />
      <input type="hidden" name="command" value={command} />
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {pieces.length > 0 && <fieldset className="max-h-64 space-y-2 overflow-y-auto rounded border border-border p-3">
        <legend className="px-1 text-sm font-semibold">Selecione as peças (quantidade integral de cada linha)</legend>
        {pieces.map(piece => <label className="flex min-h-10 items-center gap-3 text-sm" key={piece.id}>
          <input type="checkbox" name="piece_id" value={piece.id} />
          <span>{piece.piece_code} · {piece.quantity} un. · {piece.location ?? "Sem local"}{piece.disposition?.cancelled_at ? " · Cancelada" : ""}</span>
        </label>)}
      </fieldset>}
      {command === "dispatch" && <Field label="Identificação do romaneio"><input className={inputClass} name="reference" minLength={3} maxLength={200} required placeholder="Número ou referência do documento de saída" /></Field>}
      <Field label={command === "confirm_scope" ? "Evidência da liberação integral pelo Técnico" : "Motivo / observação"}>
        <textarea className={textareaClass} name="reason" minLength={3} maxLength={1000} required />
      </Field>
      <label className="flex items-start gap-3 text-sm"><input type="checkbox" name="confirmed" value="yes" required className="mt-1" />
        {command === "dispatch" ? "Confirmo que todas as unidades selecionadas saíram fisicamente e estão identificadas no romaneio. A data e o responsável serão registrados agora." : "Conferi o escopo e confirmo esta operação, que ficará registrada no histórico."}
      </label>
    </ActionForm>
  </details>;
}

export function ProdLifecyclePanel({ prod, contract, pieces, permissions, isMaster }: {
  prod: ProductionProd; contract: ProductionContract; pieces: ProductionPiece[];
  permissions: Record<string, boolean>; isMaster: boolean;
}) {
  const l = prod.lifecycle;
  const archived = Boolean(l?.archived_at || contract.lifecycle?.archived_at);
  const allowed = (key: string) => isMaster || permissions[key];
  return <section className="space-y-4 rounded-md border border-border bg-white p-4" aria-label="Situação da produção">
    <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">Conclusão na Produção</h2><LifecycleBadge item={prod} /></div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[["Escopo", l?.total_quantity ?? prod.pieces_count], ["Fabricadas", l?.manufactured_quantity ?? 0], ["Expedidas", l?.dispatched_quantity ?? 0], ["Canceladas", l?.cancelled_quantity ?? 0]].map(([label,value]) => <div className="rounded bg-muted p-3" key={label}><p className="text-xs text-muted-foreground">{label}</p><strong className="text-xl">{value}</strong></div>)}
    </div>
    <p className="text-sm">Fabricação: {l?.manufacturing_state === "concluida" ? "Concluída" : l?.manufacturing_state === "em_andamento" ? "Em andamento" : "Não iniciada"} · Expedição: {l?.expedition_state === "total" ? "Totalmente expedida" : l?.expedition_state === "parcial" ? "Parcialmente expedida" : "Sem saída"}.</p>
    <p className="text-sm text-muted-foreground">Fabricação concluída: {formatDateTime(l?.manufactured_at)} · Conclusão na Produção: {formatDateTime(l?.completed_at)}.</p>
    {(l?.blocker_count || l?.archived_stage_count) ? <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">{l?.blocker_count ?? 0} impedimento(s) e {l?.archived_stage_count ?? 0} etapa(s) arquivada(s). Arquivamento não comprova execução nem permite concluir o escopo restante.</p> : null}
    {!l?.completed_at && ["concluida", "cancelada"].includes(prod.legacy_status ?? "") && <p className="text-sm text-amber-800">O status antigo era “{prod.legacy_status}”. Ele não comprova a conclusão pelo novo processo.</p>}
    {l?.archived_at && <p className="text-sm">Arquivada em {formatDateTime(l.archived_at)}. Motivo: {l.archive_reason}.</p>}
    <Link href={`/contracts/${contract.id}`} className="inline-block text-sm font-semibold text-accent underline">Consultar contrato e encerramento das liberações</Link>
    {!archived && <div className="grid gap-3 lg:grid-cols-2">
      {allowed("production.shipping.manage") && <LifecycleCommand entity={prod.id} command="dispatch" pieces={pieces.filter(p => !p.disposition?.cancelled_at)} description="Concluir a carga ou gerar um romaneio não registra a saída. Fabricação, carga e impedimentos serão conferidos novamente ao confirmar." />}
      {allowed("production.pointing.rollback") && <LifecycleCommand entity={prod.id} command="return_dispatch" pieces={pieces} description="Invalida a saída vigente e reabre a PROD. Para refazer etapas, use também o retorno ou retrabalho da peça." />}
      {allowed("production.prods.manage_pieces") && <><LifecycleCommand entity={prod.id} command="cancel_pieces" pieces={pieces.filter(p => !p.disposition?.cancelled_at)} description="Cancelamento é uma destinação formal do escopo e não conta como produção. Informe a autorização no motivo." /><LifecycleCommand entity={prod.id} command="restore_pieces" pieces={pieces.filter(p => p.disposition?.cancelled_at)} /></>}
      {isMaster && !l?.completed_at && <LifecycleCommand entity={prod.id} command="archive_prod" description="Retira a PROD da rotina e a mantém na consulta administrativa. Pendências e apontamentos ativos impedem esta ação." />}
    </div>}
    {isMaster && l?.archived_at && !contract.lifecycle?.archived_at && <LifecycleCommand entity={prod.id} command="restore_prod" description="Restaura o registro para conferência operacional, sem concluir peças arquivadas." />}
  </section>;
}

export function LifecycleHistory({ events, profiles = [] }: { events: LifecycleEvent[]; profiles?: Pick<Profile, "id" | "name">[] }) {
  return <section className="space-y-3" aria-label="Histórico de conclusão e escopo"><h2 className="font-semibold">Histórico de conclusão e escopo</h2>
    {!events.length && <p className="text-sm text-muted-foreground">Nenhum evento deste processo registrado.</p>}
    {events.map(event => <article key={event.id} className="rounded border border-border bg-white p-3 text-sm">
      <strong>{eventLabels[event.event] ?? event.event}</strong>
      <p className="text-muted-foreground">{formatDateTime(event.occurred_at)} · {event.actor_id ? profiles.find(p => p.id === event.actor_id)?.name ?? "Usuário identificado no registro" : "Sistema"}</p>
      <p className="mt-1">{event.reason}</p>
    </article>)}
  </section>;
}

export function DispatchHistory({ dispatches, profiles }: { dispatches: PieceDispatch[]; profiles: Pick<Profile, "id" | "name">[] }) {
  return <section className="space-y-3"><h2 className="font-semibold">Saídas físicas e romaneios</h2>
    {!dispatches.length && <p className="text-sm text-muted-foreground">Nenhuma saída física registrada pelo novo processo.</p>}
    {dispatches.map(d => <article key={d.id} className="rounded border border-border bg-white p-3 text-sm">
      <p className="font-semibold">{d.romaneio} · {d.piece_snapshot.piece_code} · {d.quantity} un.</p>
      <p>{formatDateTime(d.departed_at)} · {profiles.find(p => p.id === d.actor_id)?.name ?? "Responsável registrado"}</p>
      {d.voided_at && <p className="text-amber-800">Retorno/invalidação em {formatDateTime(d.voided_at)}: {d.void_reason}</p>}
    </article>)}
  </section>;
}
