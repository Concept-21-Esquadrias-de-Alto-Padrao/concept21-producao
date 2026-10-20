"use client";

import { FloatingMessage } from "@/components/floating-feedback";

import {
  AlertTriangle,
  Loader2,
  MapPin,
  PackageCheck,
  Plus,
  Save,
  Trash2,
  Truck,
  UserRound,
} from "lucide-react";
import { type ReactNode, useEffect, useState } from "react";
import { Field, inputClass, textareaClass } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { toUserFriendlyErrorMessage } from "@/lib/errors";
import type {
  ExtraServiceCatalog,
  LogisticsDriver,
  LogisticsRecipient,
  LogisticsSettings,
  LogisticsVehicle,
} from "@/lib/types";
import { accentDisplayText } from "@/lib/utils";

type LogisticsData = {
  recipients: LogisticsRecipient[];
  drivers: LogisticsDriver[];
  vehicles: LogisticsVehicle[];
  settings: LogisticsSettings;
  serviceCatalog: ExtraServiceCatalog[];
};

type LogisticsResponse = Partial<LogisticsData> & {
  error?: string;
};

type LogisticsActionPayload =
  | { action: "createRecipient"; name: string; address: string; active: boolean }
  | { action: "updateRecipient"; id: string; name: string; address: string; active: boolean }
  | { action: "deleteRecipient"; id: string }
  | {
      action: "createDriver";
      name: string;
      hourly_cost: number;
      can_drive: boolean;
      can_help: boolean;
      active: boolean;
    }
  | {
      action: "updateDriver";
      id: string;
      name: string;
      hourly_cost: number;
      can_drive: boolean;
      can_help: boolean;
      active: boolean;
    }
  | { action: "deleteDriver"; id: string }
  | {
      action: "createVehicle";
      name: string;
      plate: string;
      vehicle_kind: "veiculo" | "carretinha";
      ownership_type: "proprio" | "terceiro";
      fuel_consumption_km_l: number;
      wear_cost_per_km: number;
      active: boolean;
    }
  | {
      action: "updateVehicle";
      id: string;
      name: string;
      plate: string;
      vehicle_kind: "veiculo" | "carretinha";
      ownership_type: "proprio" | "terceiro";
      fuel_consumption_km_l: number;
      wear_cost_per_km: number;
      active: boolean;
    }
  | { action: "deleteVehicle"; id: string }
  | { action: "updateSettings"; fuel_price_per_liter: number }
  | { action: "createService"; name: string; description: string; active: boolean }
  | { action: "updateService"; id: string; name: string; description: string; active: boolean }
  | { action: "deleteService"; id: string };

type RecipientDraft = {
  name: string;
  address: string;
  active: boolean;
};

type DriverDraft = {
  name: string;
  hourly_cost: number;
  can_drive: boolean;
  can_help: boolean;
  active: boolean;
};

type VehicleDraft = {
  name: string;
  plate: string;
  vehicle_kind: "veiculo" | "carretinha";
  ownership_type: "proprio" | "terceiro";
  fuel_consumption_km_l: number;
  wear_cost_per_km: number;
  active: boolean;
};

type ServiceDraft = {
  name: string;
  description: string;
  active: boolean;
};

const emptyRecipient: RecipientDraft = { name: "", address: "", active: true };
const emptyDriver: DriverDraft = {
  name: "",
  hourly_cost: 0,
  can_drive: true,
  can_help: false,
  active: true,
};
const emptyVehicle: VehicleDraft = {
  name: "",
  plate: "",
  vehicle_kind: "veiculo",
  ownership_type: "terceiro",
  fuel_consumption_km_l: 0,
  wear_cost_per_km: 0,
  active: true,
};
const emptyService: ServiceDraft = { name: "", description: "", active: true };

async function postLogisticsAction(payload: LogisticsActionPayload) {
  const response = await fetch("/api/settings/logistics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const result = (await response.json().catch(() => ({}))) as LogisticsResponse;

  if (!response.ok) {
    throw new Error(result.error ?? "Não foi possível salvar os cadastros logísticos.");
  }
}

async function loadLogisticsData(): Promise<LogisticsData> {
  const response = await fetch("/api/settings/logistics", {
    headers: { Accept: "application/json" },
  });
  const loadedData = (await response.json().catch(() => ({}))) as LogisticsResponse;

  if (!response.ok) {
    throw new Error(loadedData.error ?? "Não foi possível carregar os cadastros logísticos.");
  }

  return {
    recipients: loadedData.recipients ?? [],
    drivers: loadedData.drivers ?? [],
    vehicles: loadedData.vehicles ?? [],
    settings: loadedData.settings ?? {
      company_id: "",
      fuel_price_per_liter: 0,
      updated_at: new Date(0).toISOString(),
    },
    serviceCatalog: loadedData.serviceCatalog ?? [],
  };
}

function recipientToDraft(recipient: LogisticsRecipient): RecipientDraft {
  return {
    name: accentDisplayText(recipient.name),
    address: accentDisplayText(recipient.address),
    active: recipient.active,
  };
}

function driverToDraft(driver: LogisticsDriver): DriverDraft {
  return {
    name: accentDisplayText(driver.name),
    hourly_cost: Number(driver.hourly_cost ?? 0),
    can_drive: driver.can_drive ?? true,
    can_help: driver.can_help ?? false,
    active: driver.active,
  };
}

function vehicleToDraft(vehicle: LogisticsVehicle): VehicleDraft {
  return {
    name: accentDisplayText(vehicle.name),
    plate: accentDisplayText(vehicle.plate),
    vehicle_kind: vehicle.vehicle_kind ?? "veiculo",
    ownership_type: vehicle.ownership_type ?? "terceiro",
    fuel_consumption_km_l: Number(vehicle.fuel_consumption_km_l ?? 0),
    wear_cost_per_km: Number(vehicle.wear_cost_per_km ?? 0),
    active: vehicle.active,
  };
}

function serviceToDraft(service: ExtraServiceCatalog): ServiceDraft {
  return {
    name: accentDisplayText(service.name),
    description: accentDisplayText(service.description),
    active: service.active,
  };
}

function ActiveCheckbox({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <label className="inline-flex items-center gap-2 text-sm font-medium text-charcoal">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 rounded border-border"
      />
      {label}
    </label>
  );
}

function IconButton({
  title,
  disabled,
  danger,
  onClick,
  children,
}: {
  title: string;
  disabled: boolean;
  danger?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={
        danger
          ? "grid size-9 place-items-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
          : "grid size-9 place-items-center rounded-md border border-border text-zinc-600 hover:border-orange-200 hover:text-accent disabled:opacity-60"
      }
    >
      {children}
    </button>
  );
}

export function LogisticsSettingsManager() {
  const resource = useAsyncResource<LogisticsData>("settings:logistics", loadLogisticsData);
  const data = resource.data;
  const loading = resource.loading && !data;
  const resourceError = resource.error
    ? toUserFriendlyErrorMessage(resource.error, "Não foi possível carregar os cadastros logísticos.")
    : null;
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newRecipient, setNewRecipient] = useState<RecipientDraft>(emptyRecipient);
  const [newDriver, setNewDriver] = useState<DriverDraft>(emptyDriver);
  const [newVehicle, setNewVehicle] = useState<VehicleDraft>(emptyVehicle);
  const [newService, setNewService] = useState<ServiceDraft>(emptyService);
  const [fuelPricePerLiter, setFuelPricePerLiter] = useState(0);
  const [recipientDrafts, setRecipientDrafts] = useState<Record<string, RecipientDraft>>({});
  const [driverDrafts, setDriverDrafts] = useState<Record<string, DriverDraft>>({});
  const [vehicleDrafts, setVehicleDrafts] = useState<Record<string, VehicleDraft>>({});
  const [serviceDrafts, setServiceDrafts] = useState<Record<string, ServiceDraft>>({});

  useEffect(() => {
    if (!data) return;

    const timeout = window.setTimeout(() => {
      setRecipientDrafts(
        Object.fromEntries(data.recipients.map((item) => [item.id, recipientToDraft(item)])),
      );
      setDriverDrafts(
        Object.fromEntries(data.drivers.map((item) => [item.id, driverToDraft(item)])),
      );
      setVehicleDrafts(
        Object.fromEntries(data.vehicles.map((item) => [item.id, vehicleToDraft(item)])),
      );
      setServiceDrafts(
        Object.fromEntries(data.serviceCatalog.map((item) => [item.id, serviceToDraft(item)])),
      );
      setFuelPricePerLiter(Number(data.settings.fuel_price_per_liter ?? 0));
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [data]);

  async function load() {
    setError(null);
    await resource.reload();
  }

  async function runMutation(action: () => Promise<void>, successMessage: string) {
    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await action();
      setMessage(successMessage);
      await load();
    } catch (mutationError) {
      setError(toUserFriendlyErrorMessage(mutationError, "Não foi possível salvar."));
    } finally {
      setSaving(false);
    }
  }

  async function createRecipient() {
    if (!newRecipient.name.trim() || !newRecipient.address.trim()) {
      setError("Informe o nome e o endereço do destinatário.");
      return;
    }

    await runMutation(async () => {
      await postLogisticsAction({ action: "createRecipient", ...newRecipient });
      setNewRecipient(emptyRecipient);
    }, "Destinatário criado.");
  }

  async function updateRecipient(recipientId: string) {
    const draft = recipientDrafts[recipientId];
    if (!draft?.name.trim() || !draft.address.trim()) {
      setError("Informe o nome e o endereço do destinatário.");
      return;
    }

    await runMutation(async () => {
      await postLogisticsAction({ action: "updateRecipient", id: recipientId, ...draft });
    }, "Destinatário atualizado.");
  }

  async function deleteRecipient(recipient: LogisticsRecipient) {
    if (!window.confirm(`Excluir o destinatário ${recipient.name}?`)) return;

    await runMutation(async () => {
      await postLogisticsAction({ action: "deleteRecipient", id: recipient.id });
    }, "Destinatário excluído.");
  }

  async function createDriver() {
    if (!newDriver.name.trim()) {
      setError("Informe o nome do motorista.");
      return;
    }

    await runMutation(async () => {
      await postLogisticsAction({ action: "createDriver", ...newDriver });
      setNewDriver(emptyDriver);
    }, "Motorista criado.");
  }

  async function updateDriver(driverId: string) {
    const draft = driverDrafts[driverId];
    if (!draft?.name.trim()) {
      setError("Informe o nome do motorista.");
      return;
    }

    await runMutation(async () => {
      await postLogisticsAction({ action: "updateDriver", id: driverId, ...draft });
    }, "Motorista atualizado.");
  }

  async function deleteDriver(driver: LogisticsDriver) {
    if (!window.confirm(`Excluir o motorista ${driver.name}?`)) return;

    await runMutation(async () => {
      await postLogisticsAction({ action: "deleteDriver", id: driver.id });
    }, "Motorista excluído.");
  }

  async function createVehicle() {
    if (!newVehicle.name.trim() || !newVehicle.plate.trim()) {
      setError("Informe o veículo e a placa.");
      return;
    }

    await runMutation(async () => {
      await postLogisticsAction({ action: "createVehicle", ...newVehicle });
      setNewVehicle(emptyVehicle);
    }, "Veículo criado.");
  }

  async function updateVehicle(vehicleId: string) {
    const draft = vehicleDrafts[vehicleId];
    if (!draft?.name.trim() || !draft.plate.trim()) {
      setError("Informe o veículo e a placa.");
      return;
    }

    await runMutation(async () => {
      await postLogisticsAction({ action: "updateVehicle", id: vehicleId, ...draft });
    }, "Veículo atualizado.");
  }

  async function deleteVehicle(vehicle: LogisticsVehicle) {
    if (!window.confirm(`Excluir o veículo ${vehicle.name}?`)) return;

    await runMutation(async () => {
      await postLogisticsAction({ action: "deleteVehicle", id: vehicle.id });
    }, "Veículo excluído.");
  }

  async function updateSettings() {
    await runMutation(async () => {
      await postLogisticsAction({
        action: "updateSettings",
        fuel_price_per_liter: fuelPricePerLiter,
      });
    }, "Configurações de logística atualizadas.");
  }

  async function createService() {
    if (!newService.name.trim() || !newService.description.trim()) {
      setError("Informe o nome e a descrição do serviço.");
      return;
    }

    await runMutation(async () => {
      await postLogisticsAction({ action: "createService", ...newService });
      setNewService(emptyService);
    }, "Serviço criado.");
  }

  async function updateService(serviceId: string) {
    const draft = serviceDrafts[serviceId];
    if (!draft?.name.trim() || !draft.description.trim()) {
      setError("Informe o nome e a descrição do serviço.");
      return;
    }

    await runMutation(async () => {
      await postLogisticsAction({ action: "updateService", id: serviceId, ...draft });
    }, "Serviço atualizado.");
  }

  async function deleteService(service: ExtraServiceCatalog) {
    if (!window.confirm(`Excluir o serviço ${service.name}?`)) return;

    await runMutation(async () => {
      await postLogisticsAction({ action: "deleteService", id: service.id });
    }, "Serviço excluído.");
  }

  if (loading) {
    return (
      <Panel>
        <PanelBody className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando cadastros logísticos...
        </PanelBody>
      </Panel>
    );
  }

  if (!data) {
    return (
      <Panel>
        <PanelBody>
          <EmptyState
            icon={AlertTriangle}
            title="Logística indisponível"
            description={error ?? resourceError ?? "Não foi possível carregar os cadastros logísticos."}
          />
        </PanelBody>
      </Panel>
    );
  }

  return (
    <div className="space-y-4">
      <FloatingMessage message={error ?? resourceError} />

      <FloatingMessage message={message} kind="success" />

      <Panel>
        <PanelHeader
          title="Custos globais de transporte"
          description="Parâmetros aplicados automaticamente aos veículos próprios."
        />
        <PanelBody>
          <div className="grid gap-3 sm:grid-cols-[220px_auto] sm:items-end">
            <Field label="Valor do combustível por litro">
              <input
                className={inputClass}
                type="number"
                min={0}
                step="0.01"
                value={fuelPricePerLiter}
                onChange={(event) => setFuelPricePerLiter(Number(event.target.value || 0))}
              />
            </Field>
            <button
              type="button"
              onClick={updateSettings}
              disabled={saving}
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500 disabled:opacity-60 sm:w-fit"
            >
              <Save className="size-4" />
              Salvar custos
            </button>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Esse valor é usado no cálculo de rotas com veículo próprio, junto com o consumo e o
            desgaste cadastrados em cada veículo.
          </p>
        </PanelBody>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title="Destinatários e locais"
            description="Fornecedores, clientes ou pontos fixos usados nos avulsos."
          />
          <PanelBody className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-charcoal">
                <MapPin className="size-4 text-accent" />
                Novo destinatário
              </div>
              <div className="grid gap-3">
                <Field label="Nome">
                  <input
                    className={inputClass}
                    value={newRecipient.name}
                    onChange={(event) =>
                      setNewRecipient((current) => ({ ...current, name: event.target.value }))
                    }
                  />
                </Field>
                <Field label="Endereço">
                  <input
                    className={inputClass}
                    value={newRecipient.address}
                    onChange={(event) =>
                      setNewRecipient((current) => ({ ...current, address: event.target.value }))
                    }
                  />
                </Field>
                <button
                  type="button"
                  onClick={createRecipient}
                  disabled={saving}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500 disabled:opacity-60"
                >
                  <Plus className="size-4" />
                  Criar destinatário
                </button>
              </div>
            </div>

            <div className="grid gap-3">
              {data.recipients.map((recipient) => {
                const draft = recipientDrafts[recipient.id] ?? recipientToDraft(recipient);

                return (
                  <article key={recipient.id} className="rounded-md border border-border bg-white p-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Nome">
                        <input
                          className={inputClass}
                          value={draft.name}
                          onChange={(event) =>
                            setRecipientDrafts((current) => ({
                              ...current,
                              [recipient.id]: { ...draft, name: event.target.value },
                            }))
                          }
                        />
                      </Field>
                      <Field label="Endereço">
                        <input
                          className={inputClass}
                          value={draft.address}
                          onChange={(event) =>
                            setRecipientDrafts((current) => ({
                              ...current,
                              [recipient.id]: { ...draft, address: event.target.value },
                            }))
                          }
                        />
                      </Field>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <ActiveCheckbox
                        checked={draft.active}
                        label="Ativo"
                        onChange={(active) =>
                          setRecipientDrafts((current) => ({
                            ...current,
                            [recipient.id]: { ...draft, active },
                          }))
                        }
                      />
                      <div className="flex gap-2">
                        <IconButton
                          title="Salvar destinatário"
                          disabled={saving}
                          onClick={() => updateRecipient(recipient.id)}
                        >
                          <Save className="size-4" />
                        </IconButton>
                        <IconButton
                          title="Excluir destinatário"
                          disabled={saving}
                          danger
                          onClick={() => deleteRecipient(recipient)}
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Serviços avulsos padrão"
            description="Descrições fechadas para solicitações avulsas."
          />
          <PanelBody className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-charcoal">
                <PackageCheck className="size-4 text-accent" />
                Novo serviço
              </div>
              <Field label="Nome">
                <input
                  className={inputClass}
                  value={newService.name}
                  onChange={(event) =>
                    setNewService((current) => ({ ...current, name: event.target.value }))
                  }
                />
              </Field>
              <Field label="Descrição" className="mt-3">
                <textarea
                  className={`${textareaClass} min-h-20`}
                  value={newService.description}
                  onChange={(event) =>
                    setNewService((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                />
              </Field>
              <button
                type="button"
                onClick={createService}
                disabled={saving}
                className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500 disabled:opacity-60"
              >
                <Plus className="size-4" />
                Criar serviço
              </button>
            </div>

            <div className="grid gap-3">
              {data.serviceCatalog.map((service) => {
                const draft = serviceDrafts[service.id] ?? serviceToDraft(service);

                return (
                  <article key={service.id} className="rounded-md border border-border bg-white p-3">
                    <Field label="Nome">
                      <input
                        className={inputClass}
                        value={draft.name}
                        onChange={(event) =>
                          setServiceDrafts((current) => ({
                            ...current,
                            [service.id]: { ...draft, name: event.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="Descrição" className="mt-3">
                      <textarea
                        className={`${textareaClass} min-h-20`}
                        value={draft.description}
                        onChange={(event) =>
                          setServiceDrafts((current) => ({
                            ...current,
                            [service.id]: { ...draft, description: event.target.value },
                          }))
                        }
                      />
                    </Field>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <ActiveCheckbox
                        checked={draft.active}
                        label="Ativo"
                        onChange={(active) =>
                          setServiceDrafts((current) => ({
                            ...current,
                            [service.id]: { ...draft, active },
                          }))
                        }
                      />
                      <div className="flex gap-2">
                        <IconButton
                          title="Salvar serviço"
                          disabled={saving}
                          onClick={() => updateService(service.id)}
                        >
                          <Save className="size-4" />
                        </IconButton>
                        <IconButton
                          title="Excluir serviço"
                          disabled={saving}
                          danger
                          onClick={() => deleteService(service)}
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Motoristas" description="Lista controlada para montagem das rotas." />
          <PanelBody className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-charcoal">
                <UserRound className="size-4 text-accent" />
                Novo motorista
              </div>
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_160px]">
                  <Field label="Nome">
                    <input
                      className={inputClass}
                      value={newDriver.name}
                      onChange={(event) =>
                        setNewDriver((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Custo hora">
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      step="0.01"
                      value={newDriver.hourly_cost}
                      onChange={(event) =>
                        setNewDriver((current) => ({
                          ...current,
                          hourly_cost: Number(event.target.value || 0),
                        }))
                      }
                    />
                  </Field>
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-4">
                    <ActiveCheckbox
                      checked={newDriver.can_drive}
                      label="Motorista"
                      onChange={(can_drive) =>
                        setNewDriver((current) => ({ ...current, can_drive }))
                      }
                    />
                    <ActiveCheckbox
                      checked={newDriver.can_help}
                      label="Ajudante"
                      onChange={(can_help) =>
                        setNewDriver((current) => ({ ...current, can_help }))
                      }
                    />
                  </div>
                  <button
                    type="button"
                    onClick={createDriver}
                    disabled={saving}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500 disabled:opacity-60"
                  >
                    <Plus className="size-4" />
                    Criar
                  </button>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {data.drivers.map((driver) => {
                const draft = driverDrafts[driver.id] ?? driverToDraft(driver);

                return (
                  <article key={driver.id} className="rounded-md border border-border bg-white p-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_140px]">
                      <Field label="Nome">
                        <input
                          className={inputClass}
                          value={draft.name}
                          onChange={(event) =>
                            setDriverDrafts((current) => ({
                              ...current,
                              [driver.id]: { ...draft, name: event.target.value },
                            }))
                          }
                        />
                      </Field>
                      <Field label="Custo hora">
                        <input
                          className={inputClass}
                          type="number"
                          min={0}
                          step="0.01"
                          value={draft.hourly_cost}
                          onChange={(event) =>
                            setDriverDrafts((current) => ({
                              ...current,
                              [driver.id]: {
                                ...draft,
                                hourly_cost: Number(event.target.value || 0),
                              },
                            }))
                          }
                        />
                      </Field>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap gap-4">
                        <ActiveCheckbox
                          checked={draft.active}
                          label="Ativo"
                          onChange={(active) =>
                            setDriverDrafts((current) => ({
                              ...current,
                              [driver.id]: { ...draft, active },
                            }))
                          }
                        />
                        <ActiveCheckbox
                          checked={draft.can_drive}
                          label="Motorista"
                          onChange={(can_drive) =>
                            setDriverDrafts((current) => ({
                              ...current,
                              [driver.id]: { ...draft, can_drive },
                            }))
                          }
                        />
                        <ActiveCheckbox
                          checked={draft.can_help}
                          label="Ajudante"
                          onChange={(can_help) =>
                            setDriverDrafts((current) => ({
                              ...current,
                              [driver.id]: { ...draft, can_help },
                            }))
                          }
                        />
                      </div>
                      <div className="flex gap-2">
                        <IconButton
                          title="Salvar motorista"
                          disabled={saving}
                          onClick={() => updateDriver(driver.id)}
                        >
                          <Save className="size-4" />
                        </IconButton>
                        <IconButton
                          title="Excluir motorista"
                          disabled={saving}
                          danger
                          onClick={() => deleteDriver(driver)}
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader title="Veículos" description="Veículos e placas disponíveis para rotas." />
          <PanelBody className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-charcoal">
                <Truck className="size-4 text-accent" />
                Novo veículo
              </div>
              <div className="grid gap-3">
                <div className="grid gap-3 sm:grid-cols-[1fr_130px_150px_150px]">
                  <Field label="Veículo">
                    <input
                      className={inputClass}
                      value={newVehicle.name}
                      onChange={(event) =>
                        setNewVehicle((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Placa">
                    <input
                      className={inputClass}
                      value={newVehicle.plate}
                      onChange={(event) =>
                        setNewVehicle((current) => ({ ...current, plate: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Categoria">
                    <select
                      className={inputClass}
                      value={newVehicle.vehicle_kind}
                      onChange={(event) =>
                        setNewVehicle((current) => {
                          const vehicleKind = event.target.value as "veiculo" | "carretinha";
                          return {
                            ...current,
                            vehicle_kind: vehicleKind,
                            ownership_type:
                              vehicleKind === "carretinha" ? "proprio" : current.ownership_type,
                            fuel_consumption_km_l:
                              vehicleKind === "carretinha" ? 0 : current.fuel_consumption_km_l,
                          };
                        })
                      }
                    >
                      <option value="veiculo">Veículo</option>
                      <option value="carretinha">Carretinha</option>
                    </select>
                  </Field>
                  <Field label="Tipo">
                    <select
                      className={inputClass}
                      value={newVehicle.ownership_type}
                      disabled={newVehicle.vehicle_kind === "carretinha"}
                      onChange={(event) =>
                        setNewVehicle((current) => ({
                          ...current,
                          ownership_type: event.target.value as "proprio" | "terceiro",
                        }))
                      }
                    >
                      <option value="terceiro">Terceiro</option>
                      <option value="proprio">Próprio</option>
                    </select>
                  </Field>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {newVehicle.vehicle_kind === "veiculo" ? (
                    <Field label="Consumo km/l">
                      <input
                        className={inputClass}
                        type="number"
                        min={0}
                        step="0.01"
                        value={newVehicle.fuel_consumption_km_l}
                        onChange={(event) =>
                          setNewVehicle((current) => ({
                            ...current,
                            fuel_consumption_km_l: Number(event.target.value || 0),
                          }))
                        }
                      />
                    </Field>
                  ) : null}
                  <Field label="Desgaste por km">
                    <input
                      className={inputClass}
                      type="number"
                      min={0}
                      step="0.01"
                      value={newVehicle.wear_cost_per_km}
                      onChange={(event) =>
                        setNewVehicle((current) => ({
                          ...current,
                          wear_cost_per_km: Number(event.target.value || 0),
                        }))
                      }
                    />
                  </Field>
                </div>
                <button
                  type="button"
                  onClick={createVehicle}
                  disabled={saving}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500 disabled:opacity-60"
                >
                  <Plus className="size-4" />
                  Criar
                </button>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              {data.vehicles.map((vehicle) => {
                const draft = vehicleDrafts[vehicle.id] ?? vehicleToDraft(vehicle);

                return (
                  <article key={vehicle.id} className="rounded-md border border-border bg-white p-3">
                    <div className="grid gap-3 sm:grid-cols-[1fr_120px_150px_140px]">
                      <Field label="Veículo">
                        <input
                          className={inputClass}
                          value={draft.name}
                          onChange={(event) =>
                            setVehicleDrafts((current) => ({
                              ...current,
                              [vehicle.id]: { ...draft, name: event.target.value },
                            }))
                          }
                        />
                      </Field>
                      <Field label="Placa">
                        <input
                          className={inputClass}
                          value={draft.plate}
                          onChange={(event) =>
                            setVehicleDrafts((current) => ({
                              ...current,
                              [vehicle.id]: { ...draft, plate: event.target.value },
                            }))
                          }
                        />
                      </Field>
                      <Field label="Categoria">
                        <select
                          className={inputClass}
                          value={draft.vehicle_kind}
                          onChange={(event) =>
                            setVehicleDrafts((current) => {
                              const vehicleKind = event.target.value as "veiculo" | "carretinha";
                              return {
                                ...current,
                                [vehicle.id]: {
                                  ...draft,
                                  vehicle_kind: vehicleKind,
                                  ownership_type:
                                    vehicleKind === "carretinha"
                                      ? "proprio"
                                      : draft.ownership_type,
                                  fuel_consumption_km_l:
                                    vehicleKind === "carretinha"
                                      ? 0
                                      : draft.fuel_consumption_km_l,
                                },
                              };
                            })
                          }
                        >
                          <option value="veiculo">Veículo</option>
                          <option value="carretinha">Carretinha</option>
                        </select>
                      </Field>
                      <Field label="Tipo">
                        <select
                          className={inputClass}
                          value={draft.ownership_type}
                          disabled={draft.vehicle_kind === "carretinha"}
                          onChange={(event) =>
                            setVehicleDrafts((current) => ({
                              ...current,
                              [vehicle.id]: {
                                ...draft,
                                ownership_type: event.target.value as "proprio" | "terceiro",
                              },
                            }))
                          }
                        >
                          <option value="terceiro">Terceiro</option>
                          <option value="proprio">Próprio</option>
                        </select>
                      </Field>
                    </div>
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      {draft.vehicle_kind === "veiculo" ? (
                        <Field label="Consumo km/l">
                          <input
                            className={inputClass}
                            type="number"
                            min={0}
                            step="0.01"
                            value={draft.fuel_consumption_km_l}
                            onChange={(event) =>
                              setVehicleDrafts((current) => ({
                                ...current,
                                [vehicle.id]: {
                                  ...draft,
                                  fuel_consumption_km_l: Number(event.target.value || 0),
                                },
                              }))
                            }
                          />
                        </Field>
                      ) : null}
                      <Field label="Desgaste por km">
                        <input
                          className={inputClass}
                          type="number"
                          min={0}
                          step="0.01"
                          value={draft.wear_cost_per_km}
                          onChange={(event) =>
                            setVehicleDrafts((current) => ({
                              ...current,
                              [vehicle.id]: {
                                ...draft,
                                wear_cost_per_km: Number(event.target.value || 0),
                              },
                            }))
                          }
                        />
                      </Field>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <ActiveCheckbox
                        checked={draft.active}
                        label="Ativo"
                        onChange={(active) =>
                          setVehicleDrafts((current) => ({
                            ...current,
                            [vehicle.id]: { ...draft, active },
                          }))
                        }
                      />
                      <div className="flex gap-2">
                        <IconButton
                          title="Salvar veículo"
                          disabled={saving}
                          onClick={() => updateVehicle(vehicle.id)}
                        >
                          <Save className="size-4" />
                        </IconButton>
                        <IconButton
                          title="Excluir veículo"
                          disabled={saving}
                          danger
                          onClick={() => deleteVehicle(vehicle)}
                        >
                          <Trash2 className="size-4" />
                        </IconButton>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
