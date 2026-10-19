"use client";

import { CalendarDays, Loader2, Pencil, Save, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { deleteFreightAction, updateFreightAction } from "@/app/actions";
import { Field, inputClass, textareaClass } from "@/components/action-form";
import { RouteCostFields } from "@/components/route-cost-fields";
import {
  freightStatusLabels,
  routeExecutionTypeLabels,
} from "@/lib/labels";
import type {
  Department,
  ExtraServiceRequest,
  Freight,
  FreightDemand,
  FreightRouteHelper,
  FreightStop,
  LogisticsDriver,
  LogisticsVehicle,
} from "@/lib/types";
import { cn, formatCurrency, formatDate } from "@/lib/utils";

type ActionState = {
  ok: boolean;
  message: string;
};

export type RouteSelectableItem = {
  id: string;
  label: string;
  description: string;
  status: FreightDemand["status"] | ExtraServiceRequest["status"];
};

export type RouteSummary = {
  freight: Freight;
  stops: FreightStop[];
  helpers: FreightRouteHelper[];
  prodCount: number;
  extraCount: number;
  stopCount: number;
};

type RoutesListProps = {
  routes: RouteSummary[];
  drivers: LogisticsDriver[];
  helpers: LogisticsDriver[];
  vehicles: LogisticsVehicle[];
  trailers: LogisticsVehicle[];
  departments: Department[];
  freightOptions: RouteSelectableItem[];
  extraServiceOptions: RouteSelectableItem[];
  fuelPricePerLiter: number;
  canEdit: boolean;
  canDelete: boolean;
};

const initialState: ActionState = {
  ok: false,
  message: "",
};

const routeStatuses = [
  "pre_agendado",
  "agendado",
  "concluido",
  "nao_realizado",
  "cancelado",
] as const;

function routeStatusLabel(status: string) {
  if (status === "pre_agendado") return "Pré-agendado";
  return freightStatusLabels[status as keyof typeof freightStatusLabels] ?? status;
}

function canEditRoute(status: Freight["status"]) {
  return status === "pre_agendado" || status === "agendado";
}

function itemOptionsForRoute(
  options: RouteSelectableItem[],
  currentIds: Set<string>,
): RouteSelectableItem[] {
  return options.filter((option) => currentIds.has(option.id) || option.status === "em_planejamento");
}

function RouteEditForm({
  route,
  drivers,
  helpers,
  vehicles,
  trailers,
  departments,
  freightOptions,
  extraServiceOptions,
  fuelPricePerLiter,
  onCancel,
  onSaved,
}: {
  route: RouteSummary;
  drivers: LogisticsDriver[];
  helpers: LogisticsDriver[];
  vehicles: LogisticsVehicle[];
  trailers: LogisticsVehicle[];
  departments: Department[];
  freightOptions: RouteSelectableItem[];
  extraServiceOptions: RouteSelectableItem[];
  fuelPricePerLiter: number;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateFreightAction, initialState);
  const freight = route.freight;
  const currentDemandIds = useMemo(
    () =>
      new Set(
        route.stops
          .map((stop) => stop.freight_demand_id)
          .filter((item): item is string => Boolean(item)),
      ),
    [route.stops],
  );
  const currentExtraIds = useMemo(
    () =>
      new Set(
        route.stops
          .map((stop) => stop.extra_service_request_id)
          .filter((item): item is string => Boolean(item)),
      ),
    [route.stops],
  );
  const selectableFreights = itemOptionsForRoute(freightOptions, currentDemandIds);
  const selectableExtras = itemOptionsForRoute(extraServiceOptions, currentExtraIds);

  useEffect(() => {
    if (!state.ok) return;

    const timeout = window.setTimeout(onSaved, 0);
    return () => window.clearTimeout(timeout);
  }, [onSaved, state.ok]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={freight.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Data da rota">
          <input
            name="freight_date"
            type="date"
            className={inputClass}
            defaultValue={freight.freight_date}
            required
          />
        </Field>
        <Field label="Saída prevista">
          <input
            name="planned_departure_time"
            type="time"
            className={inputClass}
            defaultValue={freight.planned_departure_time ?? ""}
          />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Motorista">
          <select name="driver_id" className={inputClass} defaultValue={freight.driver_id ?? ""} required>
            <option value="">Selecione</option>
            {drivers.map((driver) => (
              <option key={driver.id} value={driver.id}>
                {driver.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Veículo">
          <select name="vehicle_id" className={inputClass} defaultValue={freight.vehicle_id ?? ""} required>
            <option value="">Selecione</option>
            {vehicles.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {vehicle.name} - {vehicle.plate}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select name="status" className={inputClass} defaultValue={freight.status}>
            {routeStatuses.map((status) => (
              <option key={status} value={status}>
                {routeStatusLabel(status)}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Departamento padrão para novos fretes">
        <select
          name="requesting_department_id"
          className={inputClass}
          defaultValue={departments[0]?.id ?? ""}
        >
          <option value="">Selecione</option>
          {departments.map((department) => (
            <option key={department.id} value={department.id}>
              {department.name}
            </option>
          ))}
        </select>
      </Field>

      <RouteCostFields
        helpers={helpers}
        defaultExecutionType={freight.execution_type}
        defaultExpectedValue={freight.expected_value}
        defaultContractedValue={freight.contracted_value}
        defaultRealizedValue={freight.realized_value}
        defaultAdditionalCosts={freight.additional_costs}
        defaultDistanceKm={freight.distance_km}
        defaultEstimatedHours={freight.estimated_hours}
        defaultHelperHours={freight.helper_hours}
        defaultHelperIds={route.helpers.map((helper) => helper.helper_id).filter(Boolean) as string[]}
        defaultTrailerVehicleId={freight.trailer_vehicle_id ?? ""}
        trailers={trailers}
        fuelPricePerLiter={fuelPricePerLiter}
        includeRealizedValues
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-md border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-semibold text-charcoal">
            Fretes da rota
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto p-3">
            {selectableFreights.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum frete disponível.</p>
            ) : (
              selectableFreights.map((item) => (
                <label
                  key={item.id}
                  className="flex gap-3 rounded-md border border-border bg-white p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    name="freight_demand_ids"
                    value={item.id}
                    defaultChecked={currentDemandIds.has(item.id)}
                    className="mt-1 size-4 rounded border-border"
                  />
                  <span>
                    <span className="block font-semibold text-charcoal">{item.label}</span>
                    <span className="block text-muted-foreground">{item.description}</span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>

        <div className="rounded-md border border-border">
          <div className="border-b border-border bg-muted/40 px-3 py-2 text-sm font-semibold text-charcoal">
            Avulsos da rota
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto p-3">
            {selectableExtras.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhum avulso disponível.</p>
            ) : (
              selectableExtras.map((item) => (
                <label
                  key={item.id}
                  className="flex gap-3 rounded-md border border-border bg-white p-3 text-sm"
                >
                  <input
                    type="checkbox"
                    name="extra_service_ids"
                    value={item.id}
                    defaultChecked={currentExtraIds.has(item.id)}
                    className="mt-1 size-4 rounded border-border"
                  />
                  <span>
                    <span className="block font-semibold text-charcoal">{item.label}</span>
                    <span className="block text-muted-foreground">{item.description}</span>
                  </span>
                </label>
              ))
            )}
          </div>
        </div>
      </div>

      <Field label="Observações">
        <textarea name="notes" className={textareaClass} defaultValue={freight.notes ?? ""} />
      </Field>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {pending ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-charcoal transition hover:border-orange-200 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="size-4" />
            Cancelar
          </button>
        </div>
        {state.message ? (
          <p className={cn("text-sm font-medium", state.ok ? "text-success" : "text-danger")}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

function RouteDeleteForm({ route }: { route: RouteSummary }) {
  const [state, formAction, pending] = useActionState(deleteFreightAction, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Excluir a rota "${route.freight.title}"? Os fretes e avulsos vinculados voltarão para Em planejamento.`,
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="id" value={route.freight.id} />
      <button
        type="submit"
        title="Excluir rota"
        disabled={pending}
        className="grid size-9 place-items-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </button>
      {state.message ? (
        <span className={cn("max-w-56 text-right text-xs", state.ok ? "text-success" : "text-danger")}>
          {state.message}
        </span>
      ) : null}
    </form>
  );
}

export function RoutesList({
  routes,
  drivers,
  helpers,
  vehicles,
  trailers,
  departments,
  freightOptions,
  extraServiceOptions,
  fuelPricePerLiter,
  canEdit,
  canDelete,
}: RoutesListProps) {
  const [editingRouteId, setEditingRouteId] = useState<string | null>(null);
  const [view, setView] = useState<"active" | "history">("active");
  const activeRoutes = routes.filter((route) =>
    ["pre_agendado", "agendado"].includes(route.freight.status),
  );
  const historyRoutes = routes.filter((route) =>
    ["concluido", "nao_realizado", "cancelado"].includes(route.freight.status),
  );
  const visibleRoutes = view === "active" ? activeRoutes : historyRoutes;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 rounded-md border border-border bg-muted/20 p-2">
        {[
          { id: "active", label: "Ativas", count: activeRoutes.length },
          { id: "history", label: "Histórico", count: historyRoutes.length },
        ].map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => {
              setView(item.id as "active" | "history");
              setEditingRouteId(null);
            }}
            className={cn(
              "inline-flex min-h-10 items-center gap-2 rounded-md px-3 text-sm font-semibold transition",
              view === item.id
                ? "bg-charcoal text-white"
                : "bg-white text-muted-foreground ring-1 ring-border hover:text-charcoal",
            )}
          >
            {item.label}
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-xs",
                view === item.id ? "bg-white/15 text-white" : "bg-muted text-muted-foreground",
              )}
            >
              {item.count}
            </span>
          </button>
        ))}
      </div>

      {visibleRoutes.length === 0 ? (
        <p className="rounded-md border border-dashed border-border bg-white p-4 text-sm text-muted-foreground">
          {view === "active"
            ? "Nenhuma rota ativa no momento."
            : "Nenhuma rota concluída, não realizada ou cancelada no histórico."}
        </p>
      ) : null}

      {visibleRoutes.map((route) => {
        const freight = route.freight;
        const editing = editingRouteId === freight.id;
        const editable = canEdit && canEditRoute(freight.status);

        return (
          <article key={freight.id} className="rounded-md border border-border bg-white p-4">
            {editing ? (
              <RouteEditForm
                route={route}
                drivers={drivers}
                helpers={helpers}
                vehicles={vehicles}
                trailers={trailers}
                departments={departments}
                freightOptions={freightOptions}
                extraServiceOptions={extraServiceOptions}
                fuelPricePerLiter={fuelPricePerLiter}
                onCancel={() => setEditingRouteId(null)}
                onSaved={() => setEditingRouteId(null)}
              />
            ) : (
              <>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-charcoal">{freight.title}</p>
                    <p className="mt-1 inline-flex items-center gap-2 text-sm text-muted-foreground">
                      <CalendarDays className="size-4" />
                      {formatDate(freight.freight_date)} ·{" "}
                      {freight.planned_departure_time ?? "Sem horário"}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-start justify-end gap-2">
                    <span
                      className={cn(
                        "rounded-md px-2 py-1 text-xs font-semibold ring-1",
                        freight.status === "concluido"
                          ? "bg-emerald-50 text-emerald-800 ring-emerald-200"
                          : freight.status === "cancelado" || freight.status === "nao_realizado"
                            ? "bg-red-50 text-red-800 ring-red-200"
                            : "bg-blue-50 text-blue-800 ring-blue-200",
                      )}
                    >
                      {routeStatusLabel(freight.status)}
                    </span>
                    {editable ? (
                      <button
                        type="button"
                        title="Editar rota"
                        onClick={() => setEditingRouteId(freight.id)}
                        className="grid size-9 place-items-center rounded-md border border-border text-zinc-600 transition hover:border-orange-200 hover:text-accent"
                      >
                        <Pencil className="size-4" />
                      </button>
                    ) : null}
                    {canDelete ? <RouteDeleteForm route={route} /> : null}
                  </div>
                </div>

                <div className="mt-3 grid gap-2 text-sm text-muted-foreground sm:grid-cols-5">
                  <span>Motorista: {freight.driver ?? "Não informado"}</span>
                  <span>
                    Veículo: {freight.vehicle ?? "Não informado"}{" "}
                    {freight.plate ? `- ${freight.plate}` : ""}
                  </span>
                  <span>
                    Carretinha:{" "}
                    {freight.trailer
                      ? `${freight.trailer}${freight.trailer_plate ? ` - ${freight.trailer_plate}` : ""}`
                      : "Não vinculada"}
                  </span>
                  <span>Tipo: {routeExecutionTypeLabels[freight.execution_type]}</span>
                  <span>Valor: {formatCurrency(freight.expected_value)}</span>
                </div>

                {freight.execution_type === "veiculo_proprio" ? (
                  <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-5">
                    <span className="rounded-md bg-orange-50 px-2 py-1 text-orange-900">
                      Combustível: {formatCurrency(freight.fuel_cost)}
                    </span>
                    <span className="rounded-md bg-orange-50 px-2 py-1 text-orange-900">
                      Mão de obra: {formatCurrency(freight.driver_labor_cost)}
                    </span>
                    <span className="rounded-md bg-orange-50 px-2 py-1 text-orange-900">
                      Ajudantes: {formatCurrency(freight.helper_labor_cost)}
                    </span>
                    <span className="rounded-md bg-orange-50 px-2 py-1 text-orange-900">
                      Desgaste: {formatCurrency(freight.vehicle_wear_cost)}
                    </span>
                    <span className="rounded-md bg-orange-50 px-2 py-1 text-orange-900">
                      Carretinha: {formatCurrency(freight.trailer_wear_cost)}
                    </span>
                  </div>
                ) : null}

                <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                  <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                    {route.prodCount} frete(s)
                  </span>
                  <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                    {route.extraCount} avulso(s)
                  </span>
                  <span className="rounded-md bg-muted px-2 py-1 text-muted-foreground">
                    {route.stopCount} parada(s)
                  </span>
                </div>
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
