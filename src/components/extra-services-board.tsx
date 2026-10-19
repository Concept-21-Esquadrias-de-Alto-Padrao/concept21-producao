import { CalendarDays, PackageCheck } from "lucide-react";
import { ActionForm, Field, inputClass, textareaClass } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { ExtraServiceRecipientField } from "@/components/extra-service-recipient-field";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { createExtraServiceAction, planExtraServiceAction } from "@/app/actions";
import { extraServiceStatusLabels, priorityLabels, stopTypeLabels } from "@/lib/labels";
import { getDepartmentName } from "@/lib/production";
import type { ProductionSnapshot } from "@/lib/types";
import { PRIORITIES } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

export function ExtraServicesBoard({ snapshot }: { snapshot: ProductionSnapshot }) {
  const activeRecipients = snapshot.logisticsRecipients.filter(
    (recipient) => recipient.active !== false,
  );
  const activeServices = snapshot.extraServiceCatalog.filter((service) => service.active !== false);
  const canCreate = activeRecipients.length > 0 && activeServices.length > 0;

  return (
    <div className="grid gap-4 xl:grid-cols-[0.9fr_1.1fr]">
      <Panel>
        <PanelHeader title="Novo avulso" />
        <PanelBody>
          {canCreate ? (
            <ActionForm action={createExtraServiceAction} submitLabel="Salvar avulso">
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Tipo de serviço">
                  <select name="service_type" className={inputClass}>
                    <option value="entrega_avulsa">{stopTypeLabels.entrega_avulsa}</option>
                    <option value="coleta_avulsa">{stopTypeLabels.coleta_avulsa}</option>
                    <option value="entrega_coleta_avulsa">
                      {stopTypeLabels.entrega_coleta_avulsa}
                    </option>
                  </select>
                </Field>
                <Field label="Departamento solicitante">
                  <select name="requesting_department_id" className={inputClass} required>
                    <option value="">Selecione</option>
                    {snapshot.departments.map((department) => (
                      <option key={department.id} value={department.id}>
                        {department.name}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <ExtraServiceRecipientField recipients={activeRecipients} />
              <Field label="Descrição do serviço">
                <select name="service_catalog_id" className={inputClass} required>
                  <option value="">Selecione</option>
                  {activeServices.map((service) => (
                    <option key={service.id} value={service.id}>
                      {service.name}
                    </option>
                  ))}
                </select>
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Data">
                  <input name="desired_date" type="date" className={inputClass} />
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
              <Field label="Observações">
                <textarea name="notes" className={textareaClass} />
              </Field>
            </ActionForm>
          ) : (
            <EmptyState
              icon={PackageCheck}
              title="Cadastros logísticos pendentes"
              description={
                !activeRecipients.length && !activeServices.length
                  ? "Cadastre destinatários e serviços padrão em Configurações para criar avulsos."
                  : !activeRecipients.length
                    ? "Cadastre ao menos um destinatário ativo em Configurações > Logística."
                    : "Cadastre ao menos um serviço padrão ativo em Configurações > Logística."
              }
            />
          )}
        </PanelBody>
      </Panel>

      <Panel>
        <PanelHeader title="Avulsos cadastrados" />
        <PanelBody className="space-y-3">
          {snapshot.extraServices.length === 0 ? (
            <EmptyState
              icon={PackageCheck}
              title="Nenhum avulso cadastrado"
              description="Cadastre o primeiro avulso para depois incluí-lo em uma rota."
            />
          ) : (
            snapshot.extraServices.map((service) => (
              <article key={service.id} className="rounded-md border border-border bg-white p-3">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-charcoal">{service.recipient_or_place}</p>
                    <p className="text-sm text-muted-foreground">
                      {stopTypeLabels[service.service_type]} ·{" "}
                      {getDepartmentName(snapshot.departments, service.requesting_department_id)}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "rounded-md px-2 py-1 text-xs font-semibold ring-1",
                      service.status === "previsto"
                        ? "bg-orange-50 text-orange-800 ring-orange-200"
                        : service.status === "em_planejamento"
                          ? "bg-blue-50 text-blue-800 ring-blue-200"
                          : "bg-zinc-100 text-zinc-700 ring-zinc-200",
                    )}
                  >
                    {extraServiceStatusLabels[service.status]}
                  </span>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {service.service_description}
                </p>
                <p className="mt-1 inline-flex items-center gap-2 text-xs text-muted-foreground">
                  <CalendarDays className="size-3" />
                  Data: {formatDate(service.desired_date)}
                </p>
                {service.status === "previsto" ? (
                  <ActionForm
                    action={planExtraServiceAction}
                    submitLabel="Enviar para planejamento"
                    className="mt-3 rounded-md border border-border bg-muted/40 p-3"
                  >
                    <input type="hidden" name="id" value={service.id} />
                    <Field label="Data">
                      <input name="desired_date" type="date" className={inputClass} required />
                    </Field>
                  </ActionForm>
                ) : null}
              </article>
            ))
          )}
        </PanelBody>
      </Panel>
    </div>
  );
}
