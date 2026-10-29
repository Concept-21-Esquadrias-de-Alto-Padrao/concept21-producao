import { LifecycleTabs } from "@/components/lifecycle-tabs";
import { lifecycleView, parseLifecycleView, completionInPeriod, lifecycleRecordedAt } from "@/lib/lifecycle";
import { MANUAL_PROD_STATUSES } from "@/lib/prod-progress";
import { AlertTriangle, CalendarClock, CalendarDays, Factory, Plus } from "lucide-react";
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
import { compareOpenProdPlans, getOpenProdPlans, type PlanningWindow } from "@/lib/open-prod-planning";
import { StatCard } from "@/components/stat-card";
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
    view?: string;
    from?: string;
    to?: string;
    stage?: string;
    status?: string;
    search?: string;
    contract?: string;
    prod?: string;
    planning?: string;
    materials?: string;
    documents?: string;
  }>;
}) {
  const params = await searchParams;
  const access = await getCurrentPermissionFlags([
    ...appNavigationPermissionKeys,
    "production.prods.create",
    "production.prods.edit",
    "production.materials.view",
    "production.documents.manage",
  ]);

  if (!canAccessModule(access, MODULE_ACCESS.prods)) {
    redirect(firstAllowedAppRoute(access) ?? "/login");
  }

  const canSeeMaterials = access.isMaster || access.permissions["production.materials.view"];
  const canSeeDocuments = access.isMaster || access.permissions["production.documents.manage"];
  const snapshot = await getProdsPageData(canSeeMaterials, canSeeDocuments);
  const plans = getOpenProdPlans(snapshot, new Date());
  const view = parseLifecycleView(params.view);
  if (view === "arquivados") redirect("/archives");
  const canCreateProds = access.isMaster || access.permissions["production.prods.create"];
  const searchFilter = (params.search ?? "").trim().toLocaleLowerCase("pt-BR");
  const contractFilter = (params.contract ?? "").trim().toLocaleLowerCase("pt-BR");
  const prodFilter = (params.prod ?? "").trim();
  const listQuery = new URLSearchParams({view});
  if (params.from) listQuery.set("from", params.from);
  if (params.to) listQuery.set("to", params.to);

  if (params.search) listQuery.set("search", params.search);
  if (params.contract) listQuery.set("contract", params.contract);
  if (params.prod) listQuery.set("prod", params.prod);
  if (params.stage) listQuery.set("stage", params.stage);
  if (params.status) listQuery.set("status", params.status);
  if (params.planning) listQuery.set("planning", params.planning);
  if (params.materials) listQuery.set("materials", params.materials);
  if (params.documents) listQuery.set("documents", params.documents);

  const currentListHref = listQuery.toString() ? `/prods?${listQuery.toString()}` : "/prods";
  const hasAppliedListFilter = Boolean(
    searchFilter ||
      contractFilter ||
      prodFilter ||
      params.stage ||
      params.status ||
      params.planning ||
      params.materials ||
      params.documents,
  );
  const contexts = snapshot.prods
    .map((prod) => buildProdContext(snapshot, prod))
    .filter((context): context is NonNullable<typeof context> => Boolean(context));
  const filteredContexts = contexts
    .filter(context => lifecycleView(context.prod) === view)
    .filter(context => view !== "em_andamento" || Boolean(plans[context.prod.id]))
    .filter(context => completionInPeriod(lifecycleRecordedAt(context.prod), params.from, params.to))
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
    )
    .filter(context => view !== "em_andamento" || (
      (!params.planning || plans[context.prod.id]?.window === params.planning) &&
      (!canSeeMaterials || !params.materials || plans[context.prod.id]?.materials === params.materials) &&
      (!canSeeDocuments || !params.documents || plans[context.prod.id]?.documents === params.documents)
    ))
    .sort((a, b) => view === "em_andamento" && plans[a.prod.id] && plans[b.prod.id]
      ? compareOpenProdPlans(plans[a.prod.id], plans[b.prod.id]) : 0);

  const openPlans = Object.values(plans);
  const planningCounts = (window: PlanningWindow) =>
    openPlans.filter(plan => plan.window === window).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="PRODs"
        description="Acompanhe fabricação, saída física e conclusão por lote e consulte o histórico oficial."
        actions={
          canCreateProds && view === "em_andamento" ? (
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

      <LifecycleTabs path="/prods" view={view} showArchives={access.isMaster} />
      {view === "em_andamento" && (
        <Panel>
          <PanelHeader title="Planejamento das PRODs abertas" description="Prazo de conclusão planejado pela Produção. As datas não representam compromisso informado pelo cliente." />
          <PanelBody>
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <Link href="/prods?view=em_andamento&planning=atrasada" aria-label="Ver PRODs com planejamento atrasado">
                <StatCard label="Atrasadas" value={planningCounts("atrasada")} icon={AlertTriangle} tone="danger" />
              </Link>
              <Link href="/prods?view=em_andamento&planning=hoje" aria-label="Ver PRODs planejadas para hoje">
                <StatCard label="Para hoje" value={planningCounts("hoje")} icon={CalendarDays} tone="accent" />
              </Link>
              <Link href="/prods?view=em_andamento&planning=proximos_7_dias" aria-label="Ver PRODs planejadas para os próximos sete dias">
                <StatCard label="Próximos 7 dias" value={planningCounts("proximos_7_dias")} icon={CalendarClock} />
              </Link>
              <Link href="/prods?view=em_andamento&planning=sem_data" aria-label="Ver PRODs sem data planejada">
                <StatCard label="Sem data planejada" value={planningCounts("sem_data")} icon={Factory} />
              </Link>
              <Link href="/prods?view=em_andamento&planning=producao_concluida" aria-label="Ver PRODs abertas com fabricação concluída">
                <StatCard label="Produção concluída" value={planningCounts("producao_concluida")} icon={Factory} tone="success" />
              </Link>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">A ausência de registros de materiais ou conferências é indicada separadamente. Este painel não altera o andamento das PRODs.</p>
          </PanelBody>
        </Panel>
      )}
      <div className={canCreateProds && view === "em_andamento" ? "grid gap-4 xl:grid-cols-[0.85fr_1.15fr]" : "space-y-4"}>
        {canCreateProds && view === "em_andamento" ? (
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
                    <input name="prod_number" type="text" maxLength={50} placeholder="Ex.: 1 ou 1-MAX" className={inputClass} required />
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
                      {MANUAL_PROD_STATUSES.map((status) => (
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
                  <Field label="Observações (motivo obrigatório ao pausar a PROD)">
                  <textarea name="notes" className={textareaClass} />
                </Field>
              </ActionForm>
            </PanelBody>
          </Panel>
        ) : null}

        <Panel>
          <PanelHeader
            title="Lista de PRODs"
            description="Filtre por cliente, contrato, PROD, etapa, status e pendências do planejamento."
          />
          <PanelBody>
            <div className="mb-4 grid gap-3">
              <form className="contents">
                <input type="hidden" name="view" value={view} />
                {view === "concluidos" && <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Registro da conclusão a partir de"><input className={inputClass} type="date" name="from" defaultValue={params.from} /></Field>
                  <Field label="Registro da conclusão até"><input className={inputClass} type="date" name="to" defaultValue={params.to} /></Field>
                </div>}
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
                    href={`/prods?view=${view}`}
                    className="inline-flex min-h-11 items-center justify-center self-end rounded-md border border-border bg-white px-4 text-sm font-semibold text-charcoal hover:bg-muted"
                  >
                    Limpar
                  </Link>
                </div>
                {view === "em_andamento" && <div className="grid gap-3 sm:grid-cols-3">
                  <Field label="Data de conclusão planejada">
                    <select name="planning" className={inputClass} defaultValue={params.planning ?? ""}>
                      <option value="">Todos os prazos</option>
                      <option value="atrasada">Atrasadas</option>
                      <option value="hoje">Hoje</option>
                      <option value="proximos_7_dias">Próximos 7 dias</option>
                      <option value="sem_data">Sem data</option>
                      <option value="futura">Mais de 7 dias</option>
                      <option value="producao_concluida">Produção concluída, PROD aberta</option>
                    </select>
                  </Field>
                  {canSeeMaterials && <Field label="Materiais">
                    <select name="materials" className={inputClass} defaultValue={params.materials ?? ""}>
                      <option value="">Todos</option>
                      <option value="pendente">Com confirmação pendente</option>
                      <option value="sem_registro">Sem registro</option>
                      <option value="confirmado">Grupos registrados confirmados</option>
                    </select>
                  </Field>}
                  {canSeeDocuments && <Field label="Listas e documentos">
                    <select name="documents" className={inputClass} defaultValue={params.documents ?? ""}>
                      <option value="">Todos</option>
                      <option value="pendente">Com itens pendentes</option>
                      <option value="sem_registro">Sem conferência registrada</option>
                      <option value="conferidos">Itens registrados conferidos</option>
                    </select>
                  </Field>}
                </div>}
                {hasAppliedListFilter ? (
                  <p className="text-xs text-muted-foreground">
                    {filteredContexts.length} PROD(s) encontrada(s).
                  </p>
                ) : null}
              </form>
            </div>

            {filteredContexts.length === 0 ? (
              <EmptyState
                icon={Factory}
                title="Nenhuma PROD encontrada"
                description="Crie uma PROD ou ajuste os filtros atuais."
              />
            ) : (
              <ProdsList
                contexts={filteredContexts}
                plans={plans}
                canSeeMaterials={canSeeMaterials}
                canSeeDocuments={canSeeDocuments}
                materials={snapshot.prodMaterials}
                contracts={snapshot.contracts}
                profiles={snapshot.profiles}
                stages={snapshot.stages}
                returnHref={currentListHref}
                canEdit={view === "em_andamento" && (access.isMaster || access.permissions["production.prods.edit"])}
                canDelete={false}
              />
            )}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
