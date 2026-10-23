import { ClipboardCheck, LockKeyhole } from "lucide-react";
import { redirect } from "next/navigation";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { ProductionPointingBoard } from "@/components/production-pointing-board";
import { getPointingPageData } from "@/lib/data";
import {
  appNavigationPermissionKeys,
  canAccessModule,
  firstAllowedAppRoute,
  MODULE_ACCESS,
} from "@/lib/module-access";
import { getCurrentPermissionFlags } from "@/lib/server-access";

export default async function PointingPage() {
  const access = await getCurrentPermissionFlags([
    ...appNavigationPermissionKeys,
    "production.pointing.perform",
    "production.pointing.rollback",
    "production.pointing.adjust_time",
    "production.prods.release_to_production",
  ]);

  const canView = canAccessModule(access, MODULE_ACCESS.pointing);
  if (!canView) {
    redirect(firstAllowedAppRoute(access) ?? "/login");
  }

  const canPerform = access.isMaster || access.permissions["production.pointing.perform"];
  const canRollback = access.isMaster || access.permissions["production.pointing.rollback"];
  const canAdjustTime = access.isMaster || access.permissions["production.pointing.adjust_time"];
  const canReleaseProduction =
    access.isMaster || access.permissions["production.prods.release_to_production"];
  const serverNowIso = new Date().toISOString();
  const snapshot = await getPointingPageData();

  return (
    <div className="space-y-6">
      <PageHeader
        title="Apontamentos de produção"
        description="Aponte peças da produção do Corte à Expedição e confirme cada ação com matrícula e senha do operador."
      />

      {!canView ? (
        <Panel>
          <PanelBody>
            <EmptyState
              icon={LockKeyhole}
              title="Acesso restrito"
              description="Seu perfil não possui permissão para visualizar apontamentos de produção."
            />
          </PanelBody>
        </Panel>
      ) : (
        <Panel>
          <PanelHeader
            title="Fila de apontamento"
            description="As ações abaixo atualizam a peça, a etapa e a visão de gestão da PROD."
          />
          <PanelBody>
            {snapshot.prodPieces.length === 0 ? (
              <EmptyState
                icon={ClipboardCheck}
                title="Nenhuma peça cadastrada"
                description="Importe ou cadastre peças na PROD antes de iniciar os apontamentos."
              />
            ) : (
              <ProductionPointingBoard
                clients={snapshot.clients}
                contracts={snapshot.contracts}
                prods={snapshot.prods}
                stages={snapshot.stages}
                pieces={snapshot.prodPieces}
                pieceStages={snapshot.prodPieceStages}
                operators={snapshot.productionOperators}
                pointingReasons={snapshot.pointingReasons}
                pointingSettings={snapshot.pointingSettings}
                indirectActivityReasons={snapshot.indirectActivityReasons}
                indirectActivitySessions={snapshot.indirectActivitySessions}
                timeEntries={snapshot.stageTimeEntries}
                canPerform={canPerform}
                canViewProds={canAccessModule(access, MODULE_ACCESS.prods)}
                canArchiveExpedition={access.isMaster}
                canRollback={canRollback}
                canAdjustTime={canAdjustTime}
                canReleaseProduction={canReleaseProduction}
                serverNowIso={serverNowIso}
              />
            )}
          </PanelBody>
        </Panel>
      )}
    </div>
  );
}
