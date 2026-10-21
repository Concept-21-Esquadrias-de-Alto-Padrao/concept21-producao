import {
  AlertTriangle,
  Factory,
  Gauge,
  PackageCheck,
  Plus,
} from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DashboardAutoRefresh } from "@/components/dashboard-auto-refresh";
import { DashboardCharts } from "@/components/dashboard-charts";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { ProdIdentity } from "@/components/prod-identity";
import { StatCard } from "@/components/stat-card";
import { getDashboardPageData } from "@/lib/data";
import {
  calculateDashboardMetrics,
  calculateStageProductivity,
  getAttentionItems,
  getProdContexts,
} from "@/lib/production";
import { prodStatusLabels } from "@/lib/labels";
import {
  appNavigationPermissionKeys,
  canAccessModule,
  firstAllowedAppRoute,
  MODULE_ACCESS,
} from "@/lib/module-access";
import { formatDurationClock } from "@/lib/pointing";
import { formatDate } from "@/lib/utils";
import { getCurrentPermissionFlags } from "@/lib/server-access";
import { PROD_STATUSES, type ProductionSnapshot } from "@/lib/types";

type DashboardPageProps = {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function numberLabel(value: number, digits = 1) {
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function dateInPeriod(value: string | null | undefined, period: string, referenceDate: Date) {
  if (!period || period === "all") return true;
  if (!value) return false;

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return false;

  const dayStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), referenceDate.getDate());
  const nextDayStart = new Date(dayStart);
  nextDayStart.setDate(dayStart.getDate() + 1);
  const weekStart = new Date(dayStart);
  const day = weekStart.getDay();
  weekStart.setDate(dayStart.getDate() + (day === 0 ? -6 : 1 - day));
  const nextWeekStart = new Date(weekStart);
  nextWeekStart.setDate(weekStart.getDate() + 7);
  const monthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth(), 1);
  const nextMonthStart = new Date(referenceDate.getFullYear(), referenceDate.getMonth() + 1, 1);

  if (period === "today") return date >= dayStart && date < nextDayStart;
  if (period === "week") return date >= weekStart && date < nextWeekStart;
  if (period === "month") return date >= monthStart && date < nextMonthStart;
  return true;
}

function filterDashboardSnapshot(
  snapshot: ProductionSnapshot,
  filters: {
    period: string;
    clientId: string;
    contractId: string;
    prodId: string;
    stageId: string;
    profileId: string;
    departmentId: string;
    status: string;
  },
  now: Date,
) {
  const contexts = getProdContexts(snapshot).filter((context) => {
    const owner = snapshot.profiles.find((profile) => profile.id === context.prod.owner_profile_id);
    const deliveryDate =
      context.prod.delivery_forecast ??
      context.contract.general_delivery_forecast ??
      context.prod.planned_end_date;

    return (
      (!filters.period || dateInPeriod(deliveryDate, filters.period, now)) &&
      (!filters.clientId || context.client.id === filters.clientId) &&
      (!filters.contractId || context.contract.id === filters.contractId) &&
      (!filters.prodId || context.prod.id === filters.prodId) &&
      (!filters.stageId || context.prod.current_stage_id === filters.stageId) &&
      (!filters.profileId || context.prod.owner_profile_id === filters.profileId) &&
      (!filters.departmentId || owner?.department_id === filters.departmentId) &&
      (!filters.status || context.prod.status === filters.status)
    );
  });

  const prodIds = new Set(contexts.map((context) => context.prod.id));
  const contractIds = new Set(contexts.map((context) => context.contract.id));
  const clientIds = new Set(contexts.map((context) => context.client.id));
  const pieces = snapshot.prodPieces.filter((piece) => prodIds.has(piece.prod_id));
  const pieceIds = new Set(pieces.map((piece) => piece.id));
  const pieceStages = snapshot.prodPieceStages.filter(
    (pieceStage) => prodIds.has(pieceStage.prod_id) && pieceIds.has(pieceStage.piece_id),
  );
  const pieceStageIds = new Set(pieceStages.map((pieceStage) => pieceStage.id));
  const stageTimeEntries = snapshot.stageTimeEntries.filter(
    (entry) => prodIds.has(entry.prod_id) && pieceStageIds.has(entry.piece_stage_id),
  );
  const sessionIds = new Set(stageTimeEntries.map((entry) => entry.pointing_session_id).filter(Boolean));

  return {
    ...snapshot,
    clients: snapshot.clients.filter((client) => clientIds.has(client.id)),
    contracts: snapshot.contracts.filter((contract) => contractIds.has(contract.id)),
    prods: snapshot.prods.filter((prod) => prodIds.has(prod.id)),
    prodStages: snapshot.prodStages.filter((stage) => prodIds.has(stage.prod_id)),
    prodMaterials: snapshot.prodMaterials.filter((material) => prodIds.has(material.prod_id)),
    prodPieces: pieces,
    prodPieceStages: pieceStages,
    stageTimeEntries,
    pointingSessions: snapshot.pointingSessions.filter(
      (session) =>
        session.prod_ids.some((prodId) => prodIds.has(prodId)) || sessionIds.has(session.id),
    ),
    pointingSessionParticipants: snapshot.pointingSessionParticipants.filter((participant) =>
      sessionIds.has(participant.pointing_session_id),
    ),
  };
}

export default async function DashboardPage({ searchParams }: DashboardPageProps) {
  const params = searchParams ? await searchParams : {};
  const code = firstParam(params.code);
  const tokenHash = firstParam(params.token_hash);
  const type = firstParam(params.type);

  if (code) {
    const callbackParams = new URLSearchParams({
      code,
      next: "/login?confirmed=1",
    });

    redirect(`/auth/callback?${callbackParams.toString()}`);
  }

  if (tokenHash && type) {
    const callbackParams = new URLSearchParams({
      token_hash: tokenHash,
      type,
      next: "/login?confirmed=1",
    });

    redirect(`/auth/callback?${callbackParams.toString()}`);
  }

  const access = await getCurrentPermissionFlags(appNavigationPermissionKeys);
  if (!canAccessModule(access, MODULE_ACCESS.dashboard)) {
    redirect(firstAllowedAppRoute(access) ?? "/login");
  }

  const snapshot = await getDashboardPageData();
  const now = new Date();
  const filters = {
    period: firstParam(params.period) ?? "all",
    clientId: firstParam(params.clientId) ?? "",
    contractId: firstParam(params.contractId) ?? "",
    prodId: firstParam(params.prodId) ?? "",
    stageId: firstParam(params.stageId) ?? "",
    profileId: firstParam(params.profileId) ?? "",
    departmentId: firstParam(params.departmentId) ?? "",
    status: firstParam(params.status) ?? "",
  };
  const filteredSnapshot = filterDashboardSnapshot(snapshot, filters, now);
  const metrics = calculateDashboardMetrics(filteredSnapshot);
  const dashboardNowMs = now.getTime();
  const stageProductivity = calculateStageProductivity(filteredSnapshot, dashboardNowMs);
  const attentionItems = getAttentionItems(filteredSnapshot);
  const contexts = getProdContexts(snapshot);

  return (
    <div className="space-y-6">
      <DashboardAutoRefresh />
      <PageHeader
        title="Dashboard de Produção"
        description="Acompanhe PRODs, materiais, etapas e expedição."
        actions={
          <Link
            href="/prods"
            className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500"
          >
            <Plus className="size-4" />
            Nova PROD
          </Link>
        }
      />

      <form action="/" className="rounded-md border border-border bg-card p-3 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <label className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Período</span>
            <select
              name="period"
              defaultValue={filters.period}
              className="min-h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-charcoal outline-none focus:border-accent"
            >
              <option value="all">Todos</option>
              <option value="today">Hoje</option>
              <option value="week">Semana atual</option>
              <option value="month">Mês atual</option>
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Cliente</span>
            <select
              name="clientId"
              defaultValue={filters.clientId}
              className="min-h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-charcoal outline-none focus:border-accent"
            >
              <option value="">Todos</option>
              {snapshot.clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Contrato</span>
            <select
              name="contractId"
              defaultValue={filters.contractId}
              className="min-h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-charcoal outline-none focus:border-accent"
            >
              <option value="">Todos</option>
              {snapshot.contracts.map((contract) => (
                <option key={contract.id} value={contract.id}>
                  {contract.contract_number}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">PROD</span>
            <select
              name="prodId"
              defaultValue={filters.prodId}
              className="min-h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-charcoal outline-none focus:border-accent"
            >
              <option value="">Todas</option>
              {contexts.map((context) => (
                <option key={context.prod.id} value={context.prod.id}>
                  PROD {context.prod.prod_number} - {context.client.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Etapa atual</span>
            <select
              name="stageId"
              defaultValue={filters.stageId}
              className="min-h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-charcoal outline-none focus:border-accent"
            >
              <option value="">Todas</option>
              {snapshot.stages.map((stage) => (
                <option key={stage.id} value={stage.id}>
                  {stage.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Responsável</span>
            <select
              name="profileId"
              defaultValue={filters.profileId}
              className="min-h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-charcoal outline-none focus:border-accent"
            >
              <option value="">Todos</option>
              {snapshot.profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Departamento</span>
            <select
              name="departmentId"
              defaultValue={filters.departmentId}
              className="min-h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-charcoal outline-none focus:border-accent"
            >
              <option value="">Todos</option>
              {snapshot.departments.map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1">
            <span className="text-xs font-semibold text-muted-foreground">Status</span>
            <select
              name="status"
              defaultValue={filters.status}
              className="min-h-10 w-full rounded-md border border-border bg-white px-3 text-sm text-charcoal outline-none focus:border-accent"
            >
              <option value="">Todos</option>
              {PROD_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {prodStatusLabels[status]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            className="inline-flex min-h-10 items-center justify-center rounded-md bg-charcoal px-4 py-2 text-sm font-semibold text-white hover:bg-black"
          >
            Aplicar filtros
          </button>
          <Link
            href="/"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-charcoal hover:bg-muted"
          >
            Limpar
          </Link>
          <span className="text-sm text-muted-foreground">
            {filteredSnapshot.prods.length} PROD(s) no recorte.
          </span>
        </div>
      </form>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="PRODs em andamento"
          value={metrics.prodsInProgress}
          hint="Em produção, embalagem ou expedição."
          icon={Factory}
          tone="accent"
        />
        <StatCard
          label="PRODs com pendências"
          value={metrics.prodsWithIssues}
          hint="Materiais, listas ou paradas operacionais."
          icon={AlertTriangle}
          tone="danger"
        />
        <StatCard
          label="Aguardando materiais"
          value={metrics.prodsAwaitingMaterials}
          hint="Confirmação parcial, pendente ou indisponível."
          icon={PackageCheck}
        />
      </div>

      {stageProductivity.length ? (
        <Panel>
          <PanelHeader
            title="Produtividade por etapa"
            description="Indicadores calculados pela união dos intervalos produtivos apontados."
          />
          <PanelBody>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
              {stageProductivity.map((item) => (
                <article
                  key={item.stage.id}
                  className="rounded-md border border-border bg-white p-3"
                >
                  <div className="mb-3 flex items-center gap-2">
                    <span className="grid size-9 place-items-center rounded-md bg-orange-50 text-accent ring-1 ring-orange-100">
                      <Gauge className="size-4" />
                    </span>
                    <div>
                      <p className="text-xs font-semibold uppercase text-muted-foreground">
                        Produtividade
                      </p>
                      <h2 className="font-semibold text-charcoal">{item.label}</h2>
                    </div>
                  </div>
                  {item.isExpedition ? (
                    <div className="space-y-2 text-sm">
                      <p className="flex items-baseline justify-between gap-3">
                        <span className="text-muted-foreground">entregues/semana</span>
                        <strong className="text-lg text-charcoal">
                          {numberLabel(item.week.pieces, 0)} pç
                        </strong>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Semana anterior: {numberLabel(item.previousWeek.pieces, 0)} pç
                      </p>
                      <p className="flex items-baseline justify-between gap-3 border-t border-border pt-2">
                        <span className="text-muted-foreground">entregues/mês</span>
                        <strong className="text-lg text-charcoal">
                          {numberLabel(item.month.pieces, 0)} pç
                        </strong>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Mês anterior: {numberLabel(item.previousMonth.pieces, 0)} pç
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-2 text-sm">
                      <p className="flex items-baseline justify-between gap-3">
                        <span className="text-muted-foreground">kg/hora</span>
                        <strong className="text-lg text-charcoal">
                          {numberLabel(item.kgPerHour)} kg/h
                        </strong>
                      </p>
                      <p className="flex items-baseline justify-between gap-3">
                        <span className="text-muted-foreground">peças/hora</span>
                        <strong className="text-lg text-charcoal">
                          {numberLabel(item.piecesPerHour)} pç/h
                        </strong>
                      </p>
                      <div className="grid grid-cols-2 gap-2 border-t border-border pt-2 text-xs text-muted-foreground">
                        <span>kg/dia: {numberLabel(item.today.weightKg, 3)}</span>
                        <span>pç/dia: {numberLabel(item.today.pieces, 0)}</span>
                        <span>kg/semana: {numberLabel(item.week.weightKg, 3)}</span>
                        <span>pç/semana: {numberLabel(item.week.pieces, 0)}</span>
                        <span>kg/mês: {numberLabel(item.month.weightKg, 3)}</span>
                        <span>pç/mês: {numberLabel(item.month.pieces, 0)}</span>
                      </div>
                      <p className="border-t border-border pt-2 text-xs text-muted-foreground">
                        {item.completedPieces} peça(s) concluída(s) ·{" "}
                        {numberLabel(item.completedWeightKg, 3)} kg ·{" "}
                        {formatDurationClock(item.productiveSeconds)}
                      </p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </PanelBody>
        </Panel>
      ) : null}

      <DashboardCharts snapshot={filteredSnapshot} />

      <div className="grid gap-4">
        <Panel>
          <PanelHeader
            title="Painel de atenção"
            description="PRODs que precisam de ação antes do próximo avanço."
          />
          <PanelBody className="space-y-3">
            {attentionItems.map((item) => (
              <article
                key={`${item.prod.prod.id}-${item.reason}`}
                className="rounded-md border border-border bg-white p-3"
              >
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <ProdIdentity
                      client={item.prod.client}
                      contract={item.prod.contract}
                      prod={item.prod.prod}
                      compact
                    />
                    <p className="mt-1 text-sm text-muted-foreground">{item.reason}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <PriorityBadge
                      priority={
                        item.urgency === "alta"
                          ? "urgente"
                          : item.urgency === "media"
                            ? "alta"
                            : "normal"
                      }
                    />
                    <StatusBadge status={item.prod.prod.status} />
                  </div>
                </div>
                <p className="mt-2 text-xs font-medium text-muted-foreground">
                  Etapa: {item.prod.currentStage?.name ?? "Sem etapa"} · Prazo:{" "}
                  {formatDate(item.deadline)}
                </p>
              </article>
            ))}
          </PanelBody>
        </Panel>
      </div>

      <p className="text-xs text-muted-foreground">
        Fonte atual: {snapshot.source === "demo" ? "dados demonstrativos" : "Supabase"}.
      </p>
    </div>
  );
}
