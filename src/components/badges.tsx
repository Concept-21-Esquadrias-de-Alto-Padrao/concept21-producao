import { priorityLabels, prodStatusLabels, stageStatusLabels } from "@/lib/labels";
import type { Priority, ProdStatus, StageStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const statusTone: Record<string, string> = {
  planejamento: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  aguardando_materiais: "bg-amber-50 text-amber-800 ring-amber-200",
  aguardando_listas: "bg-amber-50 text-amber-800 ring-amber-200",
  pronta_para_producao: "bg-blue-50 text-blue-800 ring-blue-200",
  em_producao: "bg-orange-50 text-orange-800 ring-orange-200",
  pausada: "bg-red-50 text-red-800 ring-red-200",
  embalagem: "bg-purple-50 text-purple-800 ring-purple-200",
  expedicao: "bg-cyan-50 text-cyan-800 ring-cyan-200",
  aguardando_frete: "bg-slate-100 text-slate-700 ring-slate-200",
  concluida: "bg-green-50 text-green-800 ring-green-200",
  cancelada: "bg-zinc-200 text-zinc-700 ring-zinc-300",
};

const priorityTone: Record<Priority, string> = {
  baixa: "bg-zinc-100 text-zinc-700 ring-zinc-200",
  normal: "bg-blue-50 text-blue-800 ring-blue-200",
  alta: "bg-orange-50 text-orange-800 ring-orange-200",
  urgente: "bg-red-50 text-red-800 ring-red-200",
};

export function StatusBadge({
  status,
  type = "prod",
}: {
  status: ProdStatus | StageStatus | string;
  type?: "prod" | "stage" | "plain";
}) {
  const label =
    type === "prod"
      ? prodStatusLabels[status as ProdStatus]
      : type === "stage"
        ? stageStatusLabels[status as StageStatus]
        : status;

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1",
        statusTone[status] ?? "bg-zinc-100 text-zinc-700 ring-zinc-200",
      )}
    >
      {label ?? status}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-1 text-xs font-semibold ring-1",
        priorityTone[priority],
      )}
    >
      {priorityLabels[priority]}
    </span>
  );
}
