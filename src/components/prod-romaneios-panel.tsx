"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { issueRomaneioAction, type IssuedRomaneio } from "@/app/romaneio-actions";
import { RomaneioPdfButton } from "@/components/romaneio-pdf-button";
import { downloadExpeditionRomaneioPdf } from "@/lib/expedition-romaneio-pdf";
import { formatDateTime } from "@/lib/utils";

export function ProdRomaneiosPanel({
  prodId, romaneios, canIssue, pendingPieces,
}: {
  prodId: string;
  romaneios: IssuedRomaneio[];
  canIssue: boolean;
  pendingPieces: number;
}) {
  const router = useRouter();
  const [issuing, setIssuing] = useState(false);
  const [message, setMessage] = useState("");

  async function issue() {
    setIssuing(true);
    setMessage("");
    try {
      const result = await issueRomaneioAction(prodId);
      if (!result.ok) { setMessage(result.message); return; }
      router.refresh();
      try {
        await downloadExpeditionRomaneioPdf(result.romaneio.report);
        setMessage(`${result.romaneio.number} emitido e baixado.`);
      } catch {
        setMessage(`${result.romaneio.number} emitido. Use o botão no histórico para baixar o PDF.`);
      }
    } catch {
      setMessage("Não foi possível emitir o romaneio. Atualize a página e tente novamente.");
    } finally {
      setIssuing(false);
    }
  }

  return <section id="romaneios" className="space-y-4 rounded-md border border-border bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 className="font-semibold">Romaneios da PROD</h2>
        <p className="text-sm text-muted-foreground">Documentos numerados por ano. O PDF e os dados da emissão permanecem disponíveis após a conclusão da carga.</p>
      </div>
      {canIssue && pendingPieces > 0 ? <button type="button" onClick={issue} disabled={issuing} className="min-h-10 rounded-md bg-charcoal px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">
        {issuing ? "Emitindo..." : `Emitir romaneio · ${pendingPieces} peça(s)`}
      </button> : null}
    </div>
    {message && <p role="status" className="rounded-md bg-muted p-3 text-sm">{message}</p>}
    {!romaneios.length && <p className="text-sm text-muted-foreground">Nenhum romaneio numerado emitido nesta PROD.</p>}
    {romaneios.map(document => <article key={document.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border p-3">
      <div>
        <p className="font-semibold">{document.number}</p>
        <p className="text-sm text-muted-foreground">{formatDateTime(document.created_at)} · {document.report.totalItems} item(ns) · {document.report.totalVolumes} volume(s)</p>
      </div>
      <RomaneioPdfButton report={document.report} />
    </article>)}
    <p className="text-xs text-muted-foreground">Emitir o romaneio não confirma saída física. Essa confirmação continua na seção de conclusão da PROD.</p>
  </section>;
}
