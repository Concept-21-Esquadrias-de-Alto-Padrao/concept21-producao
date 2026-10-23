import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getContractsPageData } from "@/lib/data";
import { getLifecycleHistory } from "@/lib/lifecycle-data";
import { getCurrentPermissionFlags } from "@/lib/server-access";
import { appNavigationPermissionKeys, canAccessModule, MODULE_ACCESS } from "@/lib/module-access";
import { LifecycleBadge, LifecycleCommand, LifecycleHistory } from "@/components/lifecycle-panel";
import { PageHeader } from "@/components/page-header";
import { lifecycleView } from "@/lib/lifecycle";
import { formatDateTime } from "@/lib/utils";

export default async function ContractDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const access = await getCurrentPermissionFlags([...appNavigationPermissionKeys, "production.contracts.confirm_scope", "production.contracts.close"]);
  if (!canAccessModule(access, MODULE_ACCESS.contracts)) redirect("/login");
  const snapshot = await getContractsPageData();
  const contract = snapshot.contracts.find(c => c.id === id);
  if (!contract || (contract.lifecycle?.archived_at && !access.isMaster)) notFound();
  const history = await getLifecycleHistory(id, "contract");
  const prods = snapshot.prods.filter(p => p.contract_id === id && (access.isMaster || !p.lifecycle?.archived_at));
  const l = contract.lifecycle;
  const allFinished = prods.length > 0 && prods.every(p => ["concluidos", "cancelados"].includes(lifecycleView(p)));
  return <div className="space-y-6">
    <PageHeader title={`Contrato ${contract.contract_number}`} description={`${snapshot.clients.find(c => c.id === contract.client_id)?.name ?? ""} · ${contract.work_name}`} actions={<Link href="/contracts" className="underline">Voltar aos contratos</Link>} />
    <section className="space-y-3 rounded-md border border-border bg-white p-4">
      <LifecycleBadge item={contract} />
      <p className="text-sm">Escopo técnico: {l?.scope_confirmed_at ? `conciliado em ${formatDateTime(l.scope_confirmed_at)}` : "aguardando lista integral e conciliação com as PRODs"}.</p>
      <Link href={`/carteira/${id}`} className="text-sm font-semibold text-accent underline">Conferir itens do contrato e PRODs</Link>
      {l?.scope_evidence && <p className="text-sm">Evidência: {l.scope_evidence}</p>}
      <p className="text-sm">Encerramento na Produção: {formatDateTime(l?.completed_at)}.</p>
      {!l?.scope_confirmed_at && allFinished && <p className="rounded bg-amber-50 p-3 text-sm text-amber-900">Lotes atuais concluídos — aguardando conciliação com a lista integral do Técnico.</p>}
      {l?.archived_at && <p className="text-sm">Arquivado em {formatDateTime(l.archived_at)}. Motivo: {l.archive_reason}.</p>}
      <p className="text-sm text-muted-foreground">A conclusão deste contrato se refere à Produção. Instalação e entrega final ao cliente são acompanhadas em Obras.</p>
    </section>
    <section className="space-y-3"><h2 className="font-semibold">PRODs do contrato</h2>
      {prods.length === 0 && <p>Nenhuma PROD cadastrada.</p>}
      {prods.map(prod => <Link key={prod.id} href={`/prods/${prod.id}`} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-white p-3"><span>PROD {prod.prod_number} · {prod.description}</span><LifecycleBadge item={prod} /></Link>)}
    </section>
    {!l?.archived_at && <div className="grid gap-3 lg:grid-cols-2">
      {l?.scope_confirmed_at && (access.isMaster || access.permissions["production.contracts.confirm_scope"]) && <LifecycleCommand entity={id} command="reopen_scope" description="Reabra a confirmação se encontrar uma divergência. Registre a lista integral revisada na carteira; a conciliação será recalculada automaticamente." />}
      {(access.isMaster || access.permissions["production.contracts.close"]) && <LifecycleCommand entity={id} command={l?.completed_at ? "reopen_contract" : "close_contract"} description="O banco verificará novamente a confirmação técnica, todas as PRODs e os impedimentos antes de registrar o encerramento." />}
      {access.isMaster && !l?.completed_at && <LifecycleCommand entity={id} command="archive_contract" description="Somente contratos cujas PRODs estejam individualmente arquivadas podem ser arquivados. Nada é movido para Concluídos." />}
    </div>}
    {access.isMaster && l?.archived_at && <LifecycleCommand entity={id} command="restore_contract" description="As PRODs permanecem arquivadas até sua restauração individual." />}
    <LifecycleHistory events={history.events} profiles={snapshot.profiles.map(p => ({id:p.id,name:p.name}))} />
  </div>;
}
