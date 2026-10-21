import type { ProductionContract, ProductionProd } from "./types";

export type LifecycleState = "em_andamento" | "concluida" | "cancelada";
export type LifecycleView = "em_andamento" | "concluidos" | "cancelados" | "arquivados";
export type ProdLifecycle = {
  prod_id: string;
  state: LifecycleState;
  manufacturing_state: "nao_iniciada" | "em_andamento" | "concluida";
  expedition_state: "sem_saida" | "parcial" | "total";
  total_quantity: number;
  manufactured_quantity: number;
  dispatched_quantity: number;
  cancelled_quantity: number;
  blocker_count: number;
  archived_stage_count: number;
  manufactured_at: string | null;
  completed_at: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
};
export type ContractLifecycle = {
  contract_id: string;
  scope_confirmed_at: string | null;
  scope_confirmed_by: string | null;
  scope_evidence: string | null;
  completed_at: string | null;
  completed_by: string | null;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string | null;
};
export type PieceDisposition = { piece_id: string; cancelled_at: string | null; reason: string; actor_id: string };
export type PieceDispatch = {
  id: string; prod_id: string; piece_id: string; romaneio: string;
  departed_at: string; actor_id: string; quantity: number;
  voided_at: string | null; void_reason: string | null;
  piece_snapshot: { piece_code?: string; quantity?: number };
};
export type LifecycleEvent = {
  id: string; prod_id: string | null; contract_id: string; event: string;
  actor_id: string | null; occurred_at: string; reason: string; details: Record<string, unknown>;
};

export function lifecycleView(item: { lifecycle?: ProdLifecycle | ContractLifecycle | null }): LifecycleView {
  const state = item.lifecycle;
  if (state?.archived_at) return "arquivados";
  if (state?.completed_at) return "concluidos";
  if (state && "state" in state && state.state === "cancelada") return "cancelados";
  return "em_andamento";
}
export function isOfficiallyCompleted(item: { lifecycle?: ProdLifecycle | ContractLifecycle | null }) {
  return lifecycleView(item) === "concluidos";
}
export function isOperationalProd(prod: ProductionProd, contracts: ProductionContract[] = []) {
  return lifecycleView(prod) === "em_andamento" && !contracts.find(c => c.id === prod.contract_id)?.lifecycle?.archived_at;
}
export function completionInPeriod(at: string | null | undefined, start?: string, end?: string) {
  if (!start && !end) return true;
  if (!at) return false;
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(at));
  return (!start || date >= start) && (!end || date <= end);
}
export const lifecycleViewLabels: Record<LifecycleView, string> = {
  em_andamento: "Em andamento", concluidos: "Concluídos", cancelados: "Cancelados", arquivados: "Arquivados",
};
export function parseLifecycleView(value?: string): LifecycleView {
  return value && Object.hasOwn(lifecycleViewLabels, value) ? value as LifecycleView : "em_andamento";
}
