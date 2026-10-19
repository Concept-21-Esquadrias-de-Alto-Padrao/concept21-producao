import { ClipboardList } from "lucide-react";
import { redirect } from "next/navigation";
import { ActionForm, Field, inputClass, textareaClass } from "@/components/action-form";
import { ContractAddressFields } from "@/components/contract-address-fields";
import { ContractsList } from "@/components/contracts-list";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { createContractAction } from "@/app/actions";
import { getContractsPageData } from "@/lib/data";
import {
  appNavigationPermissionKeys,
  canAccessModule,
  firstAllowedAppRoute,
  MODULE_ACCESS,
} from "@/lib/module-access";
import { getCurrentPermissionFlags } from "@/lib/server-access";

export default async function ContractsPage() {
  const access = await getCurrentPermissionFlags([
    ...appNavigationPermissionKeys,
    "production.contracts.create",
    "production.contracts.edit",
  ]);

  if (!canAccessModule(access, MODULE_ACCESS.contracts)) {
    redirect(firstAllowedAppRoute(access) ?? "/login");
  }

  const snapshot = await getContractsPageData();
  const canCreateContracts =
    access.isMaster || access.permissions["production.contracts.create"];
  const canEditContracts = access.isMaster || access.permissions["production.contracts.edit"];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Contratos e obras"
        description="Nesta versão, contrato e obra são uma entidade única dentro de Produção."
      />

      <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
        {canCreateContracts ? (
          <Panel>
            <PanelHeader title="Novo contrato" />
            <PanelBody>
              <ActionForm action={createContractAction} submitLabel="Salvar contrato">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Número do contrato">
                    <input name="contract_number" className={inputClass} required />
                  </Field>
                  <Field label="Cliente">
                    <select name="client_id" className={inputClass} required>
                      <option value="">Selecione</option>
                      {snapshot.clients.map((client) => (
                        <option key={client.id} value={client.id}>
                          {client.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Obra">
                  <input name="work_name" className={inputClass} required />
                </Field>
                <ContractAddressFields />
                <Field label="Previsão geral de entrega">
                  <input name="general_delivery_forecast" type="date" className={inputClass} />
                </Field>
                <Field label="Observações">
                  <textarea name="notes" className={textareaClass} />
                </Field>
                <input type="hidden" name="status" value="ativo" />
                <input type="hidden" name="active" value="true" />
              </ActionForm>
            </PanelBody>
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader title="Contratos cadastrados" />
          <PanelBody className="space-y-3">
            {snapshot.contracts.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title="Nenhum contrato cadastrado"
                description="Crie um contrato para permitir múltiplas PRODs no mesmo lote de obra."
              />
            ) : (
              <ContractsList
                contracts={snapshot.contracts}
                clients={snapshot.clients}
                prods={snapshot.prods}
                canEdit={canEditContracts}
              />
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
