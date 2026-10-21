import Link from "next/link";
import { redirect } from "next/navigation";
import { getContractsPageData } from "@/lib/data";
import { getCurrentPermissionFlags } from "@/lib/server-access";
import { PageHeader } from "@/components/page-header";
import { Field, inputClass } from "@/components/action-form";
import { formatDateTime } from "@/lib/utils";

export default async function Archives({ searchParams }: { searchParams: Promise<{q?: string}> }) {
  const access = await getCurrentPermissionFlags(["production.prods.view"]);
  if (!access.isMaster) redirect("/prods");
  const params = await searchParams;
  const snapshot = await getContractsPageData();
  const q = (params.q ?? "").trim().toLocaleLowerCase("pt-BR");
  const clientName = (id: string) => snapshot.clients.find(c => c.id === id)?.name ?? "Cliente";
  const matches = (text: string) => !q || text.toLocaleLowerCase("pt-BR").includes(q);
  const contracts = snapshot.contracts.filter(c => c.lifecycle?.archived_at && matches(`${clientName(c.client_id)} ${c.contract_number} ${c.work_name}`));
  const prods = snapshot.prods.filter(p => {
    const c = snapshot.contracts.find(c => c.id === p.contract_id);
    return p.lifecycle?.archived_at && c && matches(`${clientName(c.client_id)} ${c.contract_number} ${p.prod_number}`);
  });
  return <div className="space-y-6">
    <PageHeader title="Arquivados — consulta administrativa" description="Registros retirados da operação. Não integram o histórico oficial de concluídos nem contam como entregas ou conclusões." actions={<Link href="/prods" className="underline">Voltar às PRODs</Link>} />
    <form className="flex flex-wrap items-end gap-3"><Field label="Cliente, contrato ou PROD"><input className={inputClass} name="q" defaultValue={params.q} /></Field><button className="min-h-11 rounded bg-charcoal px-4 text-white">Pesquisar</button></form>
    <section className="space-y-3"><h2 className="font-semibold">PRODs arquivadas ({prods.length})</h2>
      {prods.map(p => <Link key={p.id} href={`/prods/${p.id}`} className="block rounded-md border border-border bg-white p-3"><strong>{snapshot.contracts.find(c => c.id === p.contract_id)?.contract_number} · PROD {p.prod_number}</strong><p className="text-sm">{formatDateTime(p.lifecycle?.archived_at)} · {p.lifecycle?.archive_reason}</p></Link>)}
    </section>
    <section className="space-y-3"><h2 className="font-semibold">Contratos arquivados ({contracts.length})</h2>
      {contracts.map(c => <Link key={c.id} href={`/contracts/${c.id}`} className="block rounded-md border border-border bg-white p-3"><strong>{clientName(c.client_id)} · {c.contract_number}</strong><p className="text-sm">{formatDateTime(c.lifecycle?.archived_at)} · {c.lifecycle?.archive_reason}</p></Link>)}
    </section>
    {!contracts.length && !prods.length && <p className="text-sm text-muted-foreground">Nenhum registro encontrado. O arquivamento de etapas anteriores não arquiva automaticamente uma PROD ou contrato.</p>}
  </div>;
}
