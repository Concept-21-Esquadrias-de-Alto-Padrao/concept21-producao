"use client";

import { Clipboard, Check } from "lucide-react";
import { useMemo, useState } from "react";
import { generateRouteReport } from "@/lib/production";
import type { Freight, FreightStop, ProductionSnapshot } from "@/lib/types";

export function RouteReportClient({
  freight,
  stops,
  snapshot,
  canIncludeValues = false,
}: {
  freight: Freight;
  stops: FreightStop[];
  snapshot: ProductionSnapshot;
  canIncludeValues?: boolean;
}) {
  const [includeValues, setIncludeValues] = useState(false);
  const [copied, setCopied] = useState(false);
  const initialReport = useMemo(
    () =>
      generateRouteReport(freight, stops, snapshot, {
        includeValues: includeValues && canIncludeValues,
      }),
    [canIncludeValues, freight, includeValues, snapshot, stops],
  );
  const [report, setReport] = useState(initialReport);

  function refreshReport(nextIncludeValues = includeValues) {
    setReport(
      generateRouteReport(freight, stops, snapshot, {
        includeValues: nextIncludeValues && canIncludeValues,
      }),
    );
  }

  async function copyReport() {
    await navigator.clipboard.writeText(report);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="space-y-3">
      {canIncludeValues ? (
        <label className="inline-flex items-center gap-2 text-sm font-medium text-charcoal">
          <input
            type="checkbox"
            checked={includeValues}
            onChange={(event) => {
              setIncludeValues(event.target.checked);
              refreshReport(event.target.checked);
            }}
            className="size-4 rounded border-border text-accent"
          />
          Incluir valores no relatório
        </label>
      ) : null}
      <textarea
        value={report}
        onChange={(event) => setReport(event.target.value)}
        className="min-h-96 w-full rounded-md border border-border bg-white p-3 font-mono text-sm leading-6 text-charcoal outline-none focus:border-accent focus:ring-2 focus:ring-orange-200"
      />
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={copyReport}
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-charcoal px-4 py-2 text-sm font-semibold text-white hover:bg-black"
        >
          {copied ? <Check className="size-4" /> : <Clipboard className="size-4" />}
          {copied ? "Relatório copiado" : "Copiar relatório da rota"}
        </button>
        <button
          type="button"
          onClick={() => refreshReport()}
          className="inline-flex min-h-11 items-center justify-center rounded-md border border-border bg-white px-4 py-2 text-sm font-semibold text-charcoal hover:bg-muted"
        >
          Regerar texto
        </button>
      </div>
    </div>
  );
}
