import { describe, expect, it } from "vitest";
import { parseContractScopeItems, reconcileContractScope, type ContractScopeRevision } from "./contract-scope";
import type { ProductionPiece, ProductionProd } from "./types";

const revision: ContractScopeRevision = {
  id: "revision", contract_id: "contract", revision_number: 1,
  source_kind: "tecnico_integral", source_reference: "X:/Contratos/26-0810/Desenho.pdf",
  source_revision: null, created_at: "2026-10-23T00:00:00Z",
  items: parseContractScopeItems("J01;1\nJ02;1\nP06;1\nP07;1"),
};
const prods = [{ id: "prod-1" }] as ProductionProd[];
const pieces = ["J01", "J02", "P06", "P07"].map((piece_code, index) => ({
  id: String(index), prod_id: "prod-1", piece_code, quantity: 1,
  import_batch_id: "import-1", released_to_production: true,
})) as ProductionPiece[];

describe("conciliação do escopo integral", () => {
  it("compara os quatro itens da obra 26-0810 por código e quantidade, sem comparar medidas de fabricação", () => {
    expect(reconcileContractScope(revision, prods, pieces).status).toBe("completo");
  });
  it("não considera proposta ou obra sem PROD uma liberação integral", () => {
    expect(reconcileContractScope({ ...revision, source_kind: "proposta" }, prods, pieces).status).toBe("pendente");
    expect(reconcileContractScope(revision, [], []).status).toBe("pendente");
    expect(reconcileContractScope(null, prods, pieces).status).toBe("sem_base");
  });
  it("detecta peça faltante, extra e divergência de quantidade, somando todas as PRODs", () => {
    expect(reconcileContractScope(revision, prods, pieces.slice(0, 3)).status).toBe("pendente");
    expect(reconcileContractScope(revision, prods, [...pieces, { ...pieces[0], id: "extra", piece_code: "P08" }]).extras).toEqual([{ code: "P08", quantity: 1 }]);
    const split = [{ ...prods[0] }, { id: "prod-2" } as ProductionProd];
    const across = pieces.map((piece, index) => ({ ...piece, prod_id: index % 2 ? "prod-2" : "prod-1" }));
    expect(reconcileContractScope(revision, split, across).status).toBe("completo");
    expect(reconcileContractScope(revision, split, [{ ...across[0], quantity: 2 }, ...across.slice(1)]).status).toBe("pendente");
  });
  it("exige origem na leitura da PROD e liberação das peças ativas", () => {
    expect(reconcileContractScope(revision, prods, [{ ...pieces[0], import_batch_id: null }, ...pieces.slice(1)]).status).toBe("pendente");
    expect(reconcileContractScope(revision, prods, [{ ...pieces[0], released_to_production: false }, ...pieces.slice(1)]).status).toBe("pendente");
  });
  it("aceita correspondência explícita de código, e rejeita duplicações no vínculo", () => {
    const mapped = { ...revision, items: parseContractScopeItems("J01-REV;1;J01\nJ02;1\nP06;1\nP07;1") };
    expect(reconcileContractScope(mapped, prods, pieces).status).toBe("completo");
    expect(() => parseContractScopeItems("J01;1\nJ01;1")).toThrow(/repetido/);
    expect(() => parseContractScopeItems("J01;1;P01\nJ02;1;P01")).toThrow(/repetido/);
  });
});
