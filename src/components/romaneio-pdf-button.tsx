"use client";

import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import type { ExpeditionRomaneioReport } from "@/lib/expedition";
import { downloadExpeditionRomaneioPdf } from "@/lib/expedition-romaneio-pdf";

export function RomaneioPdfButton({
  report,
}: {
  report: ExpeditionRomaneioReport;
}) {
  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const disabled = report.rows.length === 0 || downloading;

  async function handleDownload() {
    setDownloading(true);
    setError(null);

    try {
      await downloadExpeditionRomaneioPdf(report);
    } catch {
      setError("Não foi possível gerar o PDF do romaneio.");
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1 sm:items-end">
      <button
        type="button"
        onClick={handleDownload}
        disabled={disabled}
        className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-charcoal px-4 py-2 text-sm font-semibold text-white transition hover:bg-black disabled:cursor-not-allowed disabled:opacity-60"
      >
        {downloading ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
        {downloading ? "Gerando PDF..." : "Gerar romaneio"}
      </button>
      {error ? <span className="text-xs font-medium text-red-600">{error}</span> : null}
      {!error && report.rows.length === 0 ? (
        <span className="text-xs text-muted-foreground">Preencha e salve volumes para gerar o PDF.</span>
      ) : null}
    </div>
  );
}
