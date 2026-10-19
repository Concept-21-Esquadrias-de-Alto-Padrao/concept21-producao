"use client";

import { useSearchParams } from "next/navigation";
import type { ReactNode } from "react";
import { LogisticsSettingsManager } from "@/components/logistics-settings-manager";
import { OperationalSettingsManager } from "@/components/operational-settings-manager";
import { PointingSettingsManager } from "@/components/pointing-settings-manager";
import { SecuritySettings } from "@/components/security-settings";
import { SystemMaintenanceSettings } from "@/components/system-maintenance-settings";
import { Tabs } from "@/components/tabs";
import type { SettingsTabId } from "@/lib/module-access";

function SettingsArea({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <details className="group rounded-md border border-border bg-card shadow-sm">
      <summary className="flex cursor-pointer list-none items-start justify-between gap-4 px-4 py-4">
        <span>
          <span className="block text-base font-semibold text-charcoal">{title}</span>
          <span className="mt-1 block text-sm text-muted-foreground">{description}</span>
        </span>
        <span className="rounded-md border border-border px-2 py-1 text-xs font-semibold text-muted-foreground transition group-open:bg-charcoal group-open:text-white">
          Abrir
        </span>
      </summary>
      <div className="border-t border-border p-4">{children}</div>
    </details>
  );
}

const settingsTabs = [
  {
    id: "registries",
    label: "Cadastros",
    content: (
      <SettingsArea
        title="Cadastros operacionais"
        description="Departamentos, localizações e cadastros de apoio usados na Produção."
      >
        <OperationalSettingsManager section="registries" />
      </SettingsArea>
    ),
  },
  {
    id: "logistics",
    label: "Logística",
    content: (
      <SettingsArea
        title="Logística"
        description="Destinatários, serviços, motoristas, veículos e custos globais."
      >
        <LogisticsSettingsManager />
      </SettingsArea>
    ),
  },
  {
    id: "stages",
    label: "Etapas do PROD",
    content: (
      <SettingsArea
        title="Etapas do PROD"
        description="Fluxo macro, permissões exigidas e ordem das etapas."
      >
        <OperationalSettingsManager section="stages" />
      </SettingsArea>
    ),
  },
  {
    id: "pointing",
    label: "Apontamentos",
    content: (
      <SettingsArea
        title="Apontamentos"
        description="Operadores, motivos de pausa, pendências e retrabalho."
      >
        <PointingSettingsManager />
      </SettingsArea>
    ),
  },
  {
    id: "security",
    label: "Segurança e acessos",
    content: (
      <SettingsArea
        title="Segurança e acessos"
        description="Usuários, perfis de acesso e matriz de permissões."
      >
        <SecuritySettings />
      </SettingsArea>
    ),
  },
  {
    id: "system",
    label: "Sistema",
    content: (
      <SettingsArea
        title="Sistema"
        description="Controle profissional de manutenção da plataforma."
      >
        <SystemMaintenanceSettings />
      </SettingsArea>
    ),
  },
] satisfies Array<{
  id: SettingsTabId;
  label: string;
  content: ReactNode;
}>;

export function ProductionSettingsTabs({
  allowedTabIds,
}: {
  allowedTabIds: SettingsTabId[];
}) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") ?? "";
  const allowedTabs = new Set(allowedTabIds);
  const visibleTabs = settingsTabs.filter((tab) => allowedTabs.has(tab.id));
  const defaultTab = allowedTabs.has(tabParam as SettingsTabId)
    ? tabParam
    : visibleTabs[0]?.id;

  if (!visibleTabs.length) return null;

  return (
    <Tabs
      key={defaultTab}
      defaultTab={defaultTab}
      tabs={visibleTabs}
    />
  );
}
