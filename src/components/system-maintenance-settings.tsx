"use client";

import { FloatingMessage } from "@/components/floating-feedback";

import { AlertTriangle, CheckCircle2, Loader2, Power, ShieldCheck, Wrench } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "@/components/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { useAsyncResource } from "@/hooks/use-async-resource";
import type { SystemMaintenance } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

type SystemSettingsResponse = {
  maintenance: SystemMaintenance;
  isMaster: boolean;
  currentProfileId: string;
};

async function parseResponse(response: Response) {
  const payload = (await response.json().catch(() => null)) as
    | (Partial<SystemSettingsResponse> & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(payload?.error ?? "Não foi possível carregar as configurações do sistema.");
  }

  if (!payload?.maintenance) {
    throw new Error("Não foi possível carregar a manutenção do sistema.");
  }

  return payload as SystemSettingsResponse;
}

async function loadSystemSettings() {
  const response = await fetch("/api/settings/system", {
    headers: { Accept: "application/json" },
  });

  return parseResponse(response);
}

export function SystemMaintenanceSettings() {
  const resource = useAsyncResource<SystemSettingsResponse>(
    "settings:system",
    loadSystemSettings,
    { ttlMs: 10000 },
  );
  const data = resource.data;
  const loading = resource.loading && !data;
  const [saving, setSaving] = useState(false);
  const [messageOk, setMessageOk] = useState(false);
  const [message, setMessage] = useState("");

  async function setMaintenance(enabled: boolean) {
    if (enabled) {
      const confirmed = window.confirm(
        "Ativar a manutenção do sistema agora? Todos os usuários que não são administradores serão desconectados.",
      );

      if (!confirmed) return;
    }

    try {
      setSaving(true);
      setMessage("");
      setMessageOk(false);

      const response = await fetch("/api/settings/system", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ enabled }),
      });

      const data = await parseResponse(response);
      resource.setData(data);
      setMessageOk(true);
      setMessage(enabled ? "Manutenção ativada." : "Manutenção desativada.");
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Não foi possível alterar a manutenção do sistema.",
      );
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <Panel>
        <PanelBody className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando manutenção do sistema...
        </PanelBody>
      </Panel>
    );
  }

  if (!data) {
    return (
      <Panel>
        <PanelBody>
          <EmptyState
            icon={ShieldCheck}
            title="Controle restrito ao Administrador"
            description={
              resource.error?.message ?? "Não foi possível carregar as configurações do sistema."
            }
          />
        </PanelBody>
      </Panel>
    );
  }

  const { maintenance } = data;
  const active = maintenance.enabled;

  return (
    <Panel>
      <PanelHeader
        title="Manutenção do sistema"
        description="Controle exclusivo do Administrador para bloquear a plataforma durante atualizações."
        actions={
          <span
            className={cn(
              "inline-flex items-center gap-2 rounded-md px-3 py-2 text-xs font-semibold ring-1",
              active
                ? "bg-red-50 text-red-700 ring-red-200"
                : "bg-emerald-50 text-emerald-700 ring-emerald-200",
            )}
          >
            {active ? <AlertTriangle className="size-4" /> : <CheckCircle2 className="size-4" />}
            {active ? "Manutenção ativa" : "Operação normal"}
          </span>
        }
      />
      <PanelBody className="space-y-4">
        <div
          className={cn(
            "rounded-md border p-4",
            active ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50",
          )}
        >
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex gap-3">
              <span
                className={cn(
                  "grid size-11 flex-none place-items-center rounded-md",
                  active ? "bg-red-600 text-white" : "bg-emerald-600 text-white",
                )}
              >
                {active ? <Wrench className="size-5" /> : <ShieldCheck className="size-5" />}
              </span>
              <div>
                <h3 className="text-base font-semibold text-charcoal">
                  {active ? "Plataforma bloqueada para usuários comuns" : "Plataforma liberada"}
                </h3>
                <p className="mt-1 max-w-3xl text-sm leading-6 text-muted-foreground">
                  {active
                    ? "Usuários que não são administradores são desconectados e novas ações ficam bloqueadas enquanto a manutenção estiver ativa."
                    : "Ative a manutenção antes de publicar atualizações que exijam a plataforma sem movimentações operacionais."}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setMaintenance(!active)}
              disabled={saving}
              className={cn(
                "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-4 py-2 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-60",
                active
                  ? "bg-emerald-600 text-white hover:bg-emerald-700"
                  : "bg-red-600 text-white hover:bg-red-700",
              )}
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
              {saving
                ? "Atualizando..."
                : active
                  ? "Desativar manutenção"
                  : "Ativar manutenção"}
            </button>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Status</p>
            <p className="mt-1 text-sm font-semibold text-charcoal">
              {active ? "Bloqueado" : "Liberado"}
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Ativação</p>
            <p className="mt-1 text-sm font-semibold text-charcoal">
              {maintenance.activated_at ? formatDateTime(maintenance.activated_at) : "Nunca ativada"}
            </p>
          </div>
          <div className="rounded-md border border-border bg-muted/40 p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">
              Última atualização
            </p>
            <p className="mt-1 text-sm font-semibold text-charcoal">
              {formatDateTime(maintenance.updated_at)}
            </p>
          </div>
        </div>

        <FloatingMessage message={message} kind={messageOk ? "success" : "error"} />
      </PanelBody>
    </Panel>
  );
}
