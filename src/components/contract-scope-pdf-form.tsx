"use client";

import { useActionState, useRef, useState } from "react";
import { registerContractScopeAction } from "@/app/actions";
import { ActionFeedback } from "@/components/floating-feedback";
import { Field, inputClass } from "@/components/action-form";
import type { ContractScopePdfPreview } from "@/lib/contract-scope-pdf";

type Preview = ContractScopePdfPreview & { fileName: string };

export function ContractScopePdfForm({ contractId }: { contractId: string }) {
  const [state, action, pending] = useActionState(registerContractScopeAction, { ok: false, message: "" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [kind, setKind] = useState("proposta");
  const requestId = useRef(0);

  async function readPdf(file: File | null) {
    const currentRequest = ++requestId.current;
    setPreview(null);
    setError("");
    if (!file) { setLoading(false); return; }
    setLoading(true);
    try {
      const body = new FormData();
      body.append("file", file);
      const response = await fetch(`/api/contracts/${contractId}/scope/preview`, { method: "POST", body });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Falha na leitura do PDF.");
      if (currentRequest === requestId.current) setPreview(result as Preview);
    } catch (cause) {
      if (currentRequest === requestId.current) setError(cause instanceof Error ? cause.message : "Falha na leitura do PDF.");
    } finally {
      if (currentRequest === requestId.current) setLoading(false);
    }
  }

  return <form action={action} className="mt-4 space-y-4">
    <input type="hidden" name="contract_id" value={contractId} />
    <Field label="PDF do desenho ou proposta deste contrato"><input required type="file" accept="application/pdf,.pdf" name="pdf_file" className={inputClass} onChange={event => readPdf(event.target.files?.[0] ?? null)} /></Field>
    {loading && <p className="text-sm">Lendo os itens do PDF...</p>}
    {error && <p role="alert" className="rounded bg-red-50 p-3 text-sm text-red-900">{error}</p>}
    {preview && <div className="rounded border border-border bg-slate-50 p-3 text-sm">
      <p className="font-semibold">Prévia de {preview.fileName} · contrato {preview.contractNumber}</p>
      <p className="mt-1 text-muted-foreground">{preview.items.length} códigos · {preview.items.reduce((total, item) => total + item.quantity, 0)} unidades. Documento identificado como proposta; confira se corresponde à lista vigente do Técnico.</p>
      <ul className="mt-2 flex flex-wrap gap-2">{preview.items.map(item => <li key={item.code} className="rounded border border-border bg-white px-2 py-1">{item.code}: {item.quantity}</li>)}</ul>
    </div>}
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Como registrar esta leitura"><select required className={inputClass} name="source_kind" value={kind} onChange={event => setKind(event.target.value)}>
        <option value="proposta">Proposta provisória</option>
        <option value="tecnico_integral">Conferida com lista integral vigente do Técnico</option>
      </select></Field>
      <Field label="Identificação da revisão (se houver)"><input className={inputClass} name="source_revision" maxLength={100} placeholder="Ex.: revisão 02" /></Field>
    </div>
    {kind === "tecnico_integral" && <label className="flex gap-2 text-sm"><input type="checkbox" required name="confirmed_technical_scope" value="yes" className="mt-1" /><span>Conferi que todos os itens e quantidades extraídos do PDF correspondem à lista integral vigente no Técnico, incluindo revisões e desdobros.</span></label>}
    <div className="flex flex-wrap items-center gap-3">
      <button type="submit" disabled={!preview || loading || pending} className="min-h-11 rounded-md bg-accent px-4 py-2 text-sm font-semibold text-accent-foreground disabled:cursor-not-allowed disabled:opacity-60">{pending ? "Registrando..." : "Registrar itens lidos"}</button>
      <ActionFeedback state={state} />
    </div>
  </form>;
}
