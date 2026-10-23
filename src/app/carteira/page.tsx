import Link from "next/link";
import { redirect } from "next/navigation";
import { Field, inputClass } from "@/components/action-form";
import { PageHeader } from "@/components/page-header";
import { getWorkPortfolioPageData } from "@/lib/data";
import { lifecycleView } from "@/lib/lifecycle";
import { appNavigationPermissionKeys, firstAllowedAppRoute } from "@/lib/module-access";
import { getCurrentPermissionFlags } from "@/lib/server-access";
import { formatDate, normalizeText } from "@/lib/utils";
import { buildWorkPortfolio, planningDeadline, workProgressLabels } from "@/lib/work-portfolio";

type Filters = { busca?: string; prazo?: string; prod?: string; andamento?: string; view?: string };

export default async function WorkPortfolioPage({ searchParams }: { searchParams: Promise<Filters> }) {
  const filters = await searchParams;
  const access = await getCurrentPermissionFlags([...appNavigationPermissionKeys, "production.materials.view"]);
  if (!access.isMaster && !(access.permissions["production.contracts.view"] && access.permissions["production.prods.view"])) {
    redirect(firstAllowedAppRoute(access) ?? "/login");
  }
  const canSeeMaterials = access.isMaster || Boolean(access.permissions["production.materials.view"]);
  const snapshot = await getWorkPortfolioPageData(canSeeMaterials);
  const rows = buildWorkPortfolio(snapshot, canSeeMaterials);
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
  const view = filters.view === "concluidos" ? "concluidos" : "em_andamento";
  const search = normalizeText(filters.busca ?? "");
  const visible = rows.filter(row => {
    if (lifecycleView(row.contract) !== view) return false;
    if (search && !normalizeText([row.clientName, row.contract.work_name, row.contract.contract_number].join(" ")).includes(search)) return false;
    if (filters.prazo && planningDeadline(row.contract.general_delivery_forecast, today) !== filters.prazo) return false;
    if (filters.prod === "sim" && !row.prods.length || filters.prod === "nao" && row.prods.length) return false;
    if (filters.andamento && row.progress !== filters.andamento) return false;
    return true;
  });

  return <div className="space-y-6">
    <PageHeader title="Carteira de obras" description="Acompanhe o planejamento da Produção e as PRODs recebidas em cada contrato." actions={<Link href="/contracts" className="text-sm font-semibold text-accent underline">Cadastrar obra</Link>} />
    <nav className="flex gap-3 text-sm font-semibold" aria-label="Situação da carteira">
      <Link href="/carteira" className={view === "em_andamento" ? "text-accent underline" : "text-muted-foreground"}>Em andamento</Link>
      <Link href="/carteira?view=concluidos" className={view === "concluidos" ? "text-accent underline" : "text-muted-foreground"}>Concluídos</Link>
    </nav>
    <form className="grid gap-3 rounded-md border border-border bg-white p-4 md:grid-cols-2 xl:grid-cols-4">
      <input type="hidden" name="view" value={view} />
      <Field label="Cliente, obra ou contrato"><input name="busca" className={inputClass} defaultValue={filters.busca} placeholder="Pesquisar" /></Field>
      <Field label="Prazo do planejamento"><select name="prazo" className={inputClass} defaultValue={filters.prazo ?? ""}>
        <option value="">Todos</option><option value="sem_data">Sem data</option><option value="vencido">Data ultrapassada</option><option value="proximos_30">Próximos 30 dias</option><option value="futuro">Após 30 dias</option>
      </select></Field>
      <Field label="PRODs"><select name="prod" className={inputClass} defaultValue={filters.prod ?? ""}>
        <option value="">Todas</option><option value="sim">Com PROD</option><option value="nao">Sem PROD</option>
      </select></Field>
      <Field label="Andamento"><select name="andamento" className={inputClass} defaultValue={filters.andamento ?? ""}>
        <option value="">Todos</option>{Object.entries(workProgressLabels).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
      </select></Field>
      <div className="flex items-center gap-3 xl:col-span-4"><button className="min-h-10 rounded-md bg-charcoal px-4 text-sm font-semibold text-white">Filtrar</button><Link href={view === "concluidos" ? "/carteira?view=concluidos" : "/carteira"} className="text-sm underline">Limpar filtros</Link><span className="text-xs text-muted-foreground">{visible.length} obra(s)</span></div>
    </form>
    <div className="space-y-3">
      {visible.length === 0 && <p className="rounded-md border border-border bg-white p-5 text-sm">Nenhuma obra encontrada com estes filtros.</p>}
      {visible.map(row => <article key={row.contract.id} className="rounded-md border border-border bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><Link href={`/carteira/${row.contract.id}`} className="font-semibold text-charcoal underline">{row.clientName} · {row.contract.work_name}</Link><p className="text-sm text-muted-foreground">Contrato {row.contract.contract_number}</p></div>
          <span className="rounded-md bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-900">{workProgressLabels[row.progress]}</span>
        </div>
        <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Data do planejamento</dt><dd>{formatDate(row.contract.general_delivery_forecast)}</dd></div>
          <div><dt className="text-muted-foreground">PRODs</dt><dd>{row.prods.length}</dd></div>
          <div><dt className="text-muted-foreground">Itens nas PRODs</dt><dd>{row.pieceLines} linhas · {row.pieceUnits} unidades</dd></div>
          <div><dt className="text-muted-foreground">Liberação técnica integral</dt><dd>{row.scopeStatus === "completo" ? "Lista integral conciliada" : row.scopeStatus === "sem_base" ? "Falta lista integral" : "Conciliação pendente"}</dd></div>
        </dl>
      </article>)}
    </div>
    <p className="text-xs text-muted-foreground">Cada PDF contém apenas os itens da respectiva PROD. A liberação integral depende da lista vigente do Técnico conciliada com todas as PRODs.</p>
  </div>;
}
