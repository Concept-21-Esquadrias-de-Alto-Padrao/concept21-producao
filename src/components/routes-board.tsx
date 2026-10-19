import { Map, PackageCheck, Truck } from "lucide-react";
import { ActionForm, Field, inputClass, textareaClass } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { RouteCostFields } from "@/components/route-cost-fields";
import { RoutesList, type RouteSelectableItem, type RouteSummary } from "@/components/routes-list";
import { createFreightAction } from "@/app/actions";
import { ROUTE_STATUSES } from "@/lib/schemas";
import { extraServiceStatusLabels, freightStatusLabels, stopTypeLabels } from "@/lib/labels";
import {
  formatProdIdentification,
  getDepartmentName,
  getRoutesForDate,
} from "@/lib/production";
import type { FreightDemand, ProductionSnapshot } from "@/lib/types";
import { formatDate } from "@/lib/utils";

function demandContext(snapshot: ProductionSnapshot, demand: FreightDemand) {
  const prod = snapshot.prods.find((item) => item.id === demand.prod_id);
  if (!prod) return null;
  const contract = snapshot.contracts.find((item) => item.id === demand.contract_id);
  if (!contract) return null;
  const client = snapshot.clients.find((item) => item.id === demand.client_id);
  if (!client) return null;
  return { prod, contract, client };
}

function routeStatusLabel(status: string) {
  if (status === "pre_agendado") return "Pré-agendado";
  return freightStatusLabels[status as keyof typeof freightStatusLabels] ?? status;
}

function buildFreightOptions(snapshot: ProductionSnapshot): RouteSelectableItem[] {
  const options: RouteSelectableItem[] = [];

  for (const demand of snapshot.freightDemands) {
    const context = demandContext(snapshot, demand);
    if (!context) continue;

    options.push({
        id: demand.id,
        status: demand.status,
        label: formatProdIdentification(context.client, context.contract, context.prod),
        description: `${context.contract.full_address} · ${formatDate(demand.planned_date)}`,
    });
  }

  return options;
}

function buildExtraServiceOptions(snapshot: ProductionSnapshot): RouteSelectableItem[] {
  return snapshot.extraServices.map((service) => ({
    id: service.id,
    status: service.status,
    label: service.recipient_or_place,
    description: `${stopTypeLabels[service.service_type]} · ${getDepartmentName(
      snapshot.departments,
      service.requesting_department_id,
    )} · ${formatDate(service.desired_date)}`,
  }));
}

export function RoutesBoard({
  snapshot,
  canEdit,
  canDelete,
}: {
  snapshot: ProductionSnapshot;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const freightDemands = snapshot.freightDemands.filter(
    (demand) => demand.status === "em_planejamento",
  );
  const extraServices = snapshot.extraServices.filter(
    (service) => service.status === "em_planejamento",
  );
  const activeDrivers = snapshot.logisticsDrivers.filter(
    (driver) => driver.active && driver.can_drive,
  );
  const activeHelpers = snapshot.logisticsDrivers.filter(
    (driver) => driver.active && driver.can_help,
  );
  const activeVehicles = snapshot.logisticsVehicles.filter(
    (vehicle) => vehicle.active && (vehicle.vehicle_kind ?? "veiculo") === "veiculo",
  );
  const activeTrailers = snapshot.logisticsVehicles.filter(
    (vehicle) =>
      vehicle.active &&
      vehicle.ownership_type === "proprio" &&
      (vehicle.vehicle_kind ?? "veiculo") === "carretinha",
  );
  const activeDepartments = snapshot.departments.filter((department) => department.active);
  const fuelPricePerLiter = snapshot.logisticsSettings?.fuel_price_per_liter ?? 0;
  const canCreateRoute =
    activeDrivers.length > 0 &&
    activeVehicles.length > 0 &&
    activeDepartments.length > 0 &&
    (freightDemands.length > 0 || extraServices.length > 0);
  const freightOptions = buildFreightOptions(snapshot);
  const extraServiceOptions = buildExtraServiceOptions(snapshot);
  const routes: RouteSummary[] = snapshot.freights.map((freight) => {
    const route = getRoutesForDate(snapshot, freight.freight_date).find(
      (item) => item.freight.id === freight.id,
    );
    const stops = snapshot.freightStops
      .filter((stop) => stop.freight_id === freight.id)
      .sort((a, b) => a.position - b.position);

    return {
      freight,
      stops,
      helpers: snapshot.freightRouteHelpers.filter((helper) => helper.freight_id === freight.id),
      prodCount: route?.prodCount ?? 0,
      extraCount: route?.extraCount ?? 0,
      stopCount: route?.stops.length ?? 0,
    };
  });

  return (
    <div className="space-y-6">
      <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
        <Panel>
          <PanelHeader
            title="Nova rota"
            description="Selecione a data, o veículo, o motorista e os itens planejados."
          />
          <PanelBody>
            {canCreateRoute ? (
              <ActionForm action={createFreightAction} submitLabel="Criar rota">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Data da rota">
                    <input name="freight_date" type="date" className={inputClass} required />
                  </Field>
                  <Field label="Saída prevista">
                    <input name="planned_departure_time" type="time" className={inputClass} />
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Motorista">
                    <select name="driver_id" className={inputClass} required>
                      <option value="">Selecione</option>
                      {activeDrivers.map((driver) => (
                        <option key={driver.id} value={driver.id}>
                          {driver.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Veículo">
                    <select name="vehicle_id" className={inputClass} required>
                      <option value="">Selecione</option>
                      {activeVehicles.map((vehicle) => (
                        <option key={vehicle.id} value={vehicle.id}>
                          {vehicle.name} - {vehicle.plate}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Departamento padrão">
                    <select name="requesting_department_id" className={inputClass} required>
                      <option value="">Selecione</option>
                      {activeDepartments.map((department) => (
                        <option key={department.id} value={department.id}>
                          {department.name}
                        </option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Status">
                    <select name="status" className={inputClass} defaultValue="pre_agendado">
                      {ROUTE_STATUSES.map((status) => (
                        <option key={status} value={status}>
                          {routeStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>

                <RouteCostFields
                  helpers={activeHelpers}
                  trailers={activeTrailers}
                  fuelPricePerLiter={fuelPricePerLiter}
                />

                <div className="rounded-md border border-border">
                  <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-semibold text-charcoal">
                    Fretes em planejamento
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto p-3">
                    {freightDemands.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum frete em planejamento.
                      </p>
                    ) : (
                      freightDemands.map((demand) => {
                        const context = demandContext(snapshot, demand);
                        if (!context) return null;

                        return (
                          <label
                            key={demand.id}
                            className="flex gap-3 rounded-md border border-border bg-white p-3 text-sm"
                          >
                            <input
                              type="checkbox"
                              name="freight_demand_ids"
                              value={demand.id}
                              className="mt-1 size-4 rounded border-border"
                            />
                            <span>
                              <span className="block font-semibold text-charcoal">
                                {formatProdIdentification(
                                  context.client,
                                  context.contract,
                                  context.prod,
                                )}
                              </span>
                              <span className="block text-muted-foreground">
                                {context.contract.full_address} · {formatDate(demand.planned_date)}
                              </span>
                            </span>
                          </label>
                        );
                      })
                    )}
                  </div>
                </div>

                <div className="rounded-md border border-border">
                  <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-semibold text-charcoal">
                    Avulsos em planejamento
                  </div>
                  <div className="max-h-72 space-y-2 overflow-y-auto p-3">
                    {extraServices.length === 0 ? (
                      <p className="text-sm text-muted-foreground">
                        Nenhum avulso em planejamento.
                      </p>
                    ) : (
                      extraServices.map((service) => (
                        <label
                          key={service.id}
                          className="flex gap-3 rounded-md border border-border bg-white p-3 text-sm"
                        >
                          <input
                            type="checkbox"
                            name="extra_service_ids"
                            value={service.id}
                            className="mt-1 size-4 rounded border-border"
                          />
                          <span>
                            <span className="block font-semibold text-charcoal">
                              {service.recipient_or_place}
                            </span>
                            <span className="block text-muted-foreground">
                              {stopTypeLabels[service.service_type]} ·{" "}
                              {getDepartmentName(
                                snapshot.departments,
                                service.requesting_department_id,
                              )}{" "}
                              · {formatDate(service.desired_date)}
                            </span>
                          </span>
                        </label>
                      ))
                    )}
                  </div>
                </div>

                <Field label="Observações">
                  <textarea name="notes" className={textareaClass} />
                </Field>
              </ActionForm>
            ) : (
              <EmptyState
                icon={Map}
                title="Rota ainda não pode ser criada"
                description="Cadastre motoristas, veículos e coloque ao menos um frete ou avulso em planejamento."
              />
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Rotas cadastradas"
            description="Relação de rotas criadas a partir de fretes e avulsos planejados."
          />
          <PanelBody className="space-y-3">
            {routes.length === 0 ? (
              <EmptyState
                icon={Truck}
                title="Nenhuma rota cadastrada"
                description="Crie a primeira rota depois que houver itens em planejamento."
              />
            ) : (
              <RoutesList
                routes={routes}
                drivers={activeDrivers}
                helpers={activeHelpers}
                vehicles={activeVehicles}
                trailers={activeTrailers}
                departments={activeDepartments}
                freightOptions={freightOptions}
                extraServiceOptions={extraServiceOptions}
                fuelPricePerLiter={fuelPricePerLiter}
                canEdit={canEdit}
                canDelete={canDelete}
              />
            )}
          </PanelBody>
        </Panel>
      </div>

      <Panel>
        <PanelHeader
          title="Fila de planejamento"
          description="Itens prontos para entrar em uma rota futura."
        />
        <PanelBody className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-charcoal">
              <Truck className="size-4 text-accent" />
              Fretes
            </div>
            {freightDemands.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-muted/50 p-4 text-sm text-muted-foreground">
                Nenhum frete em planejamento.
              </p>
            ) : (
              freightDemands.map((demand) => {
                const context = demandContext(snapshot, demand);
                if (!context) return null;
                return (
                  <div key={demand.id} className="rounded-md border border-border bg-white p-3 text-sm">
                    <p className="font-semibold text-charcoal">
                      {formatProdIdentification(context.client, context.contract, context.prod)}
                    </p>
                    <p className="text-muted-foreground">
                      {formatDate(demand.planned_date)} · {context.contract.full_address}
                    </p>
                  </div>
                );
              })
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm font-semibold text-charcoal">
              <PackageCheck className="size-4 text-accent" />
              Avulsos
            </div>
            {extraServices.length === 0 ? (
              <p className="rounded-md border border-dashed border-border bg-muted/50 p-4 text-sm text-muted-foreground">
                Nenhum avulso em planejamento.
              </p>
            ) : (
              extraServices.map((service) => (
                <div key={service.id} className="rounded-md border border-border bg-white p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-charcoal">{service.recipient_or_place}</p>
                      <p className="text-muted-foreground">
                        {stopTypeLabels[service.service_type]} · {formatDate(service.desired_date)}
                      </p>
                    </div>
                    <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-semibold text-blue-800 ring-1 ring-blue-200">
                      {extraServiceStatusLabels[service.status]}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}
