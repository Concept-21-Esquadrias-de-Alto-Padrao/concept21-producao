import pdfParse from "pdf-parse/lib/pdf-parse.js";

export type ParsedProdPiece = {
  piece_code: string;
  system_code: string | null;
  system_description: string | null;
  quantity: number;
  width_mm: number | null;
  height_mm: number | null;
  measure_a: number | null;
  measure_b: number | null;
  location: string | null;
  area_m2: number;
  unit_weight_kg: number;
  total_weight_kg: number;
  sort_order: number;
};

export type ProdPiecesPdfMetadata = {
  emitted_at: string | null;
  emitted_by: string | null;
  client: string | null;
  work: string | null;
  address: string | null;
  city_state: string | null;
  treatment: string | null;
  pages: number;
};

export type ProdPiecesPdfTotals = {
  quantity: number | null;
  area_m2: number | null;
  weight_kg: number | null;
};

export type ProdPiecesPdfParseResult = {
  metadata: ProdPiecesPdfMetadata;
  totals: ProdPiecesPdfTotals;
  pieces: ParsedProdPiece[];
  warnings: string[];
};

type CurrentSystem = {
  code: string;
  description: string;
};

const footerPatterns = [
  /^\d+\d+,\d{2}\d+,\d{3}$/,
  /^\d+\s*\/\s*\d+$/,
];

function decimal(value: string | null | undefined) {
  if (!value) return 0;
  const normalized = value.replace(/\./g, "").replace(",", ".");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function nullableNumber(value: string | null | undefined) {
  if (!value) return null;
  const parsed = decimal(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function cleanText(value: string | null | undefined) {
  const normalized = (value ?? "")
    .replace(/\uFFFD/g, "")
    .replace(/\s+/g, " ")
    .trim();

  return normalized || null;
}

function splitPieceCodeAndQuantity(
  rawCodeWithQuantity: string,
  totalWeightKg?: number,
  unitWeightKg?: number,
) {
  const trimmed = rawCodeWithQuantity.trim();
  const lastChar = trimmed.slice(-1);
  const fallbackQuantity = Number(lastChar);
  const inferredQuantity =
    totalWeightKg && unitWeightKg
      ? Math.round(totalWeightKg / unitWeightKg)
      : 0;

  if (
    inferredQuantity > 1 &&
    inferredQuantity < 100 &&
    totalWeightKg &&
    unitWeightKg &&
    Math.abs(totalWeightKg / unitWeightKg - inferredQuantity) < 0.03
  ) {
    const inferredText = String(inferredQuantity);
    const suffixWithDefaultQuantity = `${inferredText}${lastChar}`;

    if (trimmed.endsWith(suffixWithDefaultQuantity) && trimmed.length > suffixWithDefaultQuantity.length) {
      return {
        pieceCode: trimmed.slice(0, -suffixWithDefaultQuantity.length),
        quantity: inferredQuantity,
      };
    }

    if (trimmed.endsWith(inferredText) && trimmed.length > inferredText.length) {
      return {
        pieceCode: trimmed.slice(0, -inferredText.length),
        quantity: inferredQuantity,
      };
    }
  }

  if (!Number.isInteger(fallbackQuantity) || fallbackQuantity <= 0 || trimmed.length <= 1) {
    return { pieceCode: trimmed, quantity: 1 };
  }

  return {
    pieceCode: trimmed.slice(0, -1),
    quantity: fallbackQuantity,
  };
}

function isFooterLine(line: string) {
  return (
    footerPatterns.some((pattern) => pattern.test(line)) ||
    line.includes("CONCEPT ALUMINIUM") ||
    line.includes("SmartCEM")
  );
}

function isHeaderLine(line: string) {
  return line.includes("TipoQtde") || line === "Tipo" || line.startsWith("Qtde") || line.startsWith("Itens da Obra");
}

function looksLikePieceStart(line: string) {
  return /^[A-Z]{1,6}\d/.test(line.trim());
}

function parseSystemLine(line: string): CurrentSystem | null {
  const normalized = line.replace(/\s+/g, " ").trim();
  const golMatch = normalized.match(/^(GOL-[A-Z0-9-]+)(.+)$/);

  if (golMatch) {
    return {
      code: golMatch[1],
      description: golMatch[2].trim(),
    };
  }

  if (normalized.startsWith("PERFIS DIVERSOS_MOD")) {
    return {
      code: "PERFIS DIVERSOS_MOD",
      description: normalized.replace("PERFIS DIVERSOS_MOD", "").trim(),
    };
  }

  if (normalized.startsWith("PERFIS DIVERSOS")) {
    return {
      code: "PERFIS DIVERSOS",
      description: normalized.replace("PERFIS DIVERSOS", "").trim(),
    };
  }

  return null;
}

function parseHeader(lines: string[], pages: number): ProdPiecesPdfMetadata {
  const emittedAt = cleanText(lines.find((line) => /^\d{2}\/\d{2}\/\d{4}$/.test(line)));
  const emittedByLine = lines.find((line) => line.includes("Emitido por:"));
  const treatmentLine = lines.find((line) => line.startsWith("Trat.:"));
  const labelsStart = lines.findIndex((line) => line === "Obra:");
  const cityLine = lines.find((line) => line.endsWith("Cidade:"));

  return {
    emitted_at: emittedAt,
    emitted_by: cleanText(emittedByLine?.split("Emitido por:")[1]),
    work: labelsStart >= 0 ? cleanText(lines[labelsStart + 3]) : null,
    address: labelsStart >= 0 ? cleanText(lines[labelsStart + 4]) : null,
    client: labelsStart >= 0 ? cleanText(lines[labelsStart + 5]) : null,
    treatment: cleanText(treatmentLine?.replace("Trat.:", "")),
    city_state: cleanText(cityLine?.replace("Cidade:", "")),
    pages,
  };
}

function parseTotals(lines: string[], expectedQuantity: number | null): ProdPiecesPdfTotals {
  const totalLine = [...lines].reverse().find((line) => /^\d+\d+,\d{2}\d+,\d{3}$/.test(line));
  const candidates: Array<{ quantity: number; area_m2: number; weight_kg: number }> = [];

  if (totalLine) {
    for (let quantityDigits = 1; quantityDigits <= Math.min(4, totalLine.length); quantityDigits += 1) {
      const quantityText = totalLine.slice(0, quantityDigits);
      const rest = totalLine.slice(quantityDigits);
      const match = rest.match(/^(\d+,\d{2})(\d+,\d{3})$/);

      if (!match) continue;

      const [, areaText, weightText] = match;

      candidates.push({
        quantity: Number(quantityText),
        area_m2: decimal(areaText),
        weight_kg: decimal(weightText),
      });
    }
  }

  const nearestQuantityMatch =
    expectedQuantity !== null
      ? [...candidates].sort(
          (left, right) =>
            Math.abs(left.quantity - expectedQuantity) -
            Math.abs(right.quantity - expectedQuantity),
        )[0]
      : null;
  const match =
    candidates.find((candidate) => expectedQuantity !== null && candidate.quantity === expectedQuantity) ??
    nearestQuantityMatch ??
    candidates.find((candidate) => candidate.quantity > 0 && candidate.quantity < 1000) ??
    null;

  return {
    quantity: match?.quantity ?? null,
    area_m2: match?.area_m2 ?? null,
    weight_kg: match?.weight_kg ?? null,
  };
}

function parsePieceLine(
  line: string,
  system: CurrentSystem | null,
  sortOrder: number,
): ParsedProdPiece | null {
  const normalized = line.replace(/\s+/g, " ").trim();
  const candidates: Array<{ piece: ParsedProdPiece; score: number; primaryDimension: number }> = [];

  for (let totalWeightIntegerLength = 1; totalWeightIntegerLength <= 6; totalWeightIntegerLength += 1) {
    const weightsMatch = normalized.match(
      new RegExp(`^(.*?)(\\d{${totalWeightIntegerLength}},\\d{3})(\\d+,\\d{3})$`),
    );

    if (!weightsMatch) continue;

    const [, beforeWeightsRaw, totalWeightText, unitWeightText] = weightsMatch;
    const parsedTotalWeight = decimal(totalWeightText);
    const parsedUnitWeight = decimal(unitWeightText);

    for (let dimensionLength = 1; dimensionLength <= 5; dimensionLength += 1) {
      const areaMatch = beforeWeightsRaw.match(
        new RegExp(`^(.+?)(\\d{${dimensionLength}})(\\d+,\\d{2})(.*)$`),
      );

      if (!areaMatch) continue;

      const [, beforeAreaRaw, attachedDimension, area, rawLocation] = areaMatch;
      const tokens = beforeAreaRaw.trim().split(/\s+/).filter(Boolean);
      const dimensionTokens: string[] = [];

      while (tokens.length > 0 && /^\d{1,5}$/.test(tokens[tokens.length - 1]) && dimensionTokens.length < 4) {
        dimensionTokens.unshift(tokens.pop() ?? "");
      }

      if (!tokens.length) continue;

      dimensionTokens.push(attachedDimension);
      if (dimensionTokens.length > 4) continue;

      const rawCodeWithQuantity = tokens.join(" ");
      const { pieceCode, quantity } = splitPieceCodeAndQuantity(
        rawCodeWithQuantity,
        parsedTotalWeight,
        parsedUnitWeight,
      );
      const [width, height, measureA, measureB] = dimensionTokens;
      const widthValue = nullableNumber(width);
      const heightValue = nullableNumber(height);
      const areaValue = decimal(area);
      let score = areaValue > 100 ? 100 : 0;

      if (widthValue && heightValue) {
        const expectedArea = (widthValue * heightValue * quantity) / 1_000_000;
        score = Math.abs(expectedArea - areaValue);
        if (heightValue > 12000) score += 100;
        if (widthValue > 20000) score += 100;
      } else if (widthValue) {
        score = areaValue > 0.5 ? areaValue + 10 : 0;
      }

      if (parsedUnitWeight > 0) {
        const expectedQuantity = parsedTotalWeight / parsedUnitWeight;
        score += Math.min(100, Math.abs(expectedQuantity - quantity) * 20);
      }

      candidates.push({
        piece: {
          piece_code: pieceCode,
          system_code: system?.code ?? null,
          system_description: cleanText(system?.description),
          quantity,
          width_mm: widthValue,
          height_mm: heightValue,
          measure_a: nullableNumber(measureA),
          measure_b: nullableNumber(measureB),
          location: cleanText(rawLocation),
          area_m2: areaValue,
          unit_weight_kg: parsedUnitWeight,
          total_weight_kg: parsedTotalWeight,
          sort_order: sortOrder,
        },
        score,
        primaryDimension: widthValue ?? 0,
      });
    }
  }

  candidates.sort(
    (left, right) => left.score - right.score || right.primaryDimension - left.primaryDimension,
  );

  return candidates[0]?.piece ?? null;
}

export function parseProdPiecesText(text: string, pages = 1): ProdPiecesPdfParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const warnings: string[] = [];
  const pieces: ParsedProdPiece[] = [];
  let currentSystem: CurrentSystem | null = null;

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const system = parseSystemLine(line);

    if (system) {
      currentSystem = system;
      continue;
    }

    if (isFooterLine(line) || isHeaderLine(line)) {
      continue;
    }

    if (looksLikePieceStart(line)) {
      const piece = parsePieceLine(line, currentSystem, pieces.length + 1);
      if (piece) {
        pieces.push(piece);
        continue;
      }

      const nextLine = lines[index + 1];
      const mergedPiece = nextLine && !isFooterLine(nextLine) && !isHeaderLine(nextLine)
        ? parsePieceLine(`${line} ${nextLine}`, currentSystem, pieces.length + 1)
        : null;

      if (mergedPiece) {
        pieces.push(mergedPiece);
        index += 1;
        continue;
      }
    }

    if (currentSystem && !isFooterLine(line) && !isHeaderLine(line)) {
      currentSystem.description = `${currentSystem.description} ${line}`.trim();
    }
  }

  if (!pieces.length) {
    warnings.push("Nenhuma peça foi identificada no PDF.");
  }

  const parsedQuantity = pieces.reduce((sum, piece) => sum + piece.quantity, 0);
  const parsedArea = pieces.reduce((sum, piece) => sum + piece.area_m2, 0);
  const parsedWeight = pieces.reduce((sum, piece) => sum + piece.total_weight_kg, 0);
  const totals = parseTotals(lines, parsedQuantity || null);

  if (totals.quantity !== null && totals.quantity !== parsedQuantity) {
    warnings.push("A quantidade extraída não confere com o total informado no PDF. Revise a prévia antes de importar.");
  }

  if (totals.area_m2 !== null && Math.abs(totals.area_m2 - parsedArea) > 0.05) {
    warnings.push("A área extraída não confere com o total informado no PDF. Revise medidas e localização antes de importar.");
  }

  if (totals.weight_kg !== null && Math.abs(totals.weight_kg - parsedWeight) > 0.05) {
    warnings.push("O peso extraído não confere com o total informado no PDF. Revise a prévia antes de importar.");
  }

  return {
    metadata: parseHeader(lines, pages),
    totals,
    pieces,
    warnings,
  };
}

export async function parseProdPiecesPdf(buffer: Buffer): Promise<ProdPiecesPdfParseResult> {
  const parsedPdf = await pdfParse(buffer);

  return parseProdPiecesText(parsedPdf.text, parsedPdf.numpages);
}
