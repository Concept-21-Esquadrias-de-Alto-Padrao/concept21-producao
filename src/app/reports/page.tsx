import Link from "next/link";
import { BarChart3, BriefcaseBusiness, ClipboardList, Factory, UserRound } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { PointingReportPdfButton } from "@/components/pointing-report-pdf-button";
import { ProductivityReportPdfButton } from "@/components/productivity-report-pdf-button";
import {
  type WeeklyAgendaRow,
  WeeklyProductionAgendaImage,
} from "@/components/weekly-production-agenda-image";
import { getReportsPageData } from "@/lib/data";
import {
  materialConfirmationLabels,
  prodStatusLabels,
  stageShortLabels,
} from "@/lib/labels";
import {
  appNavigationPermissionKeys,
  canAccessModule,
  firstAllowedAppRoute,
  MODULE_ACCESS,
} from "@/lib/module-access";
import {
  buildProductionPointingReport,
  productionPointingActionLabels,
  type ProductionPointingReportFilters,
} from "@/lib/pointing-report";
import {
  buildProductionProductivityReport,
  type ProductionProductivityReportFilters,
} from "@/lib/productivity-report";
import { getProdContexts } from "@/lib/production";
import { getCurrentPermissionFlags } from "@/lib/server-access";
import type { ProductionSnapshot } from "@/lib/types";
import { cn, formatDate, formatDateTime, normalizeText } from "@/lib/utils";

type ReportView = "clients" | "contracts" | "prods" | "productivity" | "pointing" | "agenda";

type ReportParams = {
  view?: string;
  q?: string;
  clientId?: string;
  status?: string;
  state?: string;
  stageId?: string;
  operatorId?: string;
  action?: string;
  dateFrom?: string;
  dateTo?: string;
  agendaWeek?: string;
};

const views: Array<{ id: ReportView; label: string }> = [
  { id: "clients", label: "Clientes" },
  { id: "contracts", label: "Contratos" },
  { id: "prods", label: "PRODs" },
  { id: "productivity", label: "Produtividade" },
  { id: "pointing", label: "Apontamentos" },
  { id: "agenda", label: "Agenda semanal" },
];

const controlClass =
  "min-h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-charcoal outline-none focus:border-accent";

function normalizeView(value?: string): ReportView {
  return views.some((view) => view.id === value) ? (value as ReportView) : "clients";
}

function matchText(value: string | null | undefined, query: string) {
  if (!query) return true;
  return normalizeText(value ?? "").includes(normalizeText(query));
}

function dateInputValue(value?: string) {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : "";
}

function todayInputValue() {
  const now = new Date();
  const offset = now.getTimezoneOffset() * 60_000;
  return new Date(now.getTime() - offset).toISOString().slice(0, 10);
}

function ReportTabs({ activeView }: { activeView: ReportView }) {
  return (
    <div className="overflow-x-auto border-b border-border">
      <div className="flex min-w-max gap-1">
        {views.map((view) => (
          <Link
            key={view.id}
            href={`/reports?view=${view.id}`}
            className={cn(
              "border-b-2 px-4 py-3 text-sm font-medium transition",
              activeView === view.id
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-charcoal",
            )}
          >
            {view.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function FilterActions({ view }: { view: ReportView }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="submit"
        className="inline-flex min-h-10 items-center justify-center rounded-md bg-charcoal px-4 py-2 text-sm font-semibold text-white hover:bg-black"
      >
        Filtrar
      </button>
      <Link
        href={`/reports?view=${view}`}
        className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-charcoal hover:bg-muted"
      >
        Limpar
      </Link>
    </div>
  );
}

function SummaryCards({ snapshot }: { snapshot: ProductionSnapshot }) {
  const activeContracts = snapshot.contracts.filter((contract) => contract.active).length;
  const activeProds = snapshot.prods.filter(
    (prod) => !["concluida", "cancelada"].includes(prod.status),
  ).length;
  const delayedMaterials = snapshot.prodMaterials.filter(
    (material) =>
      material.confirmation_status === "aguardando_confirmacao" ||
      material.confirmation_status === "indisponivel" ||
      material.confirmation_status === "parcialmente_confirmado",
  ).length;

  const cards: Array<{ label: string; value: number; icon: LucideIcon }> = [
    { label: "Clientes", value: snapshot.clients.length, icon: UserRound },
    { label: "Contratos ativos", value: activeContracts, icon: BriefcaseBusiness },
    { label: "PRODs abertas", value: activeProds, icon: Factory },
    { label: "Materiais em atenção", value: delayedMaterials, icon: BarChart3 },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {cards.map(({ label, value, icon: Icon }) => (
        <div key={label} className="rounded-md border border-border bg-card p-4 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-bold text-charcoal">{value}</p>
            </div>
            <Icon className="size-5 text-accent" />
          </div>
        </div>
      ))}
    </div>
  );
}

function ClientsReport({
  snapshot,
  params,
}: {
  snapshot: ProductionSnapshot;
  params: ReportParams;
}) {
  const q = params.q ?? "";
  const status = params.status ?? "";
  const clients = snapshot.clients.filter(
    (client) =>
      (matchText(client.name, q) || matchText(client.notes, q)) &&
      (!status ||
        (status === "active" && client.active) ||
        (status === "inactive" && !client.active)),
  );

  return (
    <Panel>
      <PanelHeader
        title="Relatório de clientes"
        description="Quantidade de contratos e PRODs vinculadas a cada cliente."
      />
      <PanelBody className="space-y-4">
        <form className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 md:grid-cols-[1fr_180px_auto]">
          <input type="hidden" name="view" value="clients" />
          <input name="q" defaultValue={q} className={controlClass} placeholder="Buscar cliente" />
          <select name="status" defaultValue={status} className={controlClass}>
            <option value="">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
          <FilterActions view="clients" />
        </form>

        {clients.map((client) => {
          const contracts = snapshot.contracts.filter((contract) => contract.client_id === client.id);
          const contractIds = new Set(contracts.map((contract) => contract.id));
          const prods = snapshot.prods.filter((prod) => contractIds.has(prod.contract_id));

          return (
            <article key={client.id} className="rounded-md border border-border bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-charcoal">{client.name}</p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {client.notes ?? "Sem observações cadastradas."}
                  </p>
                </div>
                <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800 ring-1 ring-emerald-200">
                  {client.active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <span className="rounded-md bg-muted px-3 py-2">
                  {contracts.length} contrato(s)
                </span>
                <span className="rounded-md bg-muted px-3 py-2">{prods.length} PROD(s)</span>
                <span className="rounded-md bg-muted px-3 py-2">
                  {prods.filter((prod) => prod.status === "concluida").length} concluída(s)
                </span>
              </div>
            </article>
          );
        })}
      </PanelBody>
    </Panel>
  );
}

function ContractsReport({
  snapshot,
  params,
}: {
  snapshot: ProductionSnapshot;
  params: ReportParams;
}) {
  const q = params.q ?? "";
  const clientId = params.clientId ?? "";
  const status = params.status ?? "";
  const contracts = snapshot.contracts.filter((contract) => {
    const client = snapshot.clients.find((item) => item.id === contract.client_id);
    return (
      (!q ||
        matchText(contract.contract_number, q) ||
        matchText(contract.work_name, q) ||
        matchText(contract.full_address, q) ||
        matchText(client?.name, q)) &&
      (!clientId || contract.client_id === clientId) &&
      (!status || contract.status === status)
    );
  });
  const statuses = Array.from(new Set(snapshot.contracts.map((contract) => contract.status))).sort();

  return (
    <Panel>
      <PanelHeader
        title="Relatório de contratos"
        description="Visão por contrato, obra, endereço e andamento das PRODs."
      />
      <PanelBody className="space-y-4">
        <form className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 lg:grid-cols-[1fr_220px_180px_auto]">
          <input type="hidden" name="view" value="contracts" />
          <input
            name="q"
            defaultValue={q}
            className={controlClass}
            placeholder="Cliente, contrato, obra ou endereço"
          />
          <select name="clientId" defaultValue={clientId} className={controlClass}>
            <option value="">Todos os clientes</option>
            {snapshot.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status} className={controlClass}>
            <option value="">Todos os status</option>
            {statuses.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
          <FilterActions view="contracts" />
        </form>

        {contracts.map((contract) => {
          const client = snapshot.clients.find((item) => item.id === contract.client_id);
          const prods = snapshot.prods.filter((prod) => prod.contract_id === contract.id);

          return (
            <article key={contract.id} className="rounded-md border border-border bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-charcoal">
                    {contract.contract_number} · {client?.name ?? "Cliente não encontrado"}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {contract.work_name} · {contract.full_address}
                  </p>
                </div>
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {contract.status}
                </span>
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                <span className="rounded-md bg-muted px-3 py-2">{prods.length} PROD(s)</span>
                <span className="rounded-md bg-muted px-3 py-2">
                  {prods.filter((prod) => prod.status === "em_producao").length} em produção
                </span>
                <span className="rounded-md bg-muted px-3 py-2">
                  {prods.filter((prod) => prod.status === "aguardando_frete").length} aguardando frete
                </span>
                <span className="rounded-md bg-muted px-3 py-2">
                  Entrega: {formatDate(contract.general_delivery_forecast)}
                </span>
              </div>
            </article>
          );
        })}
      </PanelBody>
    </Panel>
  );
}

function ProdsReport({
  snapshot,
  params,
}: {
  snapshot: ProductionSnapshot;
  params: ReportParams;
}) {
  const q = params.q ?? "";
  const clientId = params.clientId ?? "";
  const status = params.status ?? "";
  const stageId = params.stageId ?? "";
  const contexts = getProdContexts(snapshot).filter((context) => {
    const searchable = [
      context.client.name,
      context.contract.contract_number,
      context.contract.work_name,
      String(context.prod.prod_number),
      context.prod.description,
    ].join(" ");

    return (
      matchText(searchable, q) &&
      (!clientId || context.client.id === clientId) &&
      (!status || context.prod.status === status) &&
      (!stageId || context.prod.current_stage_id === stageId)
    );
  });

  return (
    <Panel>
      <PanelHeader
        title="Relatório de PRODs"
        description="Status operacional, prazos e materiais em atenção."
      />
      <PanelBody className="space-y-4">
        <form className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 xl:grid-cols-[1fr_220px_180px_220px_auto]">
          <input type="hidden" name="view" value="prods" />
          <input
            name="q"
            defaultValue={q}
            className={controlClass}
            placeholder="Cliente, contrato, obra ou PROD"
          />
          <select name="clientId" defaultValue={clientId} className={controlClass}>
            <option value="">Todos os clientes</option>
            {snapshot.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status} className={controlClass}>
            <option value="">Todos os status</option>
            {Object.entries(prodStatusLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
          <select name="stageId" defaultValue={stageId} className={controlClass}>
            <option value="">Todas as etapas</option>
            {snapshot.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
          <FilterActions view="prods" />
        </form>

        {contexts.map((context) => {
          const materials = snapshot.prodMaterials.filter(
            (material) => material.prod_id === context.prod.id,
          );
          const attentionMaterials = materials.filter(
            (material) => material.confirmation_status !== "confirmado",
          );

          return (
            <article key={context.prod.id} className="rounded-md border border-border bg-white p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="font-semibold text-charcoal">
                    {context.client.name} · {context.contract.contract_number} · PROD{" "}
                    {context.prod.prod_number}
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Etapa: {context.currentStage?.name ?? "Sem etapa"} · Prazo:{" "}
                    {formatDate(context.prod.delivery_forecast)}
                  </p>
                </div>
                <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                  {prodStatusLabels[context.prod.status]}
                </span>
              </div>

              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                {attentionMaterials.length === 0 ? (
                  <span className="rounded-md bg-emerald-50 px-3 py-2 text-emerald-800 ring-1 ring-emerald-200">
                    Materiais confirmados
                  </span>
                ) : (
                  attentionMaterials.map((material) => (
                    <span
                      key={material.id}
                      className="rounded-md bg-orange-50 px-3 py-2 text-orange-900 ring-1 ring-orange-200"
                    >
                      {material.group}: {materialConfirmationLabels[material.confirmation_status]}
                    </span>
                  ))
                )}
              </div>
            </article>
          );
        })}
      </PanelBody>
    </Panel>
  );
}

function decimalLabel(value: number, digits = 2) {
  return Number(value ?? 0).toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function durationLabel(seconds: number) {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}min`;
}

function ProductivityReport({
  snapshot,
  params,
}: {
  snapshot: ProductionSnapshot;
  params: ReportParams;
}) {
  const filters: ProductionProductivityReportFilters = {
    operatorId: params.operatorId,
    stageId: params.stageId,
    dateFrom: dateInputValue(params.dateFrom),
    dateTo: dateInputValue(params.dateTo),
  };
  const report = buildProductionProductivityReport(snapshot, filters);

  return (
    <Panel>
      <PanelHeader
        title="Produtividade por colaborador"
        description="Indicadores calculados a partir dos apontamentos feitos com matrícula e senha."
        actions={<ProductivityReportPdfButton report={report} />}
      />
      <PanelBody className="space-y-5">
        <form className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 xl:grid-cols-[220px_220px_170px_170px_auto]">
          <input type="hidden" name="view" value="productivity" />
          <select name="operatorId" defaultValue={filters.operatorId ?? ""} className={controlClass}>
            <option value="">Todos os colaboradores</option>
            {snapshot.productionOperators
              .filter((operator) => operator.active)
              .map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.name}
                </option>
              ))}
          </select>
          <select name="stageId" defaultValue={filters.stageId ?? ""} className={controlClass}>
            <option value="">Todas as etapas</option>
            {snapshot.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="dateFrom"
            defaultValue={filters.dateFrom ?? ""}
            className={controlClass}
          />
          <input
            type="date"
            name="dateTo"
            defaultValue={filters.dateTo ?? ""}
            className={controlClass}
          />
          <FilterActions view="productivity" />
        </form>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <p className="text-2xl font-bold text-accent">{report.metrics.operators}</p>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Colaboradores</p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <p className="text-2xl font-bold text-accent">
              {decimalLabel(report.metrics.productiveHours)}h
            </p>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Tempo produtivo</p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <p className="text-2xl font-bold text-accent">
              {decimalLabel(report.metrics.pausedHours)}h
            </p>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Tempo parado</p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <p className="text-2xl font-bold text-accent">{report.metrics.completedPieces}</p>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Peças concluídas</p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <p className="text-2xl font-bold text-accent">
              {decimalLabel(report.metrics.completedWeightKg, 3)} kg
            </p>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Peso concluído</p>
          </div>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Colaborador</th>
                <th className="px-3 py-2">Matrícula</th>
                <th className="px-3 py-2">Produtivo</th>
                <th className="px-3 py-2">Parado</th>
                <th className="px-3 py-2">Peças</th>
                <th className="px-3 py-2">Kg</th>
                <th className="px-3 py-2">Peças/h</th>
                <th className="px-3 py-2">Kg/h</th>
              </tr>
            </thead>
            <tbody>
              {report.operatorRows.length ? (
                report.operatorRows.map((row) => (
                  <tr key={row.operatorId} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold text-charcoal">{row.operatorName}</td>
                    <td className="px-3 py-2">{row.registration}</td>
                    <td className="px-3 py-2">{durationLabel(row.productiveSeconds)}</td>
                    <td className="px-3 py-2">{durationLabel(row.pausedSeconds)}</td>
                    <td className="px-3 py-2">{row.completedPieces}</td>
                    <td className="px-3 py-2">{decimalLabel(row.completedWeightKg, 3)} kg</td>
                    <td className="px-3 py-2">{decimalLabel(row.piecesPerHour)}</td>
                    <td className="px-3 py-2">{decimalLabel(row.kgPerHour)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={8}>
                    Nenhum apontamento registrado para cálculo de produtividade.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-[980px] w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Colaborador</th>
                <th className="px-3 py-2">Etapa</th>
                <th className="px-3 py-2">Produtivo</th>
                <th className="px-3 py-2">Parado</th>
                <th className="px-3 py-2">Peças</th>
                <th className="px-3 py-2">Kg</th>
                <th className="px-3 py-2">Peças/h</th>
                <th className="px-3 py-2">Kg/h</th>
              </tr>
            </thead>
            <tbody>
              {report.stageRows.length ? (
                report.stageRows.map((row) => (
                  <tr key={`${row.operatorId}-${row.stageName}`} className="border-t border-border">
                    <td className="px-3 py-2 font-semibold text-charcoal">{row.operatorName}</td>
                    <td className="px-3 py-2">{row.stageName}</td>
                    <td className="px-3 py-2">{durationLabel(row.productiveSeconds)}</td>
                    <td className="px-3 py-2">{durationLabel(row.pausedSeconds)}</td>
                    <td className="px-3 py-2">{row.completedPieces}</td>
                    <td className="px-3 py-2">{decimalLabel(row.completedWeightKg, 3)} kg</td>
                    <td className="px-3 py-2">{decimalLabel(row.piecesPerHour)}</td>
                    <td className="px-3 py-2">{decimalLabel(row.kgPerHour)}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={8}>
                    Nenhuma etapa apontada ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PanelBody>
    </Panel>
  );
}

function PointingReport({
  snapshot,
  params,
}: {
  snapshot: ProductionSnapshot;
  params: ReportParams;
}) {
  const filters: ProductionPointingReportFilters = {
    q: params.q ?? "",
    clientId: params.clientId,
    stageId: params.stageId,
    operatorId: params.operatorId,
    action: params.action,
    dateFrom: dateInputValue(params.dateFrom),
    dateTo: dateInputValue(params.dateTo),
  };
  const report = buildProductionPointingReport(snapshot, filters);
  const rows = report.rows.slice(0, 300);

  return (
    <Panel>
      <PanelHeader
        title="Relatório de apontamentos"
        description="Histórico por peça, etapa, operador responsável e participantes."
        actions={<PointingReportPdfButton report={report} />}
      />
      <PanelBody className="space-y-5">
        <form className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 xl:grid-cols-[1.3fr_220px_180px_220px_170px_150px_150px_auto]">
          <input type="hidden" name="view" value="pointing" />
          <input
            name="q"
            defaultValue={filters.q ?? ""}
            className={controlClass}
            placeholder="Cliente, contrato, PROD, peça ou operador"
          />
          <select name="clientId" defaultValue={filters.clientId ?? ""} className={controlClass}>
            <option value="">Todos os clientes</option>
            {snapshot.clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
          <select name="stageId" defaultValue={filters.stageId ?? ""} className={controlClass}>
            <option value="">Todas as etapas</option>
            {snapshot.stages.map((stage) => (
              <option key={stage.id} value={stage.id}>
                {stage.name}
              </option>
            ))}
          </select>
          <select name="operatorId" defaultValue={filters.operatorId ?? ""} className={controlClass}>
            <option value="">Todos os colaboradores</option>
            {snapshot.productionOperators
              .filter((operator) => operator.active)
              .map((operator) => (
                <option key={operator.id} value={operator.id}>
                  {operator.name}
                </option>
              ))}
          </select>
          <select name="action" defaultValue={filters.action ?? ""} className={controlClass}>
            <option value="">Todas as ações</option>
            {Object.entries(productionPointingActionLabels).map(([action, label]) => (
              <option key={action} value={action}>
                {label}
              </option>
            ))}
          </select>
          <input
            type="date"
            name="dateFrom"
            defaultValue={filters.dateFrom ?? ""}
            className={controlClass}
          />
          <input
            type="date"
            name="dateTo"
            defaultValue={filters.dateTo ?? ""}
            className={controlClass}
          />
          <FilterActions view="pointing" />
        </form>

        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <ClipboardList className="mb-2 size-5 text-accent" />
            <p className="text-2xl font-bold text-accent">{report.metrics.events}</p>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Eventos</p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <p className="text-2xl font-bold text-accent">{report.metrics.pieces}</p>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Peças</p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <p className="text-2xl font-bold text-accent">{report.metrics.operators}</p>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Colaboradores</p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <p className="text-2xl font-bold text-accent">
              {durationLabel(report.metrics.productiveSeconds)}
            </p>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Tempo produtivo</p>
          </div>
          <div className="rounded-md border border-border bg-muted/30 p-4">
            <p className="text-2xl font-bold text-accent">
              {durationLabel(report.metrics.pausedSeconds)}
            </p>
            <p className="text-xs font-semibold uppercase text-muted-foreground">Tempo parado</p>
          </div>
        </div>

        {report.rows.length > rows.length ? (
          <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Exibindo os 300 eventos mais recentes. Use os filtros ou gere o PDF para consultar o
            período completo filtrado.
          </p>
        ) : null}

        <div className="overflow-x-auto rounded-md border border-border">
          <table className="min-w-[1180px] w-full text-left text-sm">
            <thead className="bg-muted text-xs uppercase text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Data/hora</th>
                <th className="px-3 py-2">Cliente</th>
                <th className="px-3 py-2">Contrato / PROD</th>
                <th className="px-3 py-2">Peça</th>
                <th className="px-3 py-2">Etapa</th>
                <th className="px-3 py-2">Ação</th>
                <th className="px-3 py-2">Responsável</th>
                <th className="px-3 py-2">Participantes</th>
                <th className="px-3 py-2">Motivo / observação</th>
              </tr>
            </thead>
            <tbody>
              {rows.length ? (
                rows.map((row) => (
                  <tr key={row.id} className="border-t border-border align-top">
                    <td className="px-3 py-2 whitespace-nowrap">{formatDateTime(row.eventAt)}</td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-charcoal">{row.clientName}</p>
                      <p className="text-xs text-muted-foreground">{row.workName}</p>
                    </td>
                    <td className="px-3 py-2">
                      Contrato {row.contractNumber} · {row.prodNumber}
                    </td>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-charcoal">{row.pieceCode}</p>
                      <p className="text-xs text-muted-foreground">{row.systemCode}</p>
                    </td>
                    <td className="px-3 py-2">{row.stageName}</td>
                    <td className="px-3 py-2">{row.actionLabel}</td>
                    <td className="px-3 py-2">{row.operatorName}</td>
                    <td className="px-3 py-2">
                      {row.participantNames.length ? row.participantNames.join(", ") : "-"}
                    </td>
                    <td className="px-3 py-2">
                      {row.reason ? (
                        <p className="font-medium text-amber-800">Motivo: {row.reason}</p>
                      ) : null}
                      {row.notes ? <p className="text-muted-foreground">Obs.: {row.notes}</p> : null}
                      {!row.reason && !row.notes ? "-" : null}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td className="px-3 py-6 text-center text-muted-foreground" colSpan={9}>
                    Nenhum apontamento encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </PanelBody>
    </Panel>
  );
}

function weekStartFromValue(value?: string) {
  const date = value ? new Date(`${value}T12:00:00`) : new Date();
  const safeDate = Number.isFinite(date.getTime()) ? date : new Date();
  const day = safeDate.getDay();
  const monday = new Date(safeDate);
  monday.setDate(safeDate.getDate() + (day === 0 ? -6 : 1 - day));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function isoDate(value: Date) {
  const copy = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return copy.toISOString().slice(0, 10);
}

function buildAgendaRows(snapshot: ProductionSnapshot, start: Date, end: Date) {
  const rows: WeeklyAgendaRow[] = [];

  for (const context of getProdContexts(snapshot)) {
    const date =
      context.prod.delivery_forecast ??
      context.contract.general_delivery_forecast ??
      context.prod.planned_end_date;
    if (!date) continue;

    const deliveryDate = new Date(`${date}T12:00:00`);
    if (!Number.isFinite(deliveryDate.getTime()) || deliveryDate < start || deliveryDate >= end) {
      continue;
    }

    const hasMaterialIssue = snapshot.prodMaterials.some(
      (material) =>
        material.prod_id === context.prod.id && material.confirmation_status !== "confirmado",
    );
    const status = hasMaterialIssue
      ? "Aguardando material"
      : context.currentStage
        ? stageShortLabels[context.currentStage.name] ?? context.currentStage.name
        : prodStatusLabels[context.prod.status];
    const normalizedStatus = normalizeText(status);
    const tone: WeeklyAgendaRow["tone"] = hasMaterialIssue
      ? "amber"
      : normalizedStatus.includes("corte")
        ? "green"
        : normalizedStatus.includes("gaveta")
          ? "blue"
          : normalizedStatus.includes("cancel")
            ? "red"
            : "orange";

    rows.push({
      date,
      client: context.client.name,
      detail: `PROD ${context.prod.prod_number}${context.prod.description ? ` - ${context.prod.description}` : ""}`,
      status,
      tone,
    });
  }

  return rows.sort(
    (left, right) => left.date.localeCompare(right.date) || left.client.localeCompare(right.client),
  );
}

function WeeklyAgendaReport({
  snapshot,
  params,
}: {
  snapshot: ProductionSnapshot;
  params: ReportParams;
}) {
  const start = weekStartFromValue(params.agendaWeek);
  const nextStart = new Date(start);
  nextStart.setDate(start.getDate() + 7);
  const afterNextStart = new Date(nextStart);
  afterNextStart.setDate(nextStart.getDate() + 7);
  const weekValue = dateInputValue(params.agendaWeek) || isoDate(start);
  const currentWeek = buildAgendaRows(snapshot, start, nextStart);
  const nextWeek = buildAgendaRows(snapshot, nextStart, afterNextStart);

  return (
    <Panel>
      <PanelHeader
        title="Agenda de entregas da semana"
        description="Imagem no padrão usado para envio no WhatsApp, baseada na entrega prevista."
      />
      <PanelBody className="space-y-4">
        <form className="grid gap-3 rounded-md border border-border bg-muted/30 p-3 sm:grid-cols-[220px_auto]">
          <input type="hidden" name="view" value="agenda" />
          <label className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Semana de referência</span>
            <input
              type="date"
              name="agendaWeek"
              defaultValue={weekValue || todayInputValue()}
              className={controlClass}
            />
          </label>
          <FilterActions view="agenda" />
        </form>
        <WeeklyProductionAgendaImage currentWeek={currentWeek} nextWeek={nextWeek} />
      </PanelBody>
    </Panel>
  );
}

function renderReport(view: ReportView, snapshot: ProductionSnapshot, params: ReportParams) {
  if (view === "agenda") return <WeeklyAgendaReport snapshot={snapshot} params={params} />;
  if (view === "pointing") return <PointingReport snapshot={snapshot} params={params} />;
  if (view === "productivity") return <ProductivityReport snapshot={snapshot} params={params} />;
  if (view === "contracts") return <ContractsReport snapshot={snapshot} params={params} />;
  if (view === "prods") return <ProdsReport snapshot={snapshot} params={params} />;
  return <ClientsReport snapshot={snapshot} params={params} />;
}

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<ReportParams>;
}) {
  const params = await searchParams;
  const activeView = normalizeView(params.view);
  const access = await getCurrentPermissionFlags(appNavigationPermissionKeys);
  if (!canAccessModule(access, MODULE_ACCESS.reports)) {
    redirect(firstAllowedAppRoute(access) ?? "/login");
  }

  const snapshot = await getReportsPageData();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Relatórios gerenciais"
        description="Relatórios de clientes, contratos, PRODs, produtividade, apontamentos e agenda de entregas."
      />

      <SummaryCards snapshot={snapshot} />
      <ReportTabs activeView={activeView} />
      {renderReport(activeView, snapshot, params)}
    </div>
  );
}
