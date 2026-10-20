"use client";

import { ActionFeedback } from "@/components/floating-feedback";

import { Loader2, Pencil, Save, Trash2, X } from "lucide-react";
import { useActionState, useEffect, useMemo, useState } from "react";
import { deleteClientAction, updateClientAction } from "@/app/actions";
import { Field, inputClass, textareaClass } from "@/components/action-form";
import type { Client } from "@/lib/types";

type ActionState = {
  ok: boolean;
  message: string;
};

type ClientsListProps = {
  clients: Client[];
  canEdit: boolean;
  canDelete: boolean;
};

const initialState: ActionState = {
  ok: false,
  message: "",
};

function ClientEditForm({
  client,
  onCancel,
  onSaved,
}: {
  client: Client;
  onCancel: () => void;
  onSaved: () => void;
}) {
  const [state, formAction, pending] = useActionState(updateClientAction, initialState);

  useEffect(() => {
    if (!state.ok) return;

    const timeout = window.setTimeout(onSaved, 0);
    return () => window.clearTimeout(timeout);
  }, [onSaved, state.ok]);

  return (
    <form action={formAction} className="space-y-3">
      <input type="hidden" name="id" value={client.id} />
      <Field label="Nome completo">
        <input name="name" className={inputClass} defaultValue={client.name} required />
      </Field>
      <Field label="Observações">
        <textarea name="notes" className={textareaClass} defaultValue={client.notes ?? ""} />
      </Field>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-2">
          <button
            type="submit"
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {pending ? "Salvando..." : "Salvar"}
          </button>
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 py-2 text-sm font-semibold text-charcoal transition hover:border-orange-200 hover:text-accent disabled:cursor-not-allowed disabled:opacity-60"
          >
            <X className="size-4" />
            Cancelar
          </button>
        </div>
        <ActionFeedback state={state} />
      </div>
    </form>
  );
}

function ClientDeleteForm({ client }: { client: Client }) {
  const [state, formAction, pending] = useActionState(deleteClientAction, initialState);

  return (
    <form
      action={formAction}
      onSubmit={(event) => {
        const confirmed = window.confirm(
          `Excluir o cliente "${client.name}"? Esta ação é restrita ao Administrador e não pode ser desfeita.`,
        );

        if (!confirmed) {
          event.preventDefault();
        }
      }}
      className="flex flex-col items-end gap-1"
    >
      <input type="hidden" name="id" value={client.id} />
      <button
        type="submit"
        title="Excluir cliente"
        disabled={pending}
        className="grid size-9 place-items-center rounded-md border border-red-200 text-red-600 transition hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
      </button>
      <ActionFeedback state={state} />
    </form>
  );
}

export function ClientsList({ clients, canEdit, canDelete }: ClientsListProps) {
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [nameFilter, setNameFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const filteredClients = useMemo(() => {
    const normalizedName = nameFilter.trim().toLocaleLowerCase("pt-BR");

    return clients.filter((client) => {
      const matchesName =
        !normalizedName ||
        client.name.toLocaleLowerCase("pt-BR").includes(normalizedName) ||
        (client.notes ?? "").toLocaleLowerCase("pt-BR").includes(normalizedName);
      const matchesStatus =
        !statusFilter ||
        (statusFilter === "active" && client.active) ||
        (statusFilter === "inactive" && !client.active);

      return matchesName && matchesStatus;
    });
  }, [clients, nameFilter, statusFilter]);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 rounded-md border border-border bg-muted/20 p-3 sm:grid-cols-[1fr_13rem_auto]">
        <Field label="Buscar cliente">
          <input
            value={nameFilter}
            onChange={(event) => setNameFilter(event.target.value)}
            className={inputClass}
            placeholder="Nome ou observação"
          />
        </Field>
        <Field label="Status">
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className={inputClass}
          >
            <option value="">Todos</option>
            <option value="active">Ativos</option>
            <option value="inactive">Inativos</option>
          </select>
        </Field>
        <button
          type="button"
          onClick={() => {
            setNameFilter("");
            setStatusFilter("");
          }}
          className="min-h-10 self-end rounded-md border border-border bg-white px-3 text-sm font-semibold text-charcoal transition hover:bg-muted"
        >
          Limpar
        </button>
        <p className="text-xs text-muted-foreground sm:col-span-3">
          {filteredClients.length} de {clients.length} cliente(s) encontrado(s).
        </p>
      </div>

      {filteredClients.map((client) => {
        const editing = editingClientId === client.id;

        return (
          <article key={client.id} className="rounded-md border border-border bg-white p-3">
            {editing ? (
              <ClientEditForm
                client={client}
                onCancel={() => setEditingClientId(null)}
                onSaved={() => setEditingClientId(null)}
              />
            ) : (
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-charcoal">{client.name}</p>
                  {client.notes ? (
                    <p className="mt-1 text-sm text-muted-foreground">{client.notes}</p>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-start justify-between gap-2 sm:justify-end">
                  <span className="rounded-md bg-green-50 px-2 py-1 text-xs font-semibold text-green-800 ring-1 ring-green-200">
                    {client.active ? "Ativo" : "Inativo"}
                  </span>
                  {canEdit ? (
                    <button
                      type="button"
                      title="Editar cliente"
                      onClick={() => setEditingClientId(client.id)}
                      className="grid size-9 place-items-center rounded-md border border-border text-zinc-600 transition hover:border-orange-200 hover:text-accent"
                    >
                      <Pencil className="size-4" />
                    </button>
                  ) : null}
                  {canDelete ? <ClientDeleteForm client={client} /> : null}
                </div>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
