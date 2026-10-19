import { CalendarDays, Truck } from "lucide-react";
import { ActionForm, Field, inputClass } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { planFreightDemandAction } from "@/app/actions";
import { prodStatusLabels } from "@/lib/labels";
import { formatProdIdentification } from "@/lib/production";
import type { FreightDemand, ProductionSnapshot } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

function demandContext(snapshot: ProductionSnapshot, demand: FreightDemand) {
  const prod = snapshot.prods.find((item) => item.id === demand.prod_id);
  if (!prod) return null;
  const contract = snapshot.contracts.find((item) => item.id === demand.contract_id);
  if (!contract) return null;
  const client = snapshot.clients.find((item) => item.id === demand.client_id);
  if (!client) return null;
  return { prod, contract, client };
}

function demandStatusLabel(status: FreightDemand["status"]) {
  const labels: Record<FreightDemand["status"], string> = {
    previsto: "Previsto",
    em_planejamento: "Em planejamento",
    incluido_em_rota: "Incluído em rota",
    concluido: "Concluído",
    nao_realizado: "Não realizado",
    cancelado: "Cancelado",
  };

  return labels[status];
}

function canEditDemandStatus(status: FreightDemand["status"]) {
  return status === "previsto" || status === "em_planejamento";
}

export function FreightsBoard({
  snapshot,
  canEdit,
}: {
  snapshot: ProductionSnapshot;
  canEdit: boolean;
}) {
  return (
    <Panel>
      <PanelHeader
        title="Fretes de PROD"
        description="Informe ou ajuste a data prevista antes de montar a rota."
      />
      <PanelBody className="space-y-3">
        {snapshot.freightDemands.length === 0 ? (
          <EmptyState
            icon={Truck}
            title="Nenhum frete previsto"
            description="Cadastre uma PROD para gerar automaticamente um frete previsto."
          />
        ) : (
          snapshot.freightDemands.map((demand) => {
            const context = demandContext(snapshot, demand);
            if (!context) return null;
            const { client, contract, prod } = context;

            return (
              <article key={demand.id} className="rounded-md border border-border bg-white p-4">
                <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
                  <div>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-charcoal">
                          {formatProdIdentification(client, contract, prod)}
                        </p>
                        <p className="mt-1 text-sm text-muted-foreground">
                          {contract.full_address}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "rounded-md px-2 py-1 text-xs font-semibold ring-1",
                          demand.status === "previsto"
                            ? "bg-orange-50 text-orange-800 ring-orange-200"
                            : demand.status === "em_planejamento"
                              ? "bg-blue-50 text-blue-800 ring-blue-200"
                              : "bg-zinc-100 text-zinc-700 ring-zinc-200",
                        )}
                      >
                        {demandStatusLabel(demand.status)}
                      </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
                      <span>Cliente: {client.name}</span>
                      <span>Contrato: {contract.contract_number}</span>
                      <span>Status da PROD: {prodStatusLabels[prod.status]}</span>
                    </div>
                    <p className="mt-2 inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <CalendarDays className="size-4" />
                      Data prevista: {formatDate(demand.planned_date)}
                    </p>
                  </div>

                  {canEdit && canEditDemandStatus(demand.status) ? (
                    <ActionForm
                      action={planFreightDemandAction}
                      submitLabel={
                        demand.status === "previsto" ? "Enviar para planejamento" : "Salvar previsão"
                      }
                      className="rounded-md border border-border bg-muted/40 p-3"
                    >
                      <input type="hidden" name="id" value={demand.id} />
                      <Field label="Data prevista">
                        <input
                          name="planned_date"
                          type="date"
                          className={inputClass}
                          defaultValue={demand.planned_date ?? ""}
                          required
                        />
                      </Field>
                    </ActionForm>
                  ) : null}
                </div>
              </article>
            );
          })
        )}
      </PanelBody>
    </Panel>
  );
}
