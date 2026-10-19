"use client";

import { ArrowDown, ArrowUp, GripVertical } from "lucide-react";
import { useState } from "react";
import { getDepartmentName, groupProdNumbersForStop, moveStop, reorderStops } from "@/lib/production";
import { stopTypeLabels } from "@/lib/labels";
import type { FreightStop, ProductionSnapshot } from "@/lib/types";

export function RoutePlanner({
  stops,
  snapshot,
}: {
  stops: FreightStop[];
  snapshot: ProductionSnapshot;
}) {
  const [orderedStops, setOrderedStops] = useState(
    stops.slice().sort((a, b) => a.position - b.position),
  );
  const [draggingId, setDraggingId] = useState<string | null>(null);

  return (
    <div className="space-y-3">
      {orderedStops.map((stop, index) => {
        const prodGroups = groupProdNumbersForStop(stop, snapshot);
        return (
          <article
            key={stop.id}
            draggable
            onDragStart={() => setDraggingId(stop.id)}
            onDragOver={(event) => event.preventDefault()}
            onDrop={() => {
              if (draggingId) {
                setOrderedStops(reorderStops(orderedStops, draggingId, stop.id));
              }
              setDraggingId(null);
            }}
            className="rounded-md border border-border bg-white p-3 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <span className="mt-1 inline-flex size-8 shrink-0 items-center justify-center rounded-md bg-muted font-semibold text-charcoal">
                {index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-charcoal">
                      {stop.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {stopTypeLabels[stop.stop_type]} ·{" "}
                      {getDepartmentName(snapshot.departments, stop.requesting_department_id)}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      title="Mover para cima"
                      onClick={() => setOrderedStops(moveStop(orderedStops, stop.id, -1))}
                      className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-white hover:bg-muted"
                    >
                      <ArrowUp className="size-4" />
                    </button>
                    <button
                      type="button"
                      title="Mover para baixo"
                      onClick={() => setOrderedStops(moveStop(orderedStops, stop.id, 1))}
                      className="inline-flex size-9 items-center justify-center rounded-md border border-border bg-white hover:bg-muted"
                    >
                      <ArrowDown className="size-4" />
                    </button>
                    <span
                      title="Arrastar parada"
                      className="inline-flex size-9 cursor-grab items-center justify-center rounded-md border border-border bg-white text-muted-foreground"
                    >
                      <GripVertical className="size-4" />
                    </span>
                  </div>
                </div>
                {prodGroups.length ? (
                  <div className="mt-2 space-y-1">
                    {prodGroups.map((group) => (
                      <p key={group} className="text-sm text-charcoal">
                        {group}
                      </p>
                    ))}
                  </div>
                ) : null}
                <p className="mt-2 text-sm text-muted-foreground">{stop.address}</p>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="text-xs font-semibold text-muted-foreground">
                    Posição
                    <input
                      type="number"
                      min={1}
                      value={index + 1}
                      onChange={(event) => {
                        const nextPosition = Number(event.target.value);
                        const target = orderedStops.find(
                          (item) => item.position === nextPosition,
                        );
                        if (target) {
                          setOrderedStops(reorderStops(orderedStops, stop.id, target.id));
                        }
                      }}
                      className="ml-2 h-9 w-20 rounded-md border border-border px-2 text-sm text-charcoal"
                    />
                  </label>
                  {stop.requires_proof ? (
                    <span className="rounded-md bg-orange-50 px-2 py-1 text-xs font-semibold text-orange-800 ring-1 ring-orange-200">
                      Com comprovante
                    </span>
                  ) : null}
                </div>
              </div>
            </div>
          </article>
        );
      })}
    </div>
  );
}
