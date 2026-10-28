import { describe, expect, it } from "vitest";
import { parseContractScopePdfText } from "./contract-scope-pdf";

const proposal = "Proposta Nº\n26-0810\nTipo:Linha:L:H:Qtd:\nP0631602500GOLD1\nTipo:Linha:L:H:Qtd:\nP0741102500GOLD1\nTipo:Linha:L:H:Qtd:\nJ0125201190GOLD1\nTipo:Linha:L:H:Qtd:\nJ0228601200GOLD1";
const separatedFields = "Linha:\nCONCEPT LINE\nH:\n2491\nL:\n1481\nQtd:\n1\nTipo:\nP01\nLocalização:\nPORTA LATERAL\nProposta Nº\n26-0731\nTipo:\nMUX02_A1\nQtd:\n2\nL:\n850\nH:\n304\nLinha:\nBRISE\nLocalização:\nGARAGEM";
const smartCemRows = "Proposta Nº\n26-0651\nTipo:Linha:L:H:Qtd:\nP0458502800CONCEPT SLIM1\nTipo:Linha:L:H:Qtd:\nP09_A8002720GOLD1\nTipo:Linha:L:H:Qtd:\nRIP 011180200BRISE1\nTipo:Linha:L:H:Qtd:\nP1150002300TUB. BASCULANTES1\nTipo:Linha:L:H:Qtd:\nCL0134301460CLARABOIA1";
const splitSmartCemRows = "Proposta Nº\n25-0080\nTipo:\tLinha:\tL:\tH:\tQtd:\nP11\t3172\t2446\tGOLD\t1\nTipo:\tLinha:\tL:\tH:\tQtd:\nP1\t651\t2204\tGOLD\t1\nTipo:\tLinha:\tL:\tH:\tQtd:\nP16\t2160\t2174\tGOLD\t1\nTipo:\tLinha:\tL:\tH:\tQtd:\nPIV-01\t1800\t5100\tCONCEPT LINE\t1\nTipo:\tLinha:\tL:\tH:\tQtd:\nRIP 2_A\t4720\t620\tBRISE\t1";

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
  it("lê códigos com sufixo e espaço e nomes de linha compostos no PDF SmartCEM", () => {
    expect(parseContractScopePdfText(smartCemRows, 6)).toEqual({
      contractNumber: "26-0651", documentKind: "proposta", pages: 6,
      items: [{ code: "P04", quantity: 1 }, { code: "P09_A", quantity: 1 },
        { code: "RIP01", quantity: 1 }, { code: "P11", quantity: 1 },
        { code: "CL01", quantity: 1 }],
      normalizedCodes: [{ original: "RIP 01", code: "RIP01" }],
    });
  });
  it("separa células sem confundir P1 com P16, incluindo hífens e códigos com espaço", () => {
    expect(parseContractScopePdfText(splitSmartCemRows, 7)).toEqual({
      contractNumber: "25-0080", documentKind: "proposta", pages: 7,
      items: [{ code: "P11", quantity: 1 }, { code: "P1", quantity: 1 }, { code: "P16", quantity: 1 },
        { code: "PIV-01", quantity: 1 }, { code: "RIP2_A", quantity: 1 }],
      normalizedCodes: [{ original: "RIP 2_A", code: "RIP2_A" }],
    });
  });
  it("rejeita PDF apenas da PROD e leitura parcial do desenho", () => {
    expect(() => parseContractScopePdfText("Itens da Obra\nObra: 26-0810_PROD1", 1)).toThrow(/apenas itens de uma PROD/);
    expect(() => parseContractScopePdfText(proposal.replace("J0228601200GOLD1", "linha ilegível"), 2)).toThrow(/Não foi possível ler uma linha/);
    expect(() => parseContractScopePdfText(separatedFields.replace("Qtd:\n2", "Qtd:\nilegível"), 6)).toThrow(/Não foi possível ler uma linha/);
    expect(() => parseContractScopePdfText(splitSmartCemRows.replace("P1\t651", "P1\tilegível"), 7)).toThrow(/Não foi possível ler uma linha/);
  });
});
