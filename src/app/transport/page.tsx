import { TRANSPORT_ENABLED } from "@/lib/transport-module";
import Link from "next/link";
import { BarChart3, ClipboardList } from "lucide-react";
import { notFound, redirect } from "next/navigation";
import { ExtraServicesBoard } from "@/components/extra-services-board";
import { FreightsBoard } from "@/components/freights-board";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { RouteReportClient } from "@/components/route-report-client";
import { RoutesBoard } from "@/components/routes-board";
import { TransportReportPdfButton } from "@/components/transport-report-pdf-button";
import { getRoutesPageData } from "@/lib/data";
import { freightStatusLabels } from "@/lib/labels";
import {
  appNavigationPermissionKeys,
  canAccessModule,
  firstAllowedAppRoute,
  MODULE_ACCESS,
} from "@/lib/module-access";
import { getRoutesForDate, summarizeTransportPeriod } from "@/lib/production";
import { getCurrentPermissionFlags } from "@/lib/server-access";
import type { Freight, ProductionSnapshot } from "@/lib/types";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type TransportTab =
  | "freights"
  | "extra-services"
  | "routes"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly";

type TransportParams = {
  tab?: string;
  date?: string;
  routeId?: string;
};

const tabs: Array<{ id: TransportTab; label: string }> = [
  { id: "freights", label: "Fretes" },
  { id: "extra-services", label: "Avulsos" },
  { id: "routes", label: "Rotas" },
  { id: "daily", label: "Relatório diário" },
  { id: "weekly", label: "Relatório semanal" },
  { id: "monthly", label: "Relatório mensal" },
  { id: "yearly", label: "Relatório anual" },
];

function normalizeTab(value?: string): TransportTab {
  return tabs.some((tab) => tab.id === value) ? (value as TransportTab) : "freights";
}

function todayIso() {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function routeStatusLabel(status: string) {
  if (status === "pre_agendado") return "Pré-agendado";
  return freightStatusLabels[status as keyof typeof freightStatusLabels] ?? status;
}

function dateToTimestamp(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function startOfWeek(timestamp: number) {
  const date = new Date(timestamp);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

function dateToIso(date: Date) {
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatPeriodLabel(tab: Extract<TransportTab, "weekly" | "monthly" | "yearly">, date: string) {
  const timestamp = dateToTimestamp(date);
  if (timestamp === null) return `Referência: ${formatDate(date)}`;

  const anchorDate = new Date(timestamp);
  if (tab === "weekly") {
    const start = new Date(startOfWeek(timestamp));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return `${formatDate(dateToIso(start))} a ${formatDate(dateToIso(end))}`;
  }

  if (tab === "monthly") {
    const month = new Intl.DateTimeFormat("pt-BR", {
      month: "long",
      timeZone: "America/Sao_Paulo",
      year: "numeric",
    }).format(anchorDate);
    return month.charAt(0).toUpperCase() + month.slice(1);
  }

  return `Ano de ${anchorDate.getFullYear()}`;
}

function formatGeneratedAt() {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Sao_Paulo",
  }).format(new Date());
}

function routeMatchesPeriod(route: Freight, tab: TransportTab, anchor: string) {
  const routeTimestamp = dateToTimestamp(route.freight_date);
  const anchorTimestamp = dateToTimestamp(anchor);
  if (routeTimestamp === null || anchorTimestamp === null) return true;

  const routeDate = new Date(routeTimestamp);
  const anchorDate = new Date(anchorTimestamp);

  if (tab === "daily") return route.freight_date === anchor;
  if (tab === "weekly") return startOfWeek(routeTimestamp) === startOfWeek(anchorTimestamp);
  if (tab === "monthly") {
    return (
      routeDate.getFullYear() === anchorDate.getFullYear() &&
      routeDate.getMonth() === anchorDate.getMonth()
    );
  }
  if (tab === "yearly") return routeDate.getFullYear() === anchorDate.getFullYear();
  return true;
}

function TransportTabs({ activeTab }: { activeTab: TransportTab }) {
  return (
    <div className="overflow-x-auto border-b border-border">
      <div className="flex min-w-max gap-1">
        {tabs.map((tab) => (
          <Link
            key={tab.id}
            href={`/transport?tab=${tab.id}`}
            className={cn(
              "border-b-2 px-4 py-3 text-sm font-medium transition",
              activeTab === tab.id
                ? "border-accent text-accent"
                : "border-transparent text-muted-foreground hover:text-charcoal",
            )}
          >
            {tab.label}
          </Link>
        ))}
      </div>
    </div>
  );
}

function PeriodFilter({
  tab,
  date,
}: {
  tab: TransportTab;
  date: string;
}) {
  return (
    <form className="flex flex-col gap-3 sm:flex-row sm:items-end">
      <input type="hidden" name="tab" value={tab} />
      <label className="block space-y-1.5">
        <span className="text-sm font-semibold text-charcoal">Data de referência</span>
        <input
          name="date"
          type="date"
          defaultValue={date}
          className="min-h-11 rounded-md border border-border bg-white px-3 text-sm"
        />
      </label>
      <button className="min-h-11 rounded-md bg-charcoal px-4 text-sm font-semibold text-white">
        Aplicar
      </button>
    </form>
  );
}

function DailyReport({
  snapshot,
  date,
  selectedRouteId,
  canIncludeValues,
}: {
  snapshot: ProductionSnapshot;
  date: string;
  selectedRouteId?: string;
  canIncludeValues: boolean;
}) {
  const routes = getRoutesForDate(snapshot, date);
  const selectedRoute =
    routes.find((route) => route.freight.id === selectedRouteId) ?? routes[0] ?? null;

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title="Relatório da rota do dia"
          description="Gere o texto para copiar e enviar no WhatsApp."
        />
        <PanelBody className="space-y-4">
          <form className="grid gap-3 sm:grid-cols-[180px_1fr_auto]">
            <input type="hidden" name="tab" value="daily" />
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-charcoal">Data</span>
              <input
                name="date"
                type="date"
                defaultValue={date}
                className="min-h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
              />
            </label>
            <label className="block space-y-1.5">
              <span className="text-sm font-semibold text-charcoal">Rota</span>
              <select
                name="routeId"
                defaultValue={selectedRoute?.freight.id ?? ""}
                className="min-h-11 w-full rounded-md border border-border bg-white px-3 text-sm"
              >
                {routes.length === 0 ? (
                  <option value="">Nenhuma rota na data</option>
                ) : (
                  routes.map((route) => (
                    <option key={route.freight.id} value={route.freight.id}>
                      {route.freight.title} · {route.freight.driver ?? "Sem motorista"}
                    </option>
                  ))
                )}
              </select>
            </label>
            <button className="min-h-11 rounded-md bg-charcoal px-4 text-sm font-semibold text-white sm:self-end">
              Gerar
            </button>
          </form>

          {selectedRoute ? (
            <RouteReportClient
              freight={selectedRoute.freight}
              stops={selectedRoute.stops}
              snapshot={snapshot}
              canIncludeValues={canIncludeValues}
            />
          ) : (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/50 p-6 text-center">
              <ClipboardList className="size-8 text-muted-foreground" />
              <p className="mt-3 font-semibold text-charcoal">Nenhuma rota encontrada</p>
              <p className="text-sm text-muted-foreground">
                Selecione outra data ou crie uma rota em planejamento.
              </p>
            </div>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}

function PeriodReport({
  snapshot,
  tab,
  date,
}: {
  snapshot: ProductionSnapshot;
  tab: Extract<TransportTab, "weekly" | "monthly" | "yearly">;
  date: string;
}) {
  const routes = snapshot.freights.filter((route) => routeMatchesPeriod(route, tab, date));
  const routeIds = new Set(routes.map((route) => route.id));
  const stops = snapshot.freightStops.filter((stop) => routeIds.has(stop.freight_id));
  const summary = summarizeTransportPeriod(snapshot, routes, stops);
  const titleByTab = {
    weekly: "Relatório semanal",
    monthly: "Relatório mensal",
    yearly: "Relatório anual",
  };
  const title = titleByTab[tab];
  const pdfReport = {
    title,
    periodLabel: formatPeriodLabel(tab, date),
    generatedAt: formatGeneratedAt(),
    metrics: [
      { label: "Rotas", value: summary.totalRoutes },
      { label: "Paradas", value: summary.totalStops },
      { label: "Fretes", value: summary.totalProdFreights },
      { label: "Avulsos", value: summary.totalExtraServices },
      { label: "Valor", value: formatCurrency(summary.totalExpectedValue) },
      { label: "Km", value: summary.totalDistanceKm.toLocaleString("pt-BR") },
    ],
    statusRows: Object.entries(summary.statusCounts).map(([status, count]) => ({
      status: routeStatusLabel(status),
      count,
    })),
    driverRows: summary.driverRanking.map((item) => ({
      driver: item.driver,
      routes: item.routes,
      value: formatCurrency(item.value),
    })),
    clientRows: summary.clientRanking.map((item) => ({
      client: item.client,
      prods: item.prods,
      routes: item.routes,
    })),
    routeRows: routes.map((route) => {
      const routeStops = stops.filter((stop) => stop.freight_id === route.id);

      return {
        date: formatDate(route.freight_date),
        title: route.title,
        driver: route.driver ?? "Não informado",
        vehicle: `${route.vehicle ?? "Não informado"}${route.plate ? ` - ${route.plate}` : ""}`,
        status: routeStatusLabel(route.status),
        stops: routeStops.length,
        value: formatCurrency(route.expected_value),
        internalCost: formatCurrency(route.internal_total_cost),
        distanceKm: route.distance_km.toLocaleString("pt-BR"),
      };
    }),
  };

  return (
    <div className="space-y-4">
      <Panel>
        <PanelHeader
          title={title}
          description="Visão consolidada das rotas, fretes de PROD, avulsos e custos do período."
          actions={<TransportReportPdfButton report={pdfReport} />}
        />
        <PanelBody>
          <PeriodFilter tab={tab} date={date} />
        </PanelBody>
      </Panel>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-6">
        {[
          ["Rotas", summary.totalRoutes],
          ["Paradas", summary.totalStops],
          ["Fretes", summary.totalProdFreights],
          ["Avulsos", summary.totalExtraServices],
          ["Valor", formatCurrency(summary.totalExpectedValue)],
          ["Km", summary.totalDistanceKm.toLocaleString("pt-BR")],
        ].map(([label, value]) => (
          <div key={label} className="rounded-md border border-border bg-card p-4 shadow-sm">
            <p className="text-sm font-semibold text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-bold text-charcoal">{value}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Panel>
          <PanelHeader title="Status das rotas" />
          <PanelBody className="space-y-2">
            {Object.entries(summary.statusCounts).length === 0 ? (
              <p className="text-sm text-muted-foreground">Sem rotas no período.</p>
            ) : (
              Object.entries(summary.statusCounts).map(([status, count]) => (
                <div
                  key={status}
                  className="flex items-center justify-between rounded-md border border-border bg-white px-3 py-2 text-sm"
                >
                  <span className="font-medium text-charcoal">{routeStatusLabel(status)}</span>
                  <span className="font-semibold text-accent">{count}</span>
                </div>
              ))
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Motoristas" />
          <PanelBody className="space-y-2">
            {summary.driverRanking.slice(0, 6).map((item) => (
              <div
                key={item.driver}
                className="rounded-md border border-border bg-white px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-charcoal">{item.driver}</span>
                  <span className="text-muted-foreground">{item.routes} rota(s)</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Valor previsto: {formatCurrency(item.value)}
                </p>
              </div>
            ))}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Clientes atendidos" />
          <PanelBody className="space-y-2">
            {summary.clientRanking.slice(0, 6).map((item) => (
              <div
                key={item.client}
                className="rounded-md border border-border bg-white px-3 py-2 text-sm"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-charcoal">{item.client}</span>
                  <span className="text-muted-foreground">{item.prods} PROD(s)</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {item.routes} parada(s) no período
                </p>
              </div>
            ))}
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader title="Rotas do período" />
        <PanelBody>
          {routes.length === 0 ? (
            <div className="flex min-h-40 flex-col items-center justify-center rounded-md border border-dashed border-border bg-muted/50 p-6 text-center">
              <BarChart3 className="size-8 text-muted-foreground" />
              <p className="mt-3 font-semibold text-charcoal">Nenhum resultado</p>
              <p className="text-sm text-muted-foreground">
                Ajuste a data de referência para ampliar a busca.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {routes.map((route) => {
                const routeStops = stops.filter((stop) => stop.freight_id === route.id);

                return (
                  <article key={route.id} className="rounded-md border border-border bg-white p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <p className="font-semibold text-charcoal">{route.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {formatDate(route.freight_date)} · Motorista:{" "}
                          {route.driver ?? "Não informado"} · Valor:{" "}
                          {formatCurrency(route.expected_value)}
                        </p>
                      </div>
                      <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold text-muted-foreground">
                        {routeStatusLabel(route.status)}
                      </span>
                    </div>
                    <p className="mt-3 text-sm text-muted-foreground">
                      {routeStops.length} parada(s), sendo{" "}
                      {routeStops.filter((stop) => stop.stop_type === "entrega_prod").length}{" "}
                      frete(s) de PROD e{" "}
                      {routeStops.filter((stop) => stop.stop_type !== "entrega_prod").length}{" "}
                      avulso(s).
                    </p>
                  </article>
                );
              })}
            </div>
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}

function renderActiveTab({
  activeTab,
  snapshot,
  params,
  canEditFreights,
  canEditRoutes,
  canDeleteRoutes,
  canIncludeValues,
}: {
  activeTab: TransportTab;
  snapshot: ProductionSnapshot;
  params: TransportParams;
  canEditFreights: boolean;
  canEditRoutes: boolean;
  canDeleteRoutes: boolean;
  canIncludeValues: boolean;
}) {
  const date = params.date || todayIso();

  if (activeTab === "freights") return <FreightsBoard snapshot={snapshot} canEdit={canEditFreights} />;
  if (activeTab === "extra-services") return <ExtraServicesBoard snapshot={snapshot} />;
  if (activeTab === "routes") {
    return (
      <RoutesBoard
        snapshot={snapshot}
        canEdit={canEditRoutes}
        canDelete={canDeleteRoutes}
      />
    );
  }
  if (activeTab === "daily") {
    return (
      <DailyReport
        snapshot={snapshot}
        date={date}
        selectedRouteId={params.routeId}
        canIncludeValues={canIncludeValues}
      />
    );
  }

  return <PeriodReport snapshot={snapshot} tab={activeTab} date={date} />;
}

export default async function TransportPage({
  searchParams,
}: {
  searchParams: Promise<TransportParams>;
}) {
  if (!TRANSPORT_ENABLED) notFound();
  const params = await searchParams;
  const activeTab = normalizeTab(params.tab);
  const access = await getCurrentPermissionFlags([
    ...appNavigationPermissionKeys,
    "production.freights.edit",
    "production.routes.edit",
    "production.freights.manage_values",
  ]);

  if (!canAccessModule(access, MODULE_ACCESS.transport)) {
    redirect(firstAllowedAppRoute(access) ?? "/login");
  }

  const snapshot = await getRoutesPageData();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transporte"
        description="Fretes, avulsos, rotas e relatórios logísticos em um fluxo único."
      />

      <TransportTabs activeTab={activeTab} />

      {renderActiveTab({
        activeTab,
        snapshot,
        params,
        canEditFreights: access.permissions["production.freights.edit"],
        canEditRoutes: access.permissions["production.routes.edit"],
        canDeleteRoutes: access.isMaster,
        canIncludeValues:
          access.isMaster || access.permissions["production.freights.manage_values"],
      })}
    </div>
  );
}
