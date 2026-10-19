import { Factory, Plus } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ActionForm, Field, inputClass, textareaClass } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { ProdDateFields } from "@/components/prod-date-fields";
import { ProdsList } from "@/components/prods-list";
import { createProdAction } from "@/app/actions";
import { getProdsPageData } from "@/lib/data";
import { buildProdContext } from "@/lib/production";
import { priorityLabels, prodStatusLabels } from "@/lib/labels";
import {
  appNavigationPermissionKeys,
  canAccessModule,
  firstAllowedAppRoute,
  MODULE_ACCESS,
} from "@/lib/module-access";
import { getCurrentPermissionFlags } from "@/lib/server-access";
import { PROD_STATUSES, PRIORITIES } from "@/lib/types";

export default async function ProdsPage({
  searchParams,
}: {
  searchParams: Promise<{
    stage?: string;
    status?: string;
    search?: string;
    contract?: string;
    prod?: string;
  }>;
}) {
  const params = await searchParams;
  const access = await getCurrentPermissionFlags([
    ...appNavigationPermissionKeys,
    "production.prods.create",
    "production.prods.edit",
  ]);

  if (!canAccessModule(access, MODULE_ACCESS.prods)) {
    redirect(firstAllowedAppRoute(access) ?? "/login");
  }

  const snapshot = await getProdsPageData();
  const canCreateProds = access.isMaster || access.permissions["production.prods.create"];
  const searchFilter = (params.search ?? "").trim().toLocaleLowerCase("pt-BR");
  const contractFilter = (params.contract ?? "").trim().toLocaleLowerCase("pt-BR");
  const prodFilter = (params.prod ?? "").trim();
  const listQuery = new URLSearchParams();

  if (params.search) listQuery.set("search", params.search);
  if (params.contract) listQuery.set("contract", params.contract);
  if (params.prod) listQuery.set("prod", params.prod);
  if (params.stage) listQuery.set("stage", params.stage);
  if (params.status) listQuery.set("status", params.status);

  const currentListHref = listQuery.toString() ? `/prods?${listQuery.toString()}` : "/prods";
  const hasAppliedListFilter = Boolean(
    searchFilter ||
      contractFilter ||
      prodFilter ||
      params.stage ||
      params.status,
  );
  const contexts = snapshot.prods
    .map((prod) => buildProdContext(snapshot, prod))
    .filter((context): context is NonNullable<typeof context> => Boolean(context));
  const filteredContexts = contexts
    .filter((context) => !params.stage || context.prod.current_stage_id === params.stage)
    .filter((context) => !params.status || context.prod.status === params.status)
    .filter((context) => {
      if (!searchFilter) return true;
      return [
        context.client.name,
        context.contract.work_name,
        context.contract.full_address,
        context.prod.description ?? "",
      ]
        .join(" ")
        .toLocaleLowerCase("pt-BR")
        .includes(searchFilter);
    })
    .filter(
      (context) =>
        !contractFilter ||
        context.contract.contract_number.toLocaleLowerCase("pt-BR").includes(contractFilter),
    )
    .filter(
      (context) =>
        !prodFilter ||
        String(context.prod.prod_number).toLocaleLowerCase("pt-BR").includes(
          prodFilter.toLocaleLowerCase("pt-BR"),
        ),
    );

  return (
    <div className="space-y-6">
      <PageHeader
        title="PRODs"
        description="Controle centralizado por lote completo de produção, sem detalhamento unitário por esquadria."
        actions={
          canCreateProds ? (
            <Link
              href="#nova-prod"
              className="inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500"
            >
              <Plus className="size-4" />
              Nova PROD
            </Link>
          ) : null
        }
      />

      <div className="grid gap-4 xl:grid-cols-[0.85fr_1.15fr]">
        {canCreateProds ? (
          <Panel id="nova-prod">
            <PanelHeader title="Criar PROD" />
            <PanelBody>
              <ActionForm action={createProdAction} submitLabel="Salvar PROD">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Contrato">
                    <select name="contract_id" className={inputClass} required>
                      <option value="">Selecione</option>
                      {snapshot.contracts.map((contract) => {
                        const client = snapshot.clients.find(
                          (item) => item.id === contract.client_id,
                        );
                        return (
                          <option key={contract.id} value={contract.id}>
                            {client?.name} - {contract.contract_number}
                          </option>
                        );
                      })}
                    </select>
                  </Field>
                  <Field label="Número da PROD">
                    <input name="prod_number" type="number" min={1} className={inputClass} required />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Responsável">
                    <select name="owner_profile_id" className={inputClass}>
                      <option value="">Sem responsável</option>
                      {snapshot.profiles.map((profile) => (
                        <option key={profile.id} value={profile.id}>
                          {profile.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Prioridade">
                    <select name="priority" className={inputClass} defaultValue="normal">
                      {PRIORITIES.map((priority) => (
                        <option key={priority} value={priority}>
                          {priorityLabels[priority]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <ProdDateFields />
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Etapa atual">
                    <select name="current_stage_id" className={inputClass}>
                      <option value="">Sem etapa</option>
                      {snapshot.stages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Status geral">
                    <select name="status" className={inputClass} defaultValue="planejamento">
                      {PROD_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {prodStatusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Descrição">
                  <textarea name="description" className={textareaClass} />
                </Field>
                <Field label="Observações">
                  <textarea name="notes" className={textareaClass} />
                </Field>
              </ActionForm>
            </PanelBody>
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader
            title="Lista de PRODs"
            description="Filtre por cliente, contrato, PROD, etapa e status simultaneamente."
          />
          <PanelBody>
            <div className="mb-4 grid gap-3">
              <form className="contents">
                <div className="grid gap-3 md:grid-cols-3">
                  <Field label="Cliente ou obra">
                    <input
                      name="search"
                      list="prod-client-options"
                      className={inputClass}
                      defaultValue={params.search ?? ""}
                      placeholder="Nome, obra ou endereço"
                    />
                    <datalist id="prod-client-options">
                      {snapshot.clients.map((client) => (
                        <option key={client.id} value={client.name} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="Contrato">
                    <input
                      name="contract"
                      className={inputClass}
                      defaultValue={params.contract ?? ""}
                      placeholder="Ex.: 25-0123"
                    />
                  </Field>
                  <Field label="PROD">
                    <input
                      name="prod"
                      className={inputClass}
                      defaultValue={params.prod ?? ""}
                      placeholder="Número"
                    />
                  </Field>
                </div>
                <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto_auto]">
                  <Field label="Etapa">
                    <select name="stage" className={inputClass} defaultValue={params.stage ?? ""}>
                      <option value="">Todas as etapas</option>
                      {snapshot.stages.map((stage) => (
                        <option key={stage.id} value={stage.id}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select name="status" className={inputClass} defaultValue={params.status ?? ""}>
                      <option value="">Todos os status</option>
                      {PROD_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {prodStatusLabels[status]}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <button className="min-h-11 self-end rounded-md bg-charcoal px-4 text-sm font-semibold text-white">
                    Filtrar
                  </button>
                  <Link
                    href="/prods"
                    className="inline-flex min-h-11 items-center justify-center self-end rounded-md border border-border bg-white px-4 text-sm font-semibold text-charcoal hover:bg-muted"
                  >
                    Limpar
                  </Link>
                </div>
                {hasAppliedListFilter ? (
                  <p className="text-xs text-muted-foreground">
                    {filteredContexts.length} PROD(s) encontrada(s).
                  </p>
                ) : null}
              </form>
            </div>

            {!hasAppliedListFilter ? (
              <EmptyState
                icon={Factory}
                title="Localize uma PROD"
                description="Use um ou mais filtros para consultar as PRODs cadastradas."
              />
            ) : filteredContexts.length === 0 ? (
              <EmptyState
                icon={Factory}
                title="Nenhuma PROD encontrada"
                description="Crie uma PROD ou ajuste os filtros atuais."
              />
            ) : (
              <ProdsList
                contexts={filteredContexts}
                materials={snapshot.prodMaterials}
                contracts={snapshot.contracts}
                profiles={snapshot.profiles}
                stages={snapshot.stages}
                returnHref={currentListHref}
                canEdit={access.permissions["production.prods.edit"]}
                canDelete={access.isMaster}
              />
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
