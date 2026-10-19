"use client";

import { useMemo, useState } from "react";
import { Field, inputClass } from "@/components/action-form";

function dateDaysBefore(value: string, days: number) {
  if (!value) return "";
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return "";

  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

export function ProdDateFields({
  defaultPlannedEndDate = "",
  defaultDeliveryForecast = "",
}: {
  defaultPlannedEndDate?: string | null;
  defaultDeliveryForecast?: string | null;
}) {
  const [deliveryForecast, setDeliveryForecast] = useState(defaultDeliveryForecast ?? "");
  const plannedStartDate = useMemo(
    () => dateDaysBefore(deliveryForecast, 15),
    [deliveryForecast],
  );

  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <Field label="Início previsto">
        <input
          name="planned_start_date"
          type="date"
          className={inputClass}
          value={plannedStartDate}
          readOnly
          aria-readonly="true"
        />
        <span className="mt-1 block text-xs text-muted-foreground">
          Calculado automaticamente 15 dias antes da entrega prevista.
        </span>
      </Field>
      <Field label="Conclusão prevista">
        <input
          name="planned_end_date"
          type="date"
          className={inputClass}
          defaultValue={defaultPlannedEndDate ?? ""}
        />
      </Field>
      <Field label="Entrega prevista">
        <input
          name="delivery_forecast"
          type="date"
          className={inputClass}
          value={deliveryForecast}
          onChange={(event) => setDeliveryForecast(event.target.value)}
        />
      </Field>
    </div>
  );
}
