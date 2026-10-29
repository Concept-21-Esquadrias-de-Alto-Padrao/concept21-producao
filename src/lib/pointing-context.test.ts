import { describe, expect, it } from "vitest";
import { isActivePointingContract, projectPointingClient, projectPointingContract } from "./pointing-context";

const contract = {
  id: "contract-1",
  client_id: "client-1",
  contract_number: "26-0810",
  work_name: "Obra",
  full_address: "Rua A",
  street: "Rua A",
  block: null,
  lot: null,
  sector: null,
  city: "Goiânia",
  state: "GO",
  site_contact: "Responsável",
  lifecycle: { archived_at: null },
  notes: "informação interna",
  integration_metadata: { secret: true },
};

describe("contexto restrito da fila de apontamentos", () => {
  it("envia só os campos necessários à fila e ao romaneio", () => {
    expect(projectPointingContract(contract)).toEqual({
      id: "contract-1", client_id: "client-1", contract_number: "26-0810",
      work_name: "Obra", full_address: "Rua A", street: "Rua A",
      block: null, lot: null, sector: null, city: "Goiânia", state: "GO",
      site_contact: "Responsável",
    });
    expect(projectPointingClient({
      id: "client-1", name: "Cliente", phone: "62999999999",
      document: "não expor", email: "não expor", notes: "não expor",
    } as Parameters<typeof projectPointingClient>[0])).toEqual({
      id: "client-1", name: "Cliente", phone: "62999999999",
    });
  });

  it("não inclui contrato arquivado na fila", () => {
    expect(isActivePointingContract(contract)).toBe(true);
    expect(isActivePointingContract({ ...contract, lifecycle: [{ archived_at: "2026-10-29T12:00:00Z" }] })).toBe(false);
  });
});
