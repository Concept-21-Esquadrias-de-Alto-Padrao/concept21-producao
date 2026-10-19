import { UserRound } from "lucide-react";
import { redirect } from "next/navigation";
import { ActionForm, Field, inputClass, textareaClass } from "@/components/action-form";
import { ClientsList } from "@/components/clients-list";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { createClientAction } from "@/app/actions";
import { getClientsPageData } from "@/lib/data";
import {
  appNavigationPermissionKeys,
  canAccessModule,
  firstAllowedAppRoute,
  MODULE_ACCESS,
} from "@/lib/module-access";
import { getCurrentPermissionFlags } from "@/lib/server-access";

export default async function ClientsPage() {
  const access = await getCurrentPermissionFlags([
    ...appNavigationPermissionKeys,
    "production.clients.create",
    "production.clients.edit",
  ]);

  if (!canAccessModule(access, MODULE_ACCESS.clients)) {
    redirect(firstAllowedAppRoute(access) ?? "/login");
  }

  const snapshot = await getClientsPageData();
  const canCreateClients = access.isMaster || access.permissions["production.clients.create"];
  const canEditClients = access.permissions["production.clients.edit"] ?? false;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clientes"
        description="Cadastro próprio do módulo de Produção, independente de Comercial."
      />

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        {canCreateClients ? (
          <Panel>
            <PanelHeader title="Novo cliente" />
            <PanelBody>
              <ActionForm action={createClientAction} submitLabel="Salvar cliente">
                <Field label="Nome completo">
                  <input name="name" className={inputClass} required />
                </Field>
                <Field label="Observações">
                  <textarea name="notes" className={textareaClass} />
                </Field>
                <input type="hidden" name="active" value="true" />
              </ActionForm>
            </PanelBody>
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader title="Clientes cadastrados" />
          <PanelBody className="space-y-3">
            {snapshot.clients.length === 0 ? (
              <EmptyState
                icon={UserRound}
                title="Nenhum cliente cadastrado"
                description="Cadastre o primeiro cliente para iniciar contratos e PRODs."
              />
            ) : (
              <ClientsList
                clients={snapshot.clients}
                canEdit={canEditClients}
                canDelete={access.isMaster}
              />
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
