"use client";

import { useActionState, useMemo, useState } from "react";
import { mapContractScopeAction } from "@/app/actions";
import { ActionFeedback } from "@/components/floating-feedback";
import { normalizeScopeCode, parseContractScopeMappings, scopeProdParts, type ContractScopeRevision } from "@/lib/contract-scope";

type MappingRow = { code: string; parts: { code: string; quantity: number }[] };

export function ContractScopeMappingForm({ contractId, revision, actualItems }: {
  contractId: string;
  revision: ContractScopeRevision;
  actualItems: { code: string; quantity: number }[];
}) {
  const [result, action, pending] = useActionState(mapContractScopeAction, { ok: false, message: "" });
  const [rows, setRows] = useState<MappingRow[]>(() => revision.items.map(item => ({
    code: item.code,
    parts: scopeProdParts(item).map(part => ({ code: normalizeScopeCode(part.code), quantity: part.quantity })),
  })));
  const available = new Map(actualItems.map(item => [item.code, item.quantity]));
  const validation = useMemo(() => {
    try {
      parseContractScopeMappings(JSON.stringify(rows), revision.items, actualItems);
      return "";
    } catch (error) { return error instanceof Error ? error.message : "Revise os vínculos."; }
  }, [rows, revision.items, actualItems]);

  function changePart(rowIndex: number, partIndex: number, part: { code: string; quantity: number }) {
    setRows(current => current.map((row, index) => index === rowIndex ? {
      ...row, parts: row.parts.map((value, index) => index === partIndex ? part : value),
    } : row));
  }

  return <form action={action} className="mt-4 space-y-4 rounded-md border border-orange-200 bg-orange-50/50 p-4">
    <input type="hidden" name="contract_id" value={contractId} />
    <input type="hidden" name="revision_id" value={revision.id} />
    <input type="hidden" name="mapping_json" value={JSON.stringify(rows)} />
    <div>
      <h3 className="font-semibold">Resolver diferenças entre contrato e PRODs</h3>
      <p className="mt-1 text-sm">Vincule cada item do contrato às peças que o representam nas PRODs. Para um desdobro, adicione outra peça ao mesmo item. Os códigos e as quantidades do contrato permanecem na revisão original.</p>
    </div>
    <button type="button" className="min-h-10 rounded-md border border-border bg-white px-3 text-sm font-semibold" onClick={() => {
      setRows(current => current.map((row, index) => {
        const item = revision.items[index];
        const exact = normalizeScopeCode(item.code);
        return available.get(exact) === item.quantity && !current.some((other, otherIndex) =>
          otherIndex !== index && other.parts.some(part => part.code === exact))
          ? { ...row, parts: [{ code: exact, quantity: item.quantity }] } : row;
      }));
    }}>Vincular coincidências exatas</button>
    <div className="space-y-3">{rows.map((row, rowIndex) => <div key={row.code} className="rounded-md border border-border bg-white p-3">
      <p className="font-semibold">{row.code} · {revision.items[rowIndex].quantity} unidade(s) no contrato</p>
      <div className="mt-2 space-y-2">{row.parts.map((part, partIndex) => <div key={partIndex} className="grid items-end gap-2 sm:grid-cols-[minmax(0,1fr)_7rem_auto]">
        <label className="text-sm">Peça da PROD
          <select aria-label={`Peça da PROD para ${row.code}, vínculo ${partIndex + 1}`} className="mt-1 w-full rounded-md border border-border bg-white p-2" value={part.code}
            onChange={event => {
              const code = event.target.value;
              changePart(rowIndex, partIndex, { code, quantity: available.get(code) ?? part.quantity });
            }}>
            <option value="">Selecione</option>
            {!available.has(part.code) && part.code && <option value={part.code}>{part.code} · sem peça importada</option>}
            {actualItems.map(item => <option key={item.code} value={item.code}>{item.code} · {item.quantity} unidade(s) nas PRODs</option>)}
          </select>
        </label>
        <label className="text-sm">Quantidade vinculada
          <input aria-label={`Quantidade vinculada a ${row.code}, vínculo ${partIndex + 1}`} className="mt-1 w-full rounded-md border border-border bg-white p-2" type="number" min="1" max="10000" step="1" value={part.quantity}
            onChange={event => changePart(rowIndex, partIndex, { ...part, quantity: Number(event.target.value) })} />
        </label>
        <button type="button" disabled={row.parts.length === 1} className="min-h-10 rounded-md border border-border px-3 text-sm disabled:opacity-40"
          onClick={() => setRows(current => current.map((value, index) => index === rowIndex ? {
            ...value, parts: value.parts.filter((_, index) => index !== partIndex),
          } : value))}>Remover</button>
      </div>)}</div>
      <button type="button" className="mt-2 min-h-10 rounded-md border border-border px-3 text-sm" onClick={() => setRows(current => current.map((value, index) => index === rowIndex ? {
        ...value, parts: [...value.parts, { code: "", quantity: 1 }],
      } : value))}>Adicionar peça deste item</button>
    </div>)}</div>
    {revision.source_kind === "tecnico_integral" && <label className="flex gap-2 text-sm"><input type="checkbox" required name="confirmed_technical_scope" value="yes" className="mt-1" /><span>Conferi os vínculos e desdobros com a lista integral vigente do Técnico.</span></label>}
    {validation && <p role="alert" className="text-sm text-amber-900">{validation}</p>}
    <p className="text-xs text-muted-foreground">Salvar cria uma nova revisão dos vínculos. Divergências de peças, liberação ou origem técnica continuam pendentes até serem resolvidas.</p>
    <div className="flex flex-wrap items-center gap-3"><button disabled={pending || Boolean(validation)} className="min-h-10 rounded-md bg-charcoal px-4 text-sm font-semibold text-white disabled:opacity-50">{pending ? "Salvando..." : "Salvar vínculos"}</button><ActionFeedback state={result} /></div>
  </form>;
}
