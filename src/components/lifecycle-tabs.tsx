import Link from "next/link";
import { lifecycleViewLabels, type LifecycleView } from "@/lib/lifecycle";
export function LifecycleTabs({ path, view, showArchives = false }: { path: string; view: LifecycleView; showArchives?: boolean }) {
  const views: LifecycleView[] = ["em_andamento", "concluidos", "cancelados"];
  return <nav aria-label="Situação dos registros" className="flex flex-wrap gap-2">
    {views.map(v => <Link key={v} href={`${path}?view=${v}`} aria-current={view === v ? "page" : undefined} className={`rounded-md border px-4 py-2 text-sm font-semibold ${view === v ? "border-charcoal bg-charcoal text-white" : "border-border bg-white text-charcoal"}`}>{lifecycleViewLabels[v]}</Link>)}
    {showArchives && <Link href="/archives" className="rounded-md border border-border px-4 py-2 text-sm font-semibold">Consulta administrativa de arquivados</Link>}
  </nav>;
}
