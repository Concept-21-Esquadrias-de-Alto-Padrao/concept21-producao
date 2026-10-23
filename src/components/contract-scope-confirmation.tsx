"use client";

import { useActionState } from "react";
import { confirmExistingContractScopeAction } from "@/app/actions";
import { Field, inputClass } from "@/components/action-form";
import { ActionFeedback } from "@/components/floating-feedback";

export function ContractScopeConfirmation({
  contractId, revisionId, sourceReference, sourceRevision, count,
}: {
  contractId: string;
  revisionId: string;
  sourceReference: string;
  sourceRevision: string | null;
  count: number;
}) {
  const [state, action, pending] = useActionState(confirmExistingContractScopeAction, { ok: false, message: "" });
  return <form action={action} className="mt-4 space-y-3 rounded-md border border-amber-300 bg-amber-50 p-4">
    <input type="hidden" name="contract_id" value={contractId} />
    <input type="hidden" name="revision_id" value={revisionId} />
    <h3 className="font-semibold">{count} unidade(s) coincidem com as PRODs. Confirme a origem da lista.</h3>
    <p className="text-sm">Códigos e quantidades da lista já lida coincidem com as peças importadas e liberadas. O sistema ainda não sabe se esta lista representa <strong>todo o escopo vigente do Técnico</strong>. Confira isso com o Técnico antes de confirmar.</p>
    <p className="text-sm">O caminho abaixo veio do cadastro anterior. Atualize se a lista vigente estiver em outro arquivo.</p>
    <Field label="Local da lista vigente conferida"><input className={inputClass} name="source_reference" defaultValue={sourceReference} minLength={3} maxLength={500} required /></Field>
    <Field label="Identificação da revisão vigente (se houver)"><input className={inputClass} name="source_revision" defaultValue={sourceRevision ?? ""} maxLength={100} placeholder="Ex.: revisão 02" /></Field>
    <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="confirmed_technical_scope" value="yes" required className="mt-1" /><span>Conferi com o Técnico que esta lista contém todas as peças do contrato vigente, incluindo revisões e desdobros. Não há outras peças ainda por liberar.</span></label>
    <button type="submit" disabled={pending} className="min-h-10 rounded-md bg-charcoal px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? "Conferindo..." : "Confirmar escopo e conciliar automaticamente"}</button>
    <ActionFeedback state={state} />
  </form>;
}
