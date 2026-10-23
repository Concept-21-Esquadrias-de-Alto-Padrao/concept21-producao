import { describe, expect, it } from "vitest";
import { parseContractScopePdfText } from "./contract-scope-pdf";

const proposal = "Proposta Nº\n26-0810\nTipo:Linha:L:H:Qtd:\nP0631602500GOLD1\nTipo:Linha:L:H:Qtd:\nP0741102500GOLD1\nTipo:Linha:L:H:Qtd:\nJ0125201190GOLD1\nTipo:Linha:L:H:Qtd:\nJ0228601200GOLD1";
const separatedFields = "Linha:\nCONCEPT LINE\nH:\n2491\nL:\n1481\nQtd:\n1\nTipo:\nP01\nLocalização:\nPORTA LATERAL\nProposta Nº\n26-0731\nTipo:\nMUX02_A1\nQtd:\n2\nL:\n850\nH:\n304\nLinha:\nBRISE\nLocalização:\nGARAGEM";

describe("leitura do desenho SmartCEM", () => {
  it("extrai os quatro códigos e quantidades sem exigir digitação", () => {
    expect(parseContractScopePdfText(proposal, 2)).toEqual({
      contractNumber: "26-0810", documentKind: "proposta", pages: 2,
      items: [{ code: "P06", quantity: 1 }, { code: "P07", quantity: 1 }, { code: "J01", quantity: 1 }, { code: "J02", quantity: 1 }],
    });
  });
  it("lê campos separados com Qtd antes ou depois de Tipo", () => {
    expect(parseContractScopePdfText(separatedFields, 6)).toEqual({
      contractNumber: "26-0731", documentKind: "proposta", pages: 6,
      items: [{ code: "P01", quantity: 1 }, { code: "MUX02_A1", quantity: 2 }],
    });
  });
  it("rejeita PDF apenas da PROD e leitura parcial do desenho", () => {
    expect(() => parseContractScopePdfText("Itens da Obra\nObra: 26-0810_PROD1", 1)).toThrow(/apenas itens de uma PROD/);
    expect(() => parseContractScopePdfText(proposal.replace("J0228601200GOLD1", "linha ilegível"), 2)).toThrow(/Não foi possível ler uma linha/);
    expect(() => parseContractScopePdfText(separatedFields.replace("Qtd:\n2", "Qtd:\nilegível"), 6)).toThrow(/Não foi possível ler uma linha/);
  });
});
