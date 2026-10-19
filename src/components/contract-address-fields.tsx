"use client";

import { useEffect, useState } from "react";
import { Field, inputClass } from "@/components/action-form";
import { BRAZILIAN_STATES } from "@/lib/brazil-locations";

type IbgeCity = {
  nome: string;
};

type ContractAddressFieldsProps = {
  defaults?: {
    street?: string | null;
    sector?: string | null;
    block?: string | null;
    lot?: string | null;
    state?: string | null;
    city?: string | null;
  };
};

export function ContractAddressFields({ defaults }: ContractAddressFieldsProps) {
  const [stateCode, setStateCode] = useState(defaults?.state ?? "");
  const [city, setCity] = useState(defaults?.city ?? "");
  const [cities, setCities] = useState<string[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  const [cityError, setCityError] = useState<string | null>(null);

  function handleStateChange(nextStateCode: string) {
    setStateCode(nextStateCode);
    setCity("");
    setCities([]);
    setCityError(null);
    setLoadingCities(Boolean(nextStateCode));
  }

  useEffect(() => {
    if (!stateCode) return;

    const controller = new AbortController();

    async function loadCities() {
      try {
        const response = await fetch(
          `https://servicodados.ibge.gov.br/api/v1/localidades/estados/${stateCode}/municipios?orderBy=nome`,
          { signal: controller.signal },
        );

        if (!response.ok) {
          throw new Error("Não foi possível carregar as cidades.");
        }

        const data = (await response.json()) as IbgeCity[];
        setCities(data.map((item) => item.nome));
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setCityError("Não foi possível carregar as cidades deste estado.");
      } finally {
        setLoadingCities(false);
      }
    }

    void loadCities();

    return () => controller.abort();
  }, [stateCode]);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Rua">
          <input name="street" className={inputClass} defaultValue={defaults?.street ?? ""} required />
        </Field>
        <Field label="Setor">
          <input name="sector" className={inputClass} defaultValue={defaults?.sector ?? ""} required />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Quadra">
          <input name="block" className={inputClass} defaultValue={defaults?.block ?? ""} required />
        </Field>
        <Field label="Lote">
          <input name="lot" className={inputClass} defaultValue={defaults?.lot ?? ""} required />
        </Field>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Estado">
          <select
            name="state"
            value={stateCode}
            onChange={(event) => handleStateChange(event.target.value)}
            className={inputClass}
            required
          >
            <option value="">Selecione</option>
            {BRAZILIAN_STATES.map((state) => (
              <option key={state.code} value={state.code}>
                {state.name} - {state.code}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Cidade">
          <select
            name="city"
            value={city}
            onChange={(event) => setCity(event.target.value)}
            className={inputClass}
            disabled={!stateCode || loadingCities || Boolean(cityError)}
            required
          >
            <option value="">
              {!stateCode
                ? "Selecione o estado"
                : loadingCities
                  ? "Carregando cidades..."
                  : cityError
                    ? "Cidades indisponíveis"
                    : "Selecione"}
            </option>
            {cities.map((cityName) => (
              <option key={cityName} value={cityName}>
                {cityName}
              </option>
            ))}
            {city && !cities.includes(city) ? <option value={city}>{city}</option> : null}
          </select>
          {cityError ? <span className="text-xs font-medium text-danger">{cityError}</span> : null}
        </Field>
      </div>
    </div>
  );
}
