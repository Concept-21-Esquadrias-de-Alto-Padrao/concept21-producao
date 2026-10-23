import type { ProductionPiece, ProductionProd } from "./types";

export type ContractScopeItem = {
  code: string;
  quantity: number;
  technical_piece_id?: string;
  parent_code?: string;
  prod_code?: string;
};

export type ContractScopeRevision = {
  id: string;
  contract_id: string;
  revision_number: number;
  source_kind: "proposta" | "tecnico_integral";
  source_reference: string;
  source_revision: string | null;
  items: ContractScopeItem[];
  created_at: string;
};

export function parseContractScopeItems(value: string): ContractScopeItem[] {
  const lines = value.trim().split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (!lines.length || lines.length > 500) throw new Error("Informe entre 1 e 500 itens do contrato.");
  const seen = new Set<string>();
  const seenProdCodes = new Set<string>();
  return lines.map((line, index) => {
    const [rawCode, rawQuantity, rawProdCode, ...extra] = line.split(";").map(part => part.trim());
    const code = rawCode?.toUpperCase();
    const prodCode = rawProdCode?.toUpperCase() || code;
    const quantity = Number(rawQuantity);
    if (extra.length || !code || !/^[A-Z0-9_./-]{1,60}$/.test(code) || !prodCode || !/^[A-Z0-9_./-]{1,60}$/.test(prodCode) || !/^[1-9]\d{0,4}$/.test(rawQuantity ?? "") || !Number.isSafeInteger(quantity) || quantity > 10000) {
      throw new Error(`Linha ${index + 1}: use CÓDIGO;QUANTIDADE;CÓDIGO_NA_PROD (terceiro campo opcional).`);
    }
    if (seen.has(code)) throw new Error(`Código ${code} repetido na lista integral.`);
    if (seenProdCodes.has(prodCode)) throw new Error(`Código ${prodCode} repetido no vínculo com a PROD.`);
    seen.add(code);
    seenProdCodes.add(prodCode);
    return { code, quantity, ...(prodCode !== code ? { prod_code: prodCode } : {}) };
  });
}

export function reconcileContractScope(
  revision: ContractScopeRevision | null,
  prods: ProductionProd[],
  pieces: ProductionPiece[],
) {
  if (!revision) return { status: "sem_base" as const, lines: [], extras: [], totalExpected: 0, totalFound: 0 };
  const prodIds = new Set(prods.map(prod => prod.id));
  const active = pieces.filter(piece => prodIds.has(piece.prod_id) && !piece.disposition?.cancelled_at);
  const actual = new Map<string, number>();
  for (const piece of active) {
    const code = piece.piece_code.trim().toUpperCase();
    actual.set(code, (actual.get(code) ?? 0) + Number(piece.quantity));
  }
  const expected = new Map<string, number>();
  for (const item of revision.items) {
    const code = (item.prod_code || item.code).trim().toUpperCase();
    expected.set(code, (expected.get(code) ?? 0) + item.quantity);
  }
  const lines = revision.items.map(item => ({
    code: item.code,
    prodCode: item.prod_code || item.code,
    expected: item.quantity,
    found: actual.get((item.prod_code || item.code).toUpperCase()) ?? 0,
  }));
  const extras = [...actual].filter(([code]) => !expected.has(code)).map(([code, quantity]) => ({ code, quantity }));
  const totalExpected = revision.items.reduce((sum, item) => sum + item.quantity, 0);
  const totalFound = active.reduce((sum, piece) => sum + Number(piece.quantity), 0);
  const complete = revision.source_kind === "tecnico_integral" && prods.length > 0 &&
    prods.every(prod => active.some(piece => piece.prod_id === prod.id)) &&
    active.every(piece => piece.import_batch_id && piece.released_to_production) &&
    lines.every(line => (actual.get(line.prodCode.toUpperCase()) ?? 0) === (expected.get(line.prodCode.toUpperCase()) ?? 0)) && !extras.length;
  return { status: complete ? "completo" as const : "pendente" as const, lines, extras, totalExpected, totalFound };
}
