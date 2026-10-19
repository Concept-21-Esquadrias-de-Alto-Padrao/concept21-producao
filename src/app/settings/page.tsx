import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody } from "@/components/panel";
import { ProductionSettingsTabs } from "@/components/production-settings-tabs";
import {
  appNavigationPermissionKeys,
  canAccessModule,
  firstAllowedAppRoute,
  getAllowedSettingsTabIds,
  MODULE_ACCESS,
} from "@/lib/module-access";
import { getCurrentPermissionFlags } from "@/lib/server-access";

export default async function SettingsPage() {
  const access = await getCurrentPermissionFlags(appNavigationPermissionKeys);
  if (!canAccessModule(access, MODULE_ACCESS.settings)) {
    redirect(firstAllowedAppRoute(access) ?? "/login");
  }

  const allowedTabIds = getAllowedSettingsTabIds(access);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Configurações"
        description="Cadastros operacionais, usuários, perfis de acesso, matriz de permissões e manutenção do módulo de Produção."
      />

      <Suspense
        fallback={
          <Panel>
            <PanelBody className="text-sm text-muted-foreground">
              Carregando configurações...
            </PanelBody>
          </Panel>
        }
      >
        <ProductionSettingsTabs allowedTabIds={allowedTabIds} />
      </Suspense>
    </div>
  );
}
