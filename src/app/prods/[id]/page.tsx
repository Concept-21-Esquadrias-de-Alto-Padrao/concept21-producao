import { ProdLifecyclePanel, LifecycleHistory, DispatchHistory } from "@/components/lifecycle-panel";
import { getLifecycleHistory } from "@/lib/lifecycle-data";
import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, History } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { PriorityBadge, StatusBadge } from "@/components/badges";
import { ProdOperations } from "@/components/prod-operations";
import { getProdDetailPageData } from "@/lib/data";
import {
  buildProdContext,
  formatProdIdentification,
} from "@/lib/production";
import {
  appNavigationPermissionKeys,
  canAccessModule,
  firstAllowedAppRoute,
  MODULE_ACCESS,
} from "@/lib/module-access";
import { getCurrentPermissionFlags } from "@/lib/server-access";
import type { AuditLog, ProductionSnapshot } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";

export default async function ProdDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const { id } = await params;
  const detailSearchParams = await searchParams;
  const backHref = safeProdsReturnPath(detailSearchParams.returnTo);
  const routeAccess = await getCurrentPermissionFlags(appNavigationPermissionKeys);
  if (!canAccessModule(routeAccess, MODULE_ACCESS.prods)) {
    redirect(firstAllowedAppRoute(routeAccess) ?? "/login");
  }

  const snapshot = await getProdDetailPageData(id);
  const prod = snapshot.prods.find((item) => item.id === id);
  if (!prod) notFound();
  const context = buildProdContext(snapshot, prod);
  if (!context) notFound();
  if ((prod.lifecycle?.archived_at || context.contract.lifecycle?.archived_at) && !routeAccess.isMaster) notFound();
  const lifecycleHistory = await getLifecycleHistory(id, "prod");

  const stages = snapshot.prodStages
    .filter((stage) => stage.prod_id === prod.id)
    .map((prodStage) => ({
      prodStage,
      stage: snapshot.stages.find((stage) => stage.id === prodStage.stage_id) ?? null,
    }))
    .sort((a, b) => (a.stage?.sort_order ?? 0) - (b.stage?.sort_order ?? 0));
  const materials = snapshot.prodMaterials.filter((material) => material.prod_id === prod.id);
  const checks = snapshot.documentChecks.filter((check) => check.prod_id === prod.id);
  const selectedItems = snapshot.selectedItems.filter((item) => item.prod_id === prod.id);
  const pieces = snapshot.prodPieces.filter((piece) => piece.prod_id === prod.id);
  const pieceImports = snapshot.prodPieceImports.filter(
    (pieceImport) => pieceImport.prod_id === prod.id,
  );
  const pieceStages = snapshot.prodPieceStages.filter((pieceStage) => pieceStage.prod_id === prod.id);
  const shipping = snapshot.shippingRecords.find((record) => record.prod_id === prod.id) ?? null;
  const audit = snapshot.auditLogs
    .filter((log) => log.entity_id === prod.id)
    .filter((log) => !isTechnicalPieceTotalsUpdate(log));
  const importAuditIds = new Set(
    audit
      .map((log) => {
        const importBatchId = log.after_data?.import_batch_id;
        return typeof importBatchId === "string" ? importBatchId : null;
      })
      .filter((importBatchId): importBatchId is string => Boolean(importBatchId)),
  );
  const history = [
    ...audit.map((log) => ({
      id: `audit-${log.id}`,
      ...describeAuditLog(log),
      created_at: log.created_at,
      user_id: log.user_id,
    })),
    ...pieceImports
      .filter((pieceImport) => !importAuditIds.has(pieceImport.id))
      .map((pieceImport) => ({
        id: `import-${pieceImport.id}`,
        title: "Importação de peças",
        created_at: pieceImport.created_at,
        user_id: pieceImport.created_by,
        description: `${pieceImport.file_name} importado para a PROD.`,
      })),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const stagePermissionKeys = snapshot.stages
    .map((stage) => stage.required_permission)
    .filter((permission): permission is string => Boolean(permission));
  const access = await getCurrentPermissionFlags([
    "production.prods.update_stage",
    "production.pointing.rollback",
    "production.prods.import_pieces",
    "production.prods.manage_pieces",
    "production.prods.release_to_production",
    "production.rework.view",
    "production.rework.manage",
    "production.pointing.adjust_time",
    "production.materials.forecast",
    "production.materials.confirm",
    "production.materials.update_location",
    "production.documents.manage",
    "production.machining.manage",
    "production.preparation_assembly.manage",
    "production.packaging.manage",
    "production.shipping.manage",
    ...stagePermissionKeys,
  ]);
  const serverNowIso = new Date().toISOString();

  return (
    <div className="space-y-6">
      <PageHeader
        title={formatProdIdentification(context.client, context.contract, context.prod)}
        description={prod.description ?? "Acompanhamento completo da PROD."}
        actions={
          <>
            <Link
              href={backHref}
              className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-charcoal transition hover:bg-muted"
            >
              <ArrowLeft className="size-4" />
              Voltar
            </Link>
            <PriorityBadge priority={prod.priority} />
            <StatusBadge status={prod.status} />
          </>
        }
      />

      <ProdLifecyclePanel prod={prod} contract={context.contract} pieces={pieces} permissions={access.permissions} isMaster={access.isMaster} />
      <div className="grid gap-4 lg:grid-cols-[1fr_0.36fr]">
        <Panel>
          <PanelHeader
            title="Movimentações da PROD"
            description="Atualize previsão de materiais, confirmações, recebimentos, seleção, embalagem e expedição."
          />
          <PanelBody>
            <ProdOperations
              prodId={prod.id}
              stages={stages}
              materials={materials}
              checks={checks}
              selectedItems={selectedItems}
              shipping={shipping}
              pieces={pieces}
              pieceImports={pieceImports}
              pieceStages={pieceStages}
              operators={snapshot.productionOperators}
              pointingSessions={snapshot.pointingSessions}
              pointingSessionParticipants={snapshot.pointingSessionParticipants}
              stageTimeEntries={snapshot.stageTimeEntries}
              reworkReasons={snapshot.reworkReasons}
              pieceReworks={snapshot.pieceReworks}
              serverNowIso={serverNowIso}
              profiles={snapshot.profiles}
              isMaster={Boolean(access.isMaster && !prod.lifecycle?.archived_at && !context.contract.lifecycle?.archived_at)}
              permissions={prod.lifecycle?.archived_at || context.contract.lifecycle?.archived_at ? {} : access.permissions}
            />
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Resumo" />
          <PanelBody className="space-y-3 text-sm">
            <Info label="Cliente" value={context.client.name} />
            <Info label="Contrato" value={context.contract.contract_number} />
            <Info label="Obra" value={context.contract.work_name} />
            <Info label="Início previsto" value={formatDate(prod.planned_start_date)} />
            <Info label="Conclusão prevista" value={formatDate(prod.planned_end_date)} />
            <Info label="Entrega prevista" value={formatDate(prod.delivery_forecast)} />
            <Info label="Peças" value={String(prod.pieces_count ?? pieces.length)} />
            <Info
              label="Área total"
              value={`${Number(prod.pieces_area_m2 ?? 0).toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })} m²`}
            />
            <Info
              label="Peso total"
              value={`${Number(prod.pieces_weight_kg ?? 0).toLocaleString("pt-BR", {
                minimumFractionDigits: 3,
                maximumFractionDigits: 3,
              })} kg`}
            />
          </PanelBody>
        </Panel>
      </div>

      <DispatchHistory dispatches={lifecycleHistory.dispatches} profiles={snapshot.profiles.map(p => ({id:p.id,name:p.name}))} />
      <LifecycleHistory events={lifecycleHistory.events} profiles={snapshot.profiles.map(p => ({id:p.id,name:p.name}))} />
      <Panel>
        <details>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 border-b border-border px-4 py-3">
            <span>
              <span className="block font-semibold text-charcoal">Histórico</span>
              <span className="text-sm text-muted-foreground">
                {history.length} evento(s) registrado(s) nesta PROD.
              </span>
            </span>
            <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted-foreground">
              Abrir
            </span>
          </summary>
        <PanelBody className="space-y-3">
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sem eventos registrados.</p>
          ) : (
            history.map((entry) => (
              <article key={entry.id} className="rounded-md border border-border bg-white p-3">
                <div className="flex items-start gap-2">
                  <History className="mt-0.5 size-4 text-muted-foreground" />
                  <div>
                    <p className="font-semibold text-charcoal">{entry.title}</p>
                    <p className="text-sm text-muted-foreground">
                      {formatDateTime(entry.created_at)} ·{" "}
                      {getProfileByAuditUserId(snapshot, entry.user_id)?.name ?? "Sistema"}
                    </p>
                    {entry.description ? (
                      <p className="mt-1 text-sm text-muted-foreground">{entry.description}</p>
                    ) : null}
                  </div>
                </div>
              </article>
            ))
          )}
        </PanelBody>
        </details>
      </Panel>
    </div>
  );
}

function safeProdsReturnPath(value?: string) {
  if (!value || value.startsWith("//") || !value.startsWith("/prods")) {
    return "/prods";
  }

  try {
    const url = new URL(value, "https://concept21.local");
    if (url.pathname !== "/prods") return "/prods";
    return `${url.pathname}${url.search}`;
  } catch {
    return "/prods";
  }
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-semibold text-muted-foreground">{label}</p>
      <p className="font-medium text-charcoal">{value}</p>
    </div>
  );
}

function getProfileByAuditUserId(snapshot: ProductionSnapshot, userId?: string | null) {
  if (!userId) return null;
  return (
    snapshot.profiles.find((profile) => profile.user_id === userId || profile.id === userId) ?? null
  );
}

function describeValue(value: unknown) {
  if (value == null || value === "") return "não informado";
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(value)) return formatDate(value);
  return String(value);
}

function changedKeys(log: AuditLog) {
  if (!log.before_data || !log.after_data) return [];
  const ignoredFields = new Set(["updated_at", "last_updated_at"]);
  const keys = Array.from(
    new Set([...Object.keys(log.before_data), ...Object.keys(log.after_data)]),
  );

  return keys.filter(
    (key) =>
      !ignoredFields.has(key) &&
      JSON.stringify(log.before_data?.[key]) !== JSON.stringify(log.after_data?.[key]),
  );
}

function describeAuditLog(log: AuditLog) {
  if (log.notes) {
    return {
      title:
        log.action === "insert"
          ? "Criação"
          : log.action === "delete"
            ? "Exclusão"
            : "Atualização com observação",
      description: log.notes,
    };
  }

  if (log.action === "insert") return { title: "Criação", description: "Registro criado." };
  if (log.action === "delete") return { title: "Exclusão", description: "Registro removido." };
  if (log.action !== "update") return { title: log.action, description: null };

  const keys = changedKeys(log);
  const labels: Record<string, string> = {
    status: "Status da PROD alterado",
    priority: "Prioridade da PROD alterada",
    current_stage_id: "Etapa atual alterada",
    delivery_forecast: "Entrega prevista alterada",
    planned_start_date: "Início previsto alterado",
    planned_end_date: "Conclusão prevista alterada",
    actual_start_date: "Início real alterado",
    actual_end_date: "Conclusão real alterada",
    owner_profile_id: "Responsável alterado",
    description: "Descrição da PROD alterada",
    notes: "Observações da PROD alteradas",
    released_to_production: "Liberação para produção alterada",
  };
  const importantKey = keys.find((key) => labels[key]) ?? keys[0];

  if (!importantKey) {
    return {
      title: "Atualização automática",
      description: "O sistema sincronizou dados técnicos da PROD.",
    };
  }

  return {
    title: labels[importantKey] ?? "Dados da PROD atualizados",
    description: `Antes: ${describeValue(log.before_data?.[importantKey])}. Depois: ${describeValue(
      log.after_data?.[importantKey],
    )}.`,
  };
}

function isTechnicalPieceTotalsUpdate(log: AuditLog) {
  if (log.entity !== "production_prods" || log.action !== "update") return false;
  if (!log.before_data || !log.after_data) return false;

  const technicalFields = new Set([
    "pieces_count",
    "pieces_area_m2",
    "pieces_weight_kg",
    "updated_at",
  ]);
  const keys = Array.from(
    new Set([...Object.keys(log.before_data), ...Object.keys(log.after_data)]),
  );
  const changedKeys = keys.filter(
    (key) => JSON.stringify(log.before_data?.[key]) !== JSON.stringify(log.after_data?.[key]),
  );

  return (
    changedKeys.length > 0 &&
    changedKeys.every((key) => technicalFields.has(key)) &&
    changedKeys.some((key) => key.startsWith("pieces_"))
  );
}
