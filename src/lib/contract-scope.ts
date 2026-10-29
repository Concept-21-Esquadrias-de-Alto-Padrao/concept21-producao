export type ContractScopeItem = {
  code: string;
  quantity: number;
  technical_piece_id?: string;
  parent_code?: string;
  prod_code?: string;
  prod_parts?: { code: string; quantity: number }[];
};

export function normalizeScopeCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

export function scopeProdParts(item: ContractScopeItem) {
  return item.prod_parts ?? [{ code: item.prod_code || item.code, quantity: item.quantity }];
}

/** The document's codes and quantities remain immutable; only their PROD links change. */
export function parseContractScopeMappings(
  raw: string, items: ContractScopeItem[], available: { code: string; quantity: number }[],
): ContractScopeItem[] {
  if (raw.length > 100_000) throw new Error("A conciliação excede o tamanho permitido.");
  let submitted: unknown;
  try { submitted = JSON.parse(raw); } catch { throw new Error("Revise os vínculos das peças."); }
  if (!Array.isArray(submitted) || submitted.length !== items.length || submitted.length > 500) {
    throw new Error("Todos os itens do contrato precisam constar na conciliação.");
  }
  const availableCodes = new Set(available.map(item => normalizeScopeCode(item.code)));
  const usedCodes = new Set<string>();
  let totalParts = 0;
  return items.map((item, index) => {
    const entry = submitted[index];
    if (!entry || typeof entry !== "object" || Array.isArray(entry) || entry.code !== item.code ||
        !Array.isArray(entry.parts) || entry.parts.length < 1) {
      throw new Error(`Informe ao menos uma peça da PROD para o item ${item.code}.`);
    }
    const parts = entry.parts.map((part: unknown) => {
      if (!part || typeof part !== "object" || Array.isArray(part)) throw new Error(`Vínculo inválido em ${item.code}.`);
      const value = part as Record<string, unknown>;
      const code = typeof value.code === "string" ? normalizeScopeCode(value.code) : "";
      const quantity = value.quantity;
      if (!/^[A-Z0-9_./-]{1,60}$/.test(code) || !availableCodes.has(code) ||
          !Number.isSafeInteger(quantity) || Number(quantity) < 1 || Number(quantity) > 10000 || usedCodes.has(code)) {
        throw new Error(`Confira o código e a quantidade vinculados ao item ${item.code}. Cada código da PROD só pode ser usado uma vez.`);
      }
      usedCodes.add(code);
      totalParts++;
      if (totalParts > 500) throw new Error("A conciliação excede 500 vínculos.");
      return { code, quantity: Number(quantity) };
    });
    if (parts.length === 1 && parts[0].quantity !== item.quantity) {
      throw new Error(`O item ${item.code} tem ${item.quantity} unidade(s) no contrato. Para outra quantidade, confira a revisão do Técnico ou registre o desdobro em peças distintas.`);
    }
    const { prod_code: ignored, ...unchanged } = item;
    void ignored;
    return { ...unchanged, prod_parts: parts };
  });
}

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
  prods: { id: string; lifecycle?: { archived_at: string | null; archived_stage_count?: number } | null }[],
  pieces: { prod_id: string; piece_code: string; quantity: number; import_batch_id: string | null;
    released_to_production: boolean; disposition?: { cancelled_at: string | null } | null }[],
) {
  if (!revision) return { status: "sem_base" as const, match: false, lines: [], extras: [], actualItems: [],
    totalExpected: 0, totalFound: 0, contractUnits: 0, hasCodeMismatch: false, withoutImport: 0, unreleased: 0 };
  const prodIds = new Set(prods.map(prod => prod.id));
  const active = pieces.filter(piece => prodIds.has(piece.prod_id) && !piece.disposition?.cancelled_at);
  const actual = new Map<string, number>();
  for (const piece of active) {
    const code = normalizeScopeCode(piece.piece_code);
    actual.set(code, (actual.get(code) ?? 0) + Number(piece.quantity));
  }
  const expected = new Map<string, number>();
  for (const item of revision.items) {
    for (const part of scopeProdParts(item)) {
      const code = normalizeScopeCode(part.code);
      expected.set(code, (expected.get(code) ?? 0) + part.quantity);
    }
  }
  const lines = revision.items.map(item => ({
    code: item.code,
    contractQuantity: item.quantity,
    parts: scopeProdParts(item).map(part => ({ code: normalizeScopeCode(part.code),
      expected: part.quantity, found: actual.get(normalizeScopeCode(part.code)) ?? 0 })),
  }));
  const extras = [...actual].filter(([code]) => !expected.has(code)).map(([code, quantity]) => ({ code, quantity }));
  const totalExpected = [...expected.values()].reduce((sum, quantity) => sum + quantity, 0);
  const totalFound = active.reduce((sum, piece) => sum + Number(piece.quantity), 0);
  const hasCodeMismatch = lines.some(line => line.parts.some(part => part.expected !== part.found)) || extras.length > 0;
  const withoutImport = active.filter(piece => !piece.import_batch_id).length;
  const unreleased = active.filter(piece => !piece.released_to_production).length;
  const match = prods.length > 0 &&
    prods.every(prod => !prod.lifecycle?.archived_at && !prod.lifecycle?.archived_stage_count && active.some(piece => piece.prod_id === prod.id)) &&
    !withoutImport && !unreleased && !hasCodeMismatch;
  return { status: match && revision.source_kind === "tecnico_integral" ? "completo" as const : "pendente" as const,
    match, lines, extras, actualItems: [...actual].map(([code, quantity]) => ({ code, quantity })),
    totalExpected, totalFound, contractUnits: revision.items.reduce((sum, item) => sum + item.quantity, 0),
    hasCodeMismatch, withoutImport, unreleased };
}
