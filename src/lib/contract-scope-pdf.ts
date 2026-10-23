import pdfParse from "pdf-parse/lib/pdf-parse.js";
import { parseContractScopeItems, type ContractScopeItem } from "./contract-scope";

export type ContractScopePdfPreview = {
  contractNumber: string;
  documentKind: "proposta";
  items: ContractScopeItem[];
  pages: number;
};

export async function parseContractScopePdf(buffer: Buffer): Promise<ContractScopePdfPreview> {
  if (buffer.subarray(0, 5).toString() !== "%PDF-") throw new Error("Selecione um arquivo PDF válido.");
  const parsed = await pdfParse(buffer);
  return parseContractScopePdfText(parsed.text, parsed.numpages);
}

export function parseContractScopePdfText(rawText: string, pages: number): ContractScopePdfPreview {
  const text = rawText.replace(/\r/g, "");
  if (/Itens da Obra/i.test(text) && !/Proposta Nº/i.test(text)) {
    throw new Error("Este PDF contém apenas itens de uma PROD. Importe-o na tela da PROD; aqui use o desenho ou a lista integral do contrato.");
  }
  const contractNumber = text.match(/Proposta\s*N[º°o.]\s*\n\s*(\d{2}-\d{4})/i)?.[1];
  if (!contractNumber) throw new Error("Não foi possível identificar o número da proposta no PDF. Confira o arquivo.");

  const lines = text.split("\n").map(line => line.trim()).filter(Boolean);
  const quantities = new Map<string, number>();
  let rowsRead = 0;
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index];
    let code: string | undefined;
    let rawQuantity: string | undefined;

    if (/^Tipo:\s*Linha:\s*L:\s*H:\s*Qtd:$/i.test(line)) {
      // Older SmartCEM exports join code, dimensions, line and quantity.
      const row = lines[index + 1] ?? "";
      const match = row.match(/^([A-Z]{1,6}\d{2})(\d{6,10})([A-Z][A-Z0-9-]*?)([1-9]\d?)$/);
      if (match) [, code, , , rawQuantity] = match;
    } else if (/^Tipo:\s*Qtd:\s*L:\s*H:\s*Linha:\s*Localização:$/i.test(line)) {
      // Some exports preserve the visual table order as one text row.
      const row = lines[index + 1] ?? "";
      const match = row.match(/^([A-Z0-9_./-]{1,60})\s+([1-9]\d{0,4})\s+\d{1,6}\s+\d{1,6}\b/);
      if (match) [, code, rawQuantity] = match;
    } else if (/^Tipo:$/i.test(line)) {
      // In the newer export each label/value is a separate PDF text run.
      // PDF extraction may put Qtd before Tipo or immediately after its code.
      code = lines[index + 1];
      if (/^Qtd:$/i.test(lines[index + 2] ?? "")) rawQuantity = lines[index + 3];
      else if (/^Qtd:$/i.test(lines[index - 2] ?? "")) rawQuantity = lines[index - 1];
    } else {
      continue;
    }

    if (!code || !/^[A-Z0-9_./-]{1,60}$/.test(code) ||
        !rawQuantity || !/^[1-9]\d{0,4}$/.test(rawQuantity) || Number(rawQuantity) > 10000) {
      throw new Error(`Não foi possível ler uma linha do desenho perto de “${line.slice(0, 50)}”. Confira o PDF antes de registrar.`);
    }
    rowsRead++;
    if (rowsRead > 500) throw new Error("O desenho contém mais de 500 linhas. Confira o PDF antes de registrar.");
    quantities.set(code, (quantities.get(code) ?? 0) + Number(rawQuantity));
  }
  if (!rowsRead) throw new Error("Não foi possível identificar com segurança os itens do desenho.");
  const items = parseContractScopeItems([...quantities].map(([code, quantity]) => `${code};${quantity}`).join("\n"));
  return { contractNumber, documentKind: "proposta", items, pages };
}
