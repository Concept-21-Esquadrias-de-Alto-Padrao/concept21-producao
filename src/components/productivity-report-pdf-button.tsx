"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import type { ProductionProductivityReport } from "@/lib/productivity-report";
import { downloadProductionProductivityReportPdf } from "@/lib/productivity-report-pdf";

export function ProductivityReportPdfButton({
  report,
}: {
  report: ProductionProductivityReport;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDownload() {
    setDownloading(true);
    setError(null);

    try {
      await downloadProductionProductivityReportPdf(report);
    } catch {
      setError("Não foi possível gerar o PDF.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-charcoal px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:opacity-60"
      >
        {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {downloading ? "Gerando PDF..." : "Gerar PDF"}
      </button>
      {error ? <span className="text-xs font-medium text-red-600">{error}</span> : null}
    </div>
  );
}
