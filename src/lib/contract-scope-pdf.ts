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

  const lines = text.split("\n").map(line => line.trim());
  const headers = lines.flatMap((line, index) => /^Tipo:\s*Linha:\s*L:\s*H:\s*Qtd:$/i.test(line) ? [index] : []);
  if (!headers.length || headers.length > 500) throw new Error("Não foi possível identificar com segurança os itens do desenho.");
  const quantities = new Map<string, number>();
  for (const header of headers) {
    // SmartCEM joins code, dimensions, product line and quantity in one text run.
    const row = lines[header + 1] ?? "";
    const match = row.match(/^([A-Z]{1,6}\d{2})(\d{6,10})([A-Z][A-Z0-9-]*?)([1-9]\d?)$/);
    if (!match) throw new Error(`Não foi possível ler uma linha do desenho: ${row.slice(0, 80)}. Confira o PDF antes de registrar.`);
    const [, code, , , rawQuantity] = match;
    quantities.set(code, (quantities.get(code) ?? 0) + Number(rawQuantity));
  }
  const items = parseContractScopeItems([...quantities].map(([code, quantity]) => `${code};${quantity}`).join("\n"));
  return { contractNumber, documentKind: "proposta", items, pages };
}
