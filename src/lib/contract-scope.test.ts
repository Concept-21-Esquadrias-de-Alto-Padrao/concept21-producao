import { describe, expect, it } from "vitest";
import { parseContractScopeItems, parseContractScopeMappings, reconcileContractScope, type ContractScopeRevision } from "./contract-scope";
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
    expect(reconcileContractScope({ ...revision, source_kind: "proposta" }, prods, pieces).match).toBe(true);
    expect(reconcileContractScope({ ...revision, source_kind: "proposta" }, prods, pieces.slice(0, 3)).match).toBe(false);
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
  it("concilia um desdobro sem confundir unidades do contrato com peças da PROD", () => {
    const splitRevision = { ...revision, items: [{ code: "J01", quantity: 1,
      prod_parts: [{ code: "J01_A", quantity: 1 }, { code: "J01_B", quantity: 1 }] }] };
    const splitPieces = ["J01_A", "J01_B"].map((piece_code, index) => ({
      ...pieces[index], piece_code: index === 0 ? "J01 _A" : piece_code,
    }));
    const result = reconcileContractScope(splitRevision, prods, splitPieces);
    expect(result).toMatchObject({ status: "completo", contractUnits: 1, totalExpected: 2, totalFound: 2 });
    expect(result.lines[0].parts).toEqual([
      { code: "J01_A", expected: 1, found: 1 }, { code: "J01_B", expected: 1, found: 1 },
    ]);
    expect(reconcileContractScope(splitRevision, prods, splitPieces.slice(0, 1)).match).toBe(false);
  });
  it("normaliza espaços dos códigos do PDF e da PROD, mantendo os demais caracteres", () => {
    const rip = { ...revision, items: [{ code: "RIP01", quantity: 1 }] };
    expect(reconcileContractScope(rip, prods, [{ ...pieces[0], piece_code: "RIP 01" }]).match).toBe(true);
  });
  it("aceita somente vínculos dos códigos disponíveis, sem alterar quantidades contratuais", () => {
    const original = [{ code: "J01", quantity: 1 }, { code: "J02", quantity: 1 }];
    const available = [{ code: "J01_A", quantity: 1 }, { code: "J01_B", quantity: 1 }, { code: "J02", quantity: 1 }];
    const mappings = JSON.stringify([{ code: "J01", parts: [{ code: "J01_A", quantity: 1 }, { code: "J01_B", quantity: 1 }] },
      { code: "J02", parts: [{ code: "J02", quantity: 1 }] }]);
    expect(parseContractScopeMappings(mappings, original, available)).toEqual([
      { code: "J01", quantity: 1, prod_parts: [{ code: "J01_A", quantity: 1 }, { code: "J01_B", quantity: 1 }] },
      { code: "J02", quantity: 1, prod_parts: [{ code: "J02", quantity: 1 }] },
    ]);
    expect(() => parseContractScopeMappings(mappings.replace('"J02","quantity":1', '"J01_A","quantity":1'), original, available)).toThrow(/uma vez/);
    expect(() => parseContractScopeMappings(mappings.replace('"J02","quantity":1', '"J99","quantity":1'), original, available)).toThrow(/Confira o código/);
    expect(() => parseContractScopeMappings(mappings.replace('"J02","quantity":1', '"J02","quantity":2'), original, available)).toThrow(/tem 1 unidade/);
  });
});
