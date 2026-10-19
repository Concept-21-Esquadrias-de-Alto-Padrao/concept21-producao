"use client";

import { Eye, Loader2, Pencil, Save, X } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { updateContractAction } from "@/app/actions";
import { Field, inputClass, textareaClass } from "@/components/action-form";
import { ContractAddressFields } from "@/components/contract-address-fields";
import type { Client, ProductionContract, ProductionProd } from "@/lib/types";
import { cn, formatDate } from "@/lib/utils";

type ActionState = {
  ok: boolean;
  message: string;
};

type ContractsListProps = {
  contracts: ProductionContract[];
  clients: Client[];
  prods: ProductionProd[];
  canEdit: boolean;
};

const initialState: ActionState = {
  ok: false,
  message: "",
};

function clientName(clients: Client[], contract: ProductionContract) {
  return clients.find((client) => client.id === contract.client_id)?.name ?? "Cliente";
}

function ContractEditForm({
  contract,
  clients,
  onCancel,
  onSaved,
}: {
  contract: ProductionContract;
  clients: Client[];
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateContractAction, initialState);

  useEffect(() => {
    if (!state.ok) return;
    const timeout = window.setTimeout(onSaved, 0);
    return () => window.clearTimeout(timeout);
  }, [onSaved, state.ok]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={contract.id} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Número do contrato">
          <input
            name="contract_number"
            className={inputClass}
            defaultValue={contract.contract_number}
            required
          />
        </Field>
        <Field label="Cliente">
          <select name="client_id" className={inputClass} defaultValue={contract.client_id} required>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </Field>
      </div>
      <Field label="Obra">
        <input name="work_name" className={inputClass} defaultValue={contract.work_name} required />
      </Field>
      <ContractAddressFields
        defaults={{
          street: contract.street,
          sector: contract.sector,
          block: contract.block,
          lot: contract.lot,
          state: contract.state,
          city: contract.city,
        }}
      />
      <Field label="Previsão geral de entrega">
        <input
          name="general_delivery_forecast"
          type="date"
          className={inputClass}
          defaultValue={contract.general_delivery_forecast ?? ""}
        />
      </Field>
      <Field label="Observações">
        <textarea name="notes" className={textareaClass} defaultValue={contract.notes ?? ""} />
      </Field>
      <input type="hidden" name="status" value={contract.status} />
      <input type="hidden" name="active" value={String(contract.active)} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {pending ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-charcoal transition hover:bg-muted disabled:opacity-60"
          >
            <X className="size-4" />
            Cancelar
          </button>
        </div>
        {state.message ? (
          <p className={cn("text-sm font-medium", state.ok ? "text-success" : "text-danger")}>
            {state.message}
          </p>
        ) : null}
      </div>
    </form>
  );
}

export function ContractsList({ contracts, clients, prods, canEdit }: ContractsListProps) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [clientFilter, setClientFilter] = useState("");
  const [contractFilter, setContractFilter] = useState("");
  const [workFilter, setWorkFilter] = useState("");
  const [stateFilter, setStateFilter] = useState("");

  const filteredContracts = useMemo(() => {
    const normalizedContract = contractFilter.trim().toLocaleLowerCase("pt-BR");
    const normalizedWork = workFilter.trim().toLocaleLowerCase("pt-BR");

    return contracts.filter((contract) => {
      const name = clientName(clients, contract).toLocaleLowerCase("pt-BR");
      const matchesClient = !clientFilter || contract.client_id === clientFilter;
      const matchesContract =
        !normalizedContract ||
        contract.contract_number.toLocaleLowerCase("pt-BR").includes(normalizedContract);
      const matchesWork =
        !normalizedWork ||
        [contract.work_name, contract.full_address, contract.city, contract.sector]
          .join(" ")
          .toLocaleLowerCase("pt-BR")
          .includes(normalizedWork) ||
        name.includes(normalizedWork);
      const matchesState = !stateFilter || contract.state === stateFilter;

      return matchesClient && matchesContract && matchesWork && matchesState;
    });
  }, [clientFilter, clients, contractFilter, contracts, stateFilter, workFilter]);

  const states = Array.from(new Set(contracts.map((contract) => contract.state).filter(Boolean))).sort();

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 md:grid-cols-4">
        <Field label="Cliente">
          <select
            value={clientFilter}
            onChange={(event) => setClientFilter(event.target.value)}
            className={inputClass}
          >
            <option value="">Todos</option>
            {clients.map((client) => (
              <option key={client.id} value={client.id}>
                {client.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Contrato">
          <input
            value={contractFilter}
            onChange={(event) => setContractFilter(event.target.value)}
            className={inputClass}
            placeholder="Número"
          />
        </Field>
        <Field label="Obra, cidade ou setor">
          <input
            value={workFilter}
            onChange={(event) => setWorkFilter(event.target.value)}
            className={inputClass}
            placeholder="Buscar"
          />
        </Field>
        <Field label="Estado">
          <select
            value={stateFilter}
            onChange={(event) => setStateFilter(event.target.value)}
            className={inputClass}
          >
            <option value="">Todos</option>
            {states.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </select>
        </Field>
        <div className="flex items-end gap-2 md:col-span-4">
          <button
            type="button"
            onClick={() => {
              setClientFilter("");
              setContractFilter("");
              setWorkFilter("");
              setStateFilter("");
            }}
            className="min-h-10 rounded-md border border-border bg-white px-3 text-sm font-semibold text-charcoal transition hover:bg-muted"
          >
            Limpar filtros
          </button>
          <p className="self-center text-xs text-muted-foreground">
            {filteredContracts.length} de {contracts.length} contrato(s) encontrado(s).
          </p>
        </div>
      </div>

      {filteredContracts.map((contract) => {
        const client = clientName(clients, contract);
        const prodCount = prods.filter((prod) => prod.contract_id === contract.id).length;
        const editing = editingId === contract.id;
        const viewing = viewingId === contract.id;

        return (
          <article key={contract.id} className="rounded-md border border-border bg-white p-3">
            {editing ? (
              <ContractEditForm
                contract={contract}
                clients={clients}
                onCancel={() => setEditingId(null)}
                onSaved={() => setEditingId(null)}
              />
            ) : (
              <>
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="font-semibold text-charcoal">
                      {client} · {contract.contract_number}
                    </p>
                    <p className="text-sm text-muted-foreground">{contract.work_name}</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <span className="rounded-md bg-zinc-100 px-2 py-1 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-200">
                      {prodCount} PROD(s)
                    </span>
                    <button
                      type="button"
                      title="Visualizar contrato"
                      onClick={() => setViewingId(viewing ? null : contract.id)}
                      className="grid size-9 place-items-center rounded-md border border-border text-zinc-600 transition hover:border-orange-200 hover:text-accent"
                    >
                      <Eye className="size-4" />
                    </button>
                    {canEdit ? (
                      <button
                        type="button"
                        title="Editar contrato"
                        onClick={() => setEditingId(contract.id)}
                        className="grid size-9 place-items-center rounded-md border border-border text-zinc-600 transition hover:border-orange-200 hover:text-accent"
                      >
                        <Pencil className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {contract.full_address}, {contract.city}/{contract.state}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Entrega prevista: {formatDate(contract.general_delivery_forecast)}
                </p>
                {viewing ? (
                  <div className="mt-3 grid gap-2 rounded-md border border-border bg-muted/20 p-3 text-sm md:grid-cols-2">
                    <span>Rua: {contract.street}</span>
                    <span>Setor: {contract.sector}</span>
                    <span>Quadra: {contract.block}</span>
                    <span>Lote: {contract.lot}</span>
                    <span>Status: {contract.status}</span>
                    <span>{contract.active ? "Ativo" : "Inativo"}</span>
                    <p className="md:col-span-2">
                      Observações: {contract.notes ?? "Sem observações cadastradas."}
                    </p>
                  </div>
                ) : null}
              </>
            )}
          </article>
        );
      })}
    </div>
  );
}
