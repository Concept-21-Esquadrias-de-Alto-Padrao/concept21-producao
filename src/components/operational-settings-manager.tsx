"use client";

import {
  AlertTriangle,
  Loader2,
  MapPin,
  Plus,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  UsersRound,
  Workflow,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Field, inputClass, textareaClass } from "@/components/action-form";
import { EmptyState } from "@/components/empty-state";
import { Panel, PanelBody, PanelHeader } from "@/components/panel";
import { useAsyncResource } from "@/hooks/use-async-resource";
import { toUserFriendlyErrorMessage } from "@/lib/errors";
import { MATERIAL_GROUPS, type Department, type ProductionStage, type StorageLocation } from "@/lib/types";
import { accentDisplayText } from "@/lib/utils";

type OperationalData = {
  departments: Department[];
  stages: ProductionStage[];
  storageLocations: StorageLocation[];
};

type OperationalSettingsSection = "all" | "registries" | "stages";

type OperationalResponse = Partial<OperationalData> & {
  error?: string;
};

type StageDraft = {
  name: string;
  description: string;
  sortOrder: string;
  requiredPermission: string;
  active: boolean;
};

type DepartmentDraft = {
  name: string;
  active: boolean;
};

type LocationDraft = {
  name: string;
  code: string;
  type: string;
  materialGroup: string;
  description: string;
  active: boolean;
};

type OperationalActionPayload =
  | { action: "createDepartment"; name: string; active: boolean }
  | { action: "updateDepartment"; id: string; name: string; active: boolean }
  | { action: "deleteDepartment"; id: string }
  | {
      action: "createStage";
      name: string;
      description: string;
      sortOrder: string;
      requiredPermission: string;
      active: boolean;
    }
  | {
      action: "updateStage";
      id: string;
      name: string;
      description: string;
      sortOrder: string;
      requiredPermission: string;
      active: boolean;
    }
  | { action: "deleteStage"; id: string }
  | {
      action: "createLocation";
      name: string;
      code: string;
      type: string;
      materialGroup: string;
      description: string;
      active: boolean;
    }
  | {
      action: "updateLocation";
      id: string;
      name: string;
      code: string;
      type: string;
      materialGroup: string;
      description: string;
      active: boolean;
    }
  | { action: "deleteLocation"; id: string };

const emptyStageDraft: StageDraft = {
  name: "",
  description: "",
  sortOrder: "1",
  requiredPermission: "",
  active: true,
};

const emptyDepartmentDraft: DepartmentDraft = {
  name: "",
  active: true,
};

const emptyLocationDraft: LocationDraft = {
  name: "",
  code: "",
  type: "",
  materialGroup: "",
  description: "",
  active: true,
};

async function postOperationalAction(payload: OperationalActionPayload) {
  const response = await fetch("/api/settings/operational", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const result = (await response.json().catch(() => ({}))) as OperationalResponse;

  if (!response.ok) {
    throw new Error(result.error ?? "Não foi possível salvar as configurações operacionais.");
  }
}

async function loadOperationalData(): Promise<OperationalData> {
  const response = await fetch("/api/settings/operational", {
    headers: {
      Accept: "application/json",
    },
  });
  const loadedData = (await response.json().catch(() => ({}))) as OperationalResponse;

  if (!response.ok) {
    throw new Error(loadedData.error ?? "Não foi possível carregar os cadastros operacionais.");
  }

  return {
    departments: loadedData.departments ?? [],
    stages: loadedData.stages ?? [],
    storageLocations: loadedData.storageLocations ?? [],
  };
}

function stageToDraft(stage: ProductionStage): StageDraft {
  return {
    name: accentDisplayText(stage.name),
    description: accentDisplayText(stage.description ?? ""),
    sortOrder: String(stage.sort_order),
    requiredPermission: stage.required_permission ?? "",
    active: stage.active,
  };
}

function departmentToDraft(department: Department): DepartmentDraft {
  return {
    name: accentDisplayText(department.name),
    active: department.active,
  };
}

function locationToDraft(location: StorageLocation): LocationDraft {
  return {
    name: accentDisplayText(location.name),
    code: accentDisplayText(location.code ?? ""),
    type: accentDisplayText(location.type),
    materialGroup: location.material_group ?? "",
    description: accentDisplayText(location.description ?? ""),
    active: location.active,
  };
}

function nextStageOrder(stages: ProductionStage[]) {
  const maxOrder = Math.max(0, ...stages.map((stage) => stage.sort_order));
  return String(maxOrder + 1);
}

export function OperationalSettingsManager({
  section = "all",
}: {
  section?: OperationalSettingsSection;
}) {
  const resource = useAsyncResource<OperationalData>("settings:operational", loadOperationalData);
  const data = resource.data;
  const loading = resource.loading && !data;
  const resourceError = resource.error
    ? toUserFriendlyErrorMessage(resource.error, "Não foi possível carregar os cadastros operacionais.")
    : null;
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newStage, setNewStage] = useState<StageDraft>(emptyStageDraft);
  const [newDepartment, setNewDepartment] = useState<DepartmentDraft>(emptyDepartmentDraft);
  const [newLocation, setNewLocation] = useState<LocationDraft>(emptyLocationDraft);
  const [stageDrafts, setStageDrafts] = useState<Record<string, StageDraft>>({});
  const [departmentDrafts, setDepartmentDrafts] = useState<Record<string, DepartmentDraft>>({});
  const [locationDrafts, setLocationDrafts] = useState<Record<string, LocationDraft>>({});

  useEffect(() => {
    if (!data) return;

    const timeout = window.setTimeout(() => {
      setStageDrafts(
        Object.fromEntries(data.stages.map((stage) => [stage.id, stageToDraft(stage)])),
      );
      setDepartmentDrafts(
        Object.fromEntries(
          data.departments.map((department) => [
            department.id,
            departmentToDraft(department),
          ]),
        ),
      );
      setLocationDrafts(
        Object.fromEntries(
          data.storageLocations.map((location) => [location.id, locationToDraft(location)]),
        ),
      );
      setNewStage((current) => ({
        ...current,
        sortOrder: current.sortOrder || nextStageOrder(data.stages),
      }));
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

  async function createStage() {
    if (!newStage.name.trim()) {
      setError("Informe o nome da etapa.");
      return;
    }

    await runMutation(async () => {
      await postOperationalAction({ action: "createStage", ...newStage });
      setNewStage({ ...emptyStageDraft, sortOrder: nextStageOrder(data?.stages ?? []) });
    }, "Etapa criada.");
  }

  async function updateStage(stageId: string) {
    const draft = stageDrafts[stageId];
    if (!draft?.name.trim()) {
      setError("Informe o nome da etapa.");
      return;
    }

    await runMutation(async () => {
      await postOperationalAction({ action: "updateStage", id: stageId, ...draft });
    }, "Etapa atualizada.");
  }

  async function deleteStage(stage: ProductionStage) {
    if (!window.confirm(`Excluir a etapa ${stage.name}?`)) return;

    await runMutation(async () => {
      await postOperationalAction({ action: "deleteStage", id: stage.id });
    }, "Etapa excluída.");
  }

  async function createDepartment() {
    if (!newDepartment.name.trim()) {
      setError("Informe o nome do departamento.");
      return;
    }

    await runMutation(async () => {
      await postOperationalAction({ action: "createDepartment", ...newDepartment });
      setNewDepartment(emptyDepartmentDraft);
    }, "Departamento criado.");
  }

  async function updateDepartment(departmentId: string) {
    const draft = departmentDrafts[departmentId];
    if (!draft?.name.trim()) {
      setError("Informe o nome do departamento.");
      return;
    }

    await runMutation(async () => {
      await postOperationalAction({ action: "updateDepartment", id: departmentId, ...draft });
    }, "Departamento atualizado.");
  }

  async function deleteDepartment(department: Department) {
    if (!window.confirm(`Excluir o departamento ${department.name}?`)) return;

    await runMutation(async () => {
      await postOperationalAction({ action: "deleteDepartment", id: department.id });
    }, "Departamento excluído.");
  }

  async function createLocation() {
    if (!newLocation.name.trim() || !newLocation.type.trim()) {
      setError("Informe o nome e o tipo da localização.");
      return;
    }

    await runMutation(async () => {
      await postOperationalAction({ action: "createLocation", ...newLocation });
      setNewLocation(emptyLocationDraft);
    }, "Localização criada.");
  }

  async function updateLocation(locationId: string) {
    const draft = locationDrafts[locationId];
    if (!draft?.name.trim() || !draft.type.trim()) {
      setError("Informe o nome e o tipo da localização.");
      return;
    }

    await runMutation(async () => {
      await postOperationalAction({ action: "updateLocation", id: locationId, ...draft });
    }, "Localização atualizada.");
  }

  async function deleteLocation(location: StorageLocation) {
    if (!window.confirm(`Excluir a localização ${location.name}?`)) return;

    await runMutation(async () => {
      await postOperationalAction({ action: "deleteLocation", id: location.id });
    }, "Localização excluída.");
  }

  if (loading) {
    return (
      <Panel>
        <PanelBody className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Carregando cadastros operacionais...
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
            title="Configurações indisponíveis"
            description={error ?? resourceError ?? "Não foi possível carregar os cadastros operacionais."}
          />
        </PanelBody>
      </Panel>
    );
  }

  const showStages = section === "all" || section === "stages";
  const showRegistries = section === "all" || section === "registries";

  return (
    <div className="space-y-4">
      {error || resourceError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error ?? resourceError}
        </div>
      ) : null}

      {message ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          {message}
        </div>
      ) : null}

      <div className={showStages && showRegistries ? "grid gap-4 xl:grid-cols-3" : "grid gap-4"}>
        {showStages ? (
        <Panel className={showRegistries ? "xl:col-span-1" : undefined}>
          <PanelHeader
            title="Etapas configuráveis"
            description="Fluxo macro de produção e permissões exigidas por etapa."
          />
          <PanelBody className="space-y-4">
            <div className="rounded-md border border-border bg-muted/30 p-3">
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-charcoal">
                <Workflow className="size-4 text-accent" />
                Nova etapa
              </div>
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-[96px_1fr]">
                  <Field label="Ordem">
                    <input
                      className={inputClass}
                      value={newStage.sortOrder}
                      onChange={(event) =>
                        setNewStage((current) => ({
                          ...current,
                          sortOrder: event.target.value,
                        }))
                      }
                      inputMode="numeric"
                    />
                  </Field>
                  <Field label="Nome">
                    <input
                      className={inputClass}
                      value={newStage.name}
                      onChange={(event) =>
                        setNewStage((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </Field>
                </div>
                <Field label="Descrição">
                  <textarea
                    className={`${textareaClass} min-h-20`}
                    value={newStage.description}
                    onChange={(event) =>
                      setNewStage((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </Field>
                <Field label="Permissão exigida">
                  <input
                    className={inputClass}
                    value={newStage.requiredPermission}
                    onChange={(event) =>
                      setNewStage((current) => ({
                        ...current,
                        requiredPermission: event.target.value,
                      }))
                    }
                    placeholder="production.stage.permission"
                  />
                </Field>
                <button
                  type="button"
                  onClick={createStage}
                  disabled={saving}
                  className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500 disabled:opacity-60"
                >
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
                  Criar etapa
                </button>
              </div>
            </div>

            <div className="space-y-3">
              {data.stages.map((stage) => {
                const draft = stageDrafts[stage.id] ?? stageToDraft(stage);

                return (
                  <article key={stage.id} className="rounded-md border border-border bg-white p-3">
                    <div className="grid gap-3 sm:grid-cols-[84px_1fr]">
                      <Field label="Ordem">
                        <input
                          className={inputClass}
                          value={draft.sortOrder}
                          onChange={(event) =>
                            setStageDrafts((current) => ({
                              ...current,
                              [stage.id]: { ...draft, sortOrder: event.target.value },
                            }))
                          }
                          inputMode="numeric"
                        />
                      </Field>
                      <Field label="Nome">
                        <input
                          className={inputClass}
                          value={draft.name}
                          onChange={(event) =>
                            setStageDrafts((current) => ({
                              ...current,
                              [stage.id]: { ...draft, name: event.target.value },
                            }))
                          }
                        />
                      </Field>
                    </div>
                    <Field label="Descrição" className="mt-3">
                      <textarea
                        className={`${textareaClass} min-h-20`}
                        value={draft.description}
                        onChange={(event) =>
                          setStageDrafts((current) => ({
                            ...current,
                            [stage.id]: { ...draft, description: event.target.value },
                          }))
                        }
                      />
                    </Field>
                    <Field label="Permissão exigida" className="mt-3">
                      <input
                        className={inputClass}
                        value={draft.requiredPermission}
                        onChange={(event) =>
                          setStageDrafts((current) => ({
                            ...current,
                            [stage.id]: { ...draft, requiredPermission: event.target.value },
                          }))
                        }
                      />
                    </Field>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <label className="inline-flex items-center gap-2 text-sm font-medium text-charcoal">
                        <input
                          type="checkbox"
                          checked={draft.active}
                          onChange={(event) =>
                            setStageDrafts((current) => ({
                              ...current,
                              [stage.id]: { ...draft, active: event.target.checked },
                            }))
                          }
                          className="size-4 rounded border-border"
                        />
                        Ativa
                      </label>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          onClick={() => updateStage(stage.id)}
                          disabled={saving}
                          className="grid size-9 place-items-center rounded-md border border-border text-zinc-600 hover:border-orange-200 hover:text-accent disabled:opacity-60"
                          title="Salvar etapa"
                        >
                          <Save className="size-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteStage(stage)}
                          disabled={saving}
                          className="grid size-9 place-items-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
                          title="Excluir etapa"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          </PanelBody>
        </Panel>
        ) : null}

        {showRegistries ? (
        <Panel className={showStages ? "xl:col-span-2" : undefined}>
          <PanelHeader
            title="Cadastros operacionais"
            description="Departamentos, localizações e listas de apoio usadas no fluxo de PROD."
          />
          <PanelBody className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                <UsersRound className="size-4 text-accent" />
                Departamentos
              </div>

              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                  <input
                    className={inputClass}
                    value={newDepartment.name}
                    onChange={(event) =>
                      setNewDepartment((current) => ({ ...current, name: event.target.value }))
                    }
                    placeholder="Novo departamento"
                  />
                  <button
                    type="button"
                    onClick={createDepartment}
                    disabled={saving}
                    className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500 disabled:opacity-60"
                  >
                    <Plus className="size-4" />
                    Criar
                  </button>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                {data.departments.map((department) => {
                  const draft = departmentDrafts[department.id] ?? departmentToDraft(department);

                  return (
                    <article key={department.id} className="rounded-md border border-border bg-white p-3">
                      <Field label="Nome">
                        <input
                          className={inputClass}
                          value={draft.name}
                          onChange={(event) =>
                            setDepartmentDrafts((current) => ({
                              ...current,
                              [department.id]: { ...draft, name: event.target.value },
                            }))
                          }
                        />
                      </Field>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-charcoal">
                          <input
                            type="checkbox"
                            checked={draft.active}
                            onChange={(event) =>
                              setDepartmentDrafts((current) => ({
                                ...current,
                                [department.id]: { ...draft, active: event.target.checked },
                              }))
                            }
                            className="size-4 rounded border-border"
                          />
                          Ativo
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateDepartment(department.id)}
                            disabled={saving}
                            className="grid size-9 place-items-center rounded-md border border-border text-zinc-600 hover:border-orange-200 hover:text-accent disabled:opacity-60"
                            title="Salvar departamento"
                          >
                            <Save className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteDepartment(department)}
                            disabled={saving}
                            className="grid size-9 place-items-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
                            title="Excluir departamento"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                <MapPin className="size-4 text-accent" />
                Localizações
              </div>

              <div className="rounded-md border border-border bg-muted/30 p-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Nome">
                    <input
                      className={inputClass}
                      value={newLocation.name}
                      onChange={(event) =>
                        setNewLocation((current) => ({ ...current, name: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Código">
                    <input
                      className={inputClass}
                      value={newLocation.code}
                      onChange={(event) =>
                        setNewLocation((current) => ({ ...current, code: event.target.value }))
                      }
                    />
                  </Field>
                  <Field label="Tipo">
                    <input
                      className={inputClass}
                      value={newLocation.type}
                      onChange={(event) =>
                        setNewLocation((current) => ({ ...current, type: event.target.value }))
                      }
                      placeholder="cavalete, gaveta, prateleira"
                    />
                  </Field>
                  <Field label="Grupo">
                    <select
                      className={inputClass}
                      value={newLocation.materialGroup}
                      onChange={(event) =>
                        setNewLocation((current) => ({
                          ...current,
                          materialGroup: event.target.value,
                        }))
                      }
                    >
                      <option value="">Sem grupo</option>
                      {MATERIAL_GROUPS.map((group) => (
                        <option key={group} value={group}>
                          {group}
                        </option>
                      ))}
                    </select>
                  </Field>
                </div>
                <Field label="Descrição" className="mt-3">
                  <textarea
                    className={`${textareaClass} min-h-20`}
                    value={newLocation.description}
                    onChange={(event) =>
                      setNewLocation((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                  />
                </Field>
                <button
                  type="button"
                  onClick={createLocation}
                  disabled={saving}
                  className="mt-3 inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground hover:bg-orange-500 disabled:opacity-60"
                >
                  <Plus className="size-4" />
                  Criar localização
                </button>
              </div>

              <div className="grid gap-3">
                {data.storageLocations.map((location) => {
                  const draft = locationDrafts[location.id] ?? locationToDraft(location);

                  return (
                    <article key={location.id} className="rounded-md border border-border bg-white p-3">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Nome">
                          <input
                            className={inputClass}
                            value={draft.name}
                            onChange={(event) =>
                              setLocationDrafts((current) => ({
                                ...current,
                                [location.id]: { ...draft, name: event.target.value },
                              }))
                            }
                          />
                        </Field>
                        <Field label="Código">
                          <input
                            className={inputClass}
                            value={draft.code}
                            onChange={(event) =>
                              setLocationDrafts((current) => ({
                                ...current,
                                [location.id]: { ...draft, code: event.target.value },
                              }))
                            }
                          />
                        </Field>
                        <Field label="Tipo">
                          <input
                            className={inputClass}
                            value={draft.type}
                            onChange={(event) =>
                              setLocationDrafts((current) => ({
                                ...current,
                                [location.id]: { ...draft, type: event.target.value },
                              }))
                            }
                          />
                        </Field>
                        <Field label="Grupo">
                          <select
                            className={inputClass}
                            value={draft.materialGroup}
                            onChange={(event) =>
                              setLocationDrafts((current) => ({
                                ...current,
                                [location.id]: { ...draft, materialGroup: event.target.value },
                              }))
                            }
                          >
                            <option value="">Sem grupo</option>
                            {MATERIAL_GROUPS.map((group) => (
                              <option key={group} value={group}>
                                {group}
                              </option>
                            ))}
                          </select>
                        </Field>
                      </div>
                      <Field label="Descrição" className="mt-3">
                        <textarea
                          className={`${textareaClass} min-h-20`}
                          value={draft.description}
                          onChange={(event) =>
                            setLocationDrafts((current) => ({
                              ...current,
                              [location.id]: { ...draft, description: event.target.value },
                            }))
                          }
                        />
                      </Field>
                      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                        <label className="inline-flex items-center gap-2 text-sm font-medium text-charcoal">
                          <input
                            type="checkbox"
                            checked={draft.active}
                            onChange={(event) =>
                              setLocationDrafts((current) => ({
                                ...current,
                                [location.id]: { ...draft, active: event.target.checked },
                              }))
                            }
                            className="size-4 rounded border-border"
                          />
                          Ativa
                        </label>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => updateLocation(location.id)}
                            disabled={saving}
                            className="grid size-9 place-items-center rounded-md border border-border text-zinc-600 hover:border-orange-200 hover:text-accent disabled:opacity-60"
                            title="Salvar localização"
                          >
                            <Save className="size-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteLocation(location)}
                            disabled={saving}
                            className="grid size-9 place-items-center rounded-md border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
                            title="Excluir localização"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3 lg:col-span-2">
              <div className="flex items-center gap-2 text-sm font-semibold text-charcoal">
                <SlidersHorizontal className="size-4 text-accent" />
                Governança
              </div>
              <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 size-4" />
                  <p>
                    Cadastros recém-confirmados entram como restritos. A liberação acontece em
                    Segurança e Acessos, vinculando o usuário a um perfil ativo.
                  </p>
                </div>
              </div>
            </div>
          </PanelBody>
        </Panel>
        ) : null}
      </div>
    </div>
  );
}
