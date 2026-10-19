"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/action-form";
import { routeExecutionTypeLabels } from "@/lib/labels";
import type { LogisticsDriver, LogisticsVehicle, RouteExecutionType } from "@/lib/types";
import { formatCurrency } from "@/lib/utils";

export function RouteCostFields({
  helpers,
  trailers = [],
  defaultExecutionType = "terceirizado",
  defaultExpectedValue = 0,
  defaultContractedValue = 0,
  defaultRealizedValue = 0,
  defaultAdditionalCosts = 0,
  defaultDistanceKm = 0,
  defaultEstimatedHours = 0,
  defaultHelperHours = 0,
  defaultHelperIds = [],
  defaultTrailerVehicleId = "",
  fuelPricePerLiter = 0,
  includeRealizedValues = false,
}: {
  helpers: LogisticsDriver[];
  trailers?: LogisticsVehicle[];
  defaultExecutionType?: RouteExecutionType;
  defaultExpectedValue?: number;
  defaultContractedValue?: number;
  defaultRealizedValue?: number;
  defaultAdditionalCosts?: number;
  defaultDistanceKm?: number;
  defaultEstimatedHours?: number;
  defaultHelperHours?: number;
  defaultHelperIds?: string[];
  defaultTrailerVehicleId?: string | null;
  fuelPricePerLiter?: number;
  includeRealizedValues?: boolean;
}) {
  const [executionType, setExecutionType] =
    useState<RouteExecutionType>(defaultExecutionType);
  const [hasHelpers, setHasHelpers] = useState(defaultHelperIds.length > 0);
  const [hasTrailer, setHasTrailer] = useState(Boolean(defaultTrailerVehicleId));
  const helperSet = new Set(defaultHelperIds);

  return (
    <div className="space-y-3 rounded-md border border-border bg-muted/30 p-3">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Tipo de execução">
          <select
            name="execution_type"
            className={inputClass}
            value={executionType}
            onChange={(event) => setExecutionType(event.target.value as RouteExecutionType)}
          >
            <option value="terceirizado">{routeExecutionTypeLabels.terceirizado}</option>
            <option value="veiculo_proprio">{routeExecutionTypeLabels.veiculo_proprio}</option>
          </select>
        </Field>

        {executionType === "terceirizado" ? (
          <>
            <Field label="Valor previsto">
              <input
                name="expected_value"
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                defaultValue={defaultExpectedValue}
                required
              />
            </Field>
            <Field label="Valor contratado">
              <input
                name="contracted_value"
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                defaultValue={defaultContractedValue}
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Distância km">
              <input
                name="distance_km"
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                defaultValue={defaultDistanceKm}
                required
              />
            </Field>
            <Field label="Horas estimadas">
              <input
                name="estimated_hours"
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                defaultValue={defaultEstimatedHours}
                required
              />
            </Field>
          </>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Custos adicionais">
          <input
            name="additional_costs"
            type="number"
            min={0}
            step="0.01"
            className={inputClass}
            defaultValue={defaultAdditionalCosts}
          />
        </Field>
        {includeRealizedValues ? (
          <>
            <Field label="Valor realizado">
              <input
                name="realized_value"
                type="number"
                min={0}
                step="0.01"
                className={inputClass}
                defaultValue={defaultRealizedValue}
              />
            </Field>
            {executionType === "veiculo_proprio" ? (
              <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                Custo atual: {formatCurrency(defaultExpectedValue)}
              </div>
            ) : null}
          </>
        ) : null}
      </div>

      {executionType === "veiculo_proprio" ? (
        <div className="space-y-3">
          <div className="rounded-md border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
            Valor global do combustível: {formatCurrency(fuelPricePerLiter)} por litro.
          </div>

          <label className="inline-flex items-center gap-2 text-sm font-semibold text-charcoal">
            <input
              type="checkbox"
              checked={hasTrailer}
              onChange={(event) => setHasTrailer(event.target.checked)}
              className="size-4 rounded border-border"
            />
            Vincular carretinha?
          </label>

          {hasTrailer ? (
            <Field label="Carretinha">
              <select
                name="trailer_vehicle_id"
                className={inputClass}
                defaultValue={defaultTrailerVehicleId ?? ""}
                required
                disabled={trailers.length === 0}
              >
                <option value="">
                  {trailers.length ? "Selecione" : "Nenhuma carretinha própria cadastrada"}
                </option>
                {trailers.map((trailer) => (
                  <option key={trailer.id} value={trailer.id}>
                    {trailer.name} - {trailer.plate}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-muted-foreground">
                O custo de desgaste por km da carretinha será somado ao custo interno da rota.
              </span>
            </Field>
          ) : null}

          <label className="inline-flex items-center gap-2 text-sm font-semibold text-charcoal">
            <input
              type="checkbox"
              checked={hasHelpers}
              onChange={(event) => setHasHelpers(event.target.checked)}
              className="size-4 rounded border-border"
            />
            Terá ajudante?
          </label>

          {hasHelpers ? (
            <>
              <Field label="Horas por ajudante">
                <input
                  name="helper_hours"
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputClass}
                  defaultValue={defaultHelperHours}
                  required
                />
              </Field>

              <div className="grid gap-2 sm:grid-cols-2">
                {helpers.length === 0 ? (
                  <p className="rounded-md border border-dashed border-border bg-white p-3 text-sm text-muted-foreground">
                    Nenhum ajudante ativo cadastrado em Configurações.
                  </p>
                ) : (
                  helpers.map((helper) => (
                    <label
                      key={helper.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-border bg-white p-3 text-sm"
                    >
                      <span>
                        <span className="block font-semibold text-charcoal">{helper.name}</span>
                        <span className="block text-muted-foreground">
                          {formatCurrency(helper.hourly_cost)} por hora
                        </span>
                      </span>
                      <input
                        type="checkbox"
                        name="helper_ids"
                        value={helper.id}
                        defaultChecked={helperSet.has(helper.id)}
                        className="size-4 rounded border-border"
                      />
                    </label>
                  ))
                )}
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
