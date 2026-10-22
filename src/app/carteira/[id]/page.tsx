import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { LifecycleHistory } from "@/components/lifecycle-panel";
import { PageHeader } from "@/components/page-header";
import { getWorkPortfolioPageData } from "@/lib/data";
import { getLifecycleHistory } from "@/lib/lifecycle-data";
import { lifecycleView, lifecycleViewLabels } from "@/lib/lifecycle";
import { materialConfirmationLabels, prodStatusLabels } from "@/lib/labels";
import { appNavigationPermissionKeys, firstAllowedAppRoute } from "@/lib/module-access";
import { getCurrentPermissionFlags } from "@/lib/server-access";
import { formatDate, formatDateTime } from "@/lib/utils";
import { buildWorkPortfolio, materialStateLabels, workProgressLabels } from "@/lib/work-portfolio";

export default async function WorkDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getCurrentPermissionFlags([...appNavigationPermissionKeys, "production.materials.view"]);
  if (!access.isMaster && !(access.permissions["production.contracts.view"] && access.permissions["production.prods.view"])) {
    redirect(firstAllowedAppRoute(access) ?? "/login");
  }
  const canSeeMaterials = access.isMaster || Boolean(access.permissions["production.materials.view"]);
  const snapshot = await getWorkPortfolioPageData(canSeeMaterials);
  const row = buildWorkPortfolio(snapshot, canSeeMaterials).find(item => item.contract.id === id);
  if (!row || row.contract.lifecycle?.archived_at) notFound();
  const { contract, prods } = row;
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
        <div><dt className="text-muted-foreground">Liberação técnica integral</dt><dd>{contract.lifecycle?.scope_confirmed_at ? `Confirmação registrada em ${formatDateTime(contract.lifecycle.scope_confirmed_at)}; conciliação de itens ainda não disponível` : "Conciliação de itens pendente"}</dd></div>
      </dl>
      <Link href={`/contracts/${id}`} className="mt-4 inline-block text-sm font-semibold text-accent underline">Abrir cadastro e histórico do contrato</Link>
    </section>
    <section className="rounded-md border border-border bg-white p-4">
      <h2 className="font-semibold">Itens do contrato e desenhos</h2>
      <p className="mt-2 text-sm">A lista integral dos itens do contrato e a referência à revisão dos desenhos ainda não estão registradas nesta carteira.</p>
      <p className="mt-1 text-sm text-muted-foreground">Os desenhos permanecem na pasta do cliente no servidor. Os PDFs de itens importados em cada PROD contêm somente os itens daquela PROD e não comprovam, isoladamente, o fim das liberações do contrato.</p>
    </section>
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
