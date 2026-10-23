import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ContractScopePdfForm } from "@/components/contract-scope-pdf-form";
import { ContractScopeConfirmation } from "@/components/contract-scope-confirmation";
import { LifecycleHistory } from "@/components/lifecycle-panel";
import { PageHeader } from "@/components/page-header";
import { getWorkPortfolioPageData } from "@/lib/data";
import { reconcileContractScope } from "@/lib/contract-scope";
import { getLifecycleHistory } from "@/lib/lifecycle-data";
import { lifecycleView, lifecycleViewLabels } from "@/lib/lifecycle";
import { materialConfirmationLabels, prodStatusLabels } from "@/lib/labels";
import { appNavigationPermissionKeys, firstAllowedAppRoute } from "@/lib/module-access";
import { getCurrentPermissionFlags } from "@/lib/server-access";
import { formatDate, formatDateTime } from "@/lib/utils";
import { buildWorkPortfolio, materialStateLabels, workProgressLabels } from "@/lib/work-portfolio";

export default async function WorkDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getCurrentPermissionFlags([...appNavigationPermissionKeys, "production.materials.view", "production.contracts.edit"]);
  if (!access.isMaster && !(access.permissions["production.contracts.view"] && access.permissions["production.prods.view"])) {
    redirect(firstAllowedAppRoute(access) ?? "/login");
  }
  const canSeeMaterials = access.isMaster || Boolean(access.permissions["production.materials.view"]);
  const snapshot = await getWorkPortfolioPageData(canSeeMaterials);
  const row = buildWorkPortfolio(snapshot, canSeeMaterials).find(item => item.contract.id === id);
  if (!row || row.contract.lifecycle?.archived_at) notFound();
  const { contract, prods } = row;
  const revisions = snapshot.contractScopeRevisions.filter(item => item.contract_id === id)
    .sort((a, b) => b.revision_number - a.revision_number);
  const revision = revisions[0] ?? null;
  const scope = reconcileContractScope(revision, prods, snapshot.prodPieces);
  const history = await getLifecycleHistory(id, "contract");

  return <div className="space-y-6">
    <PageHeader title={contract.work_name} description={`${row.clientName} · Contrato ${contract.contract_number}`} actions={<Link href="/carteira" className="text-sm font-semibold text-accent underline">Voltar à carteira</Link>} />
    <section className="rounded-md border border-border bg-white p-4">
      <h2 className="font-semibold">Planejamento da obra</h2>
      <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-muted-foreground">Data do planejamento da Produção</dt><dd>{formatDate(contract.general_delivery_forecast)}</dd></div>
        <div><dt className="text-muted-foreground">Endereço</dt><dd>{contract.full_address || "Não informado"}</dd></div>
        <div><dt className="text-muted-foreground">Contato da obra</dt><dd>{[contract.site_contact, contract.site_contact_phone].filter(Boolean).join(" · ") || "Não informado"}</dd></div>
        <div><dt className="text-muted-foreground">Andamento</dt><dd>{workProgressLabels[row.progress]}</dd></div>
        <div><dt className="text-muted-foreground">Materiais das PRODs</dt><dd>{materialStateLabels[row.materialState]}</dd></div>
        <div><dt className="text-muted-foreground">Liberação técnica integral</dt><dd>{scope.status === "completo" ? "Lista integral conciliada com todas as PRODs" : revision?.source_kind === "proposta" && scope.match ? "Peças coincidem; confirmar lista vigente do Técnico" : scope.status === "sem_base" ? "Falta lista integral vigente do contrato" : "Conciliação pendente"}</dd></div>
      </dl>
      <Link href={`/contracts/${id}`} className="mt-4 inline-block text-sm font-semibold text-accent underline">Abrir cadastro e histórico do contrato</Link>
    </section>
    <section id="escopo" className="rounded-md border border-border bg-white p-4">
      <h2 className="font-semibold">Itens do contrato e desenhos</h2>
      {revision ? <>
        <p className="mt-2 text-sm">Revisão registrada {revision.revision_number} · {revision.source_kind === "tecnico_integral" ? "Lista integral vigente do Técnico" : "Proposta para referência"} · {formatDateTime(revision.created_at)}</p>
        <p className="mt-1 break-all text-sm">Referência no servidor: {revision.source_reference}{revision.source_revision ? ` · revisão do documento ${revision.source_revision}` : ""}</p>
        <p className="mt-2 text-sm font-semibold">{scope.totalFound} de {scope.totalExpected} unidades nas PRODs · {scope.status === "completo" ? "escopo integral conciliado" : scope.match ? "peças coincidem; falta confirmar a origem vigente" : "peças ainda não conciliadas"}</p>
        <div className="mt-3 overflow-x-auto"><table className="w-full min-w-[400px] text-left text-sm"><thead><tr className="border-b"><th className="p-2">Item do contrato</th><th className="p-2">Código na PROD</th><th className="p-2">Esperado</th><th className="p-2">Encontrado</th></tr></thead><tbody>
          {scope.lines.map(line => <tr key={line.code} className="border-b"><td className="p-2">{line.code}</td><td className="p-2">{line.prodCode}</td><td className="p-2">{line.expected}</td><td className="p-2">{line.found}</td></tr>)}
        </tbody></table></div>
        {!!scope.extras.length && <p className="mt-2 text-sm text-amber-900">Itens nas PRODs fora da lista vigente: {scope.extras.map(item => `${item.code} (${item.quantity})`).join(", ")}.</p>}
        {revision.source_kind === "proposta" && scope.match && (access.isMaster || access.permissions["production.contracts.edit"]) &&
          <ContractScopeConfirmation contractId={id} revisionId={revision.id} sourceReference={revision.source_reference}
            sourceRevision={revision.source_revision} count={scope.totalExpected} />}
        {revision.source_kind === "proposta" && !scope.match && <p className="mt-3 rounded bg-amber-50 p-3 text-sm text-amber-900">Confira códigos, quantidades, peças importadas e liberação de cada PROD. Quando coincidirem, a confirmação do escopo vigente aparecerá aqui.</p>}
        {revisions.length > 1 && <p className="mt-2 text-xs text-muted-foreground">{revisions.length - 1} revisão(ões) anterior(es) preservada(s) no histórico.</p>}
      </> : <p className="mt-2 text-sm">Registre a lista integral vigente do contrato para comparar as peças de todas as PRODs. Até lá, a liberação permanece pendente.</p>}
      <p className="mt-2 text-sm text-muted-foreground">Os desenhos permanecem na pasta do cliente no servidor. Uma proposta pode ser registrada como referência, mas não confirma o escopo integral vigente. Cada PDF de itens contém somente a respectiva PROD.</p>
    </section>
    {(access.isMaster || access.permissions["production.contracts.edit"]) && <section className="rounded-md border border-border bg-white p-4">
      <h2 className="font-semibold">Ler revisão do desenho em PDF</h2>
      <p className="mt-1 text-sm text-muted-foreground">O sistema extrai os códigos e quantidades e mostra a prévia antes de registrar. A proposta sozinha fica provisória; para declarar o escopo integral, confira a lista vigente no Técnico, incluindo revisões e desdobros.</p>
      <ContractScopePdfForm contractId={id} />
    </section>}
    <section className="space-y-3">
      <h2 className="font-semibold">Liberações recebidas · {prods.length} PROD(s)</h2>
      {!prods.length && <p className="rounded-md border border-border bg-white p-4 text-sm">Sem PROD cadastrada. A obra permanece visível para o planejamento.</p>}
      {prods.map(prod => {
        const pieces = snapshot.prodPieces.filter(piece => piece.prod_id === prod.id && !piece.disposition?.cancelled_at);
        const imports = snapshot.prodPieceImports.filter(batch => batch.prod_id === prod.id);
        const stage = snapshot.stages.find(item => item.id === prod.current_stage_id);
        const materials = canSeeMaterials ? snapshot.prodMaterials.filter(item => item.prod_id === prod.id) : [];
        return <article key={prod.id} className="rounded-md border border-border bg-white p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <Link href={`/prods/${prod.id}`} className="font-semibold text-charcoal underline">PROD {prod.prod_number}{prod.description ? ` · ${prod.description}` : ""}</Link>
            <span className="text-xs font-semibold text-muted-foreground">{lifecycleViewLabels[lifecycleView(prod)]}</span>
          </div>
          <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="text-muted-foreground">Data planejada da PROD</dt><dd>{formatDate(prod.planned_end_date ?? prod.delivery_forecast)}</dd></div>
            <div><dt className="text-muted-foreground">Estado / etapa</dt><dd>{prodStatusLabels[prod.status]} · {stage?.name ?? "Sem etapa"}</dd></div>
            <div><dt className="text-muted-foreground">Itens desta PROD</dt><dd>{pieces.length} linhas · {pieces.reduce((sum, piece) => sum + Number(piece.quantity || 0), 0)} unidades</dd></div>
            <div><dt className="text-muted-foreground">Liberados para a Produção</dt><dd>{pieces.filter(piece => piece.released_to_production).length} linhas</dd></div>
          </dl>
          <p className="mt-3 text-sm">Materiais: {canSeeMaterials ? !materials.length ? "Não verificado" : materials.map(material => `${(material as typeof material & { material_group?: string }).material_group ?? material.group}: ${materialConfirmationLabels[material.confirmation_status]}`).join(" · ") : "Sem acesso à conferência de materiais"}</p>
          <p className="mt-1 text-xs text-muted-foreground">{imports.length ? `Última leitura de itens: ${imports[0].file_name}, em ${formatDateTime(imports[0].created_at)}.` : "Sem leitura de itens registrada nesta PROD."} {pieces.length ? "" : "Nenhum item cadastrado."}</p>
        </article>;
      })}
    </section>
    <LifecycleHistory events={history.events} profiles={snapshot.profiles.map(profile => ({ id: profile.id, name: profile.name }))} />
  </div>;
}
