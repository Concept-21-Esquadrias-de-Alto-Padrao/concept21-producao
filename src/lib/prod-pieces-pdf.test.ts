import { describe, expect, it } from "vitest";
import { parseProdPiecesText } from "./prod-pieces-pdf";

describe("prod pieces PDF parser", () => {
  it("lê quantidade, dimensões, totais e descrição quebrada em várias linhas", () => {
    const result = parseProdPiecesText(`
      GOL-FIX-100QUADRO FIXO - GRAB AND GO
      NA ALTURA PUXADOR LINEAR E GUARNICAO LATERAL INCLUINDO BAGUETES
      QD23P3  1425  352715,08LOBBY25,1788,393
      315,0825,178
    `);

    expect(result.warnings).toEqual([]);
    expect(result.totals).toEqual({
      quantity: 3,
      area_m2: 15.08,
      weight_kg: 25.178,
    });
    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0]).toMatchObject({
      piece_code: "QD23P",
      system_code: "GOL-FIX-100QUADRO",
      quantity: 3,
      width_mm: 1425,
      height_mm: 3527,
      location: "LOBBY",
      area_m2: 15.08,
      unit_weight_kg: 8.393,
      total_weight_kg: 25.178,
    });
    expect(result.pieces[0].system_description).toContain("NA ALTURA PUXADOR LINEAR");
  });

  it("reconstrói linhas de peça quebradas pelo PDF", () => {
    const result = parseProdPiecesText(`
      GOL-MAX-100JANELA MAXIM-AR
      J91   796   5840,46
      SUPERIOR - BH SUITE HOSPEDE4,6754,675
    `);

    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0]).toMatchObject({
      piece_code: "J9",
      quantity: 1,
      width_mm: 796,
      height_mm: 584,
      location: "SUPERIOR - BH SUITE HOSPEDE",
      area_m2: 0.46,
      unit_weight_kg: 4.675,
      total_weight_kg: 4.675,
    });
  });

  it("não confunde número da localização com peso total", () => {
    const result = parseProdPiecesText(`
      GOL-FIX-100QUADRO FIXO
      QD26P1  2890  353410,21REUNIAO 0222,49822,498
    `);

    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0]).toMatchObject({
      piece_code: "QD26P",
      quantity: 1,
      width_mm: 2890,
      height_mm: 3534,
      location: "REUNIAO 02",
      area_m2: 10.21,
      unit_weight_kg: 22.498,
      total_weight_kg: 22.498,
    });
  });

  it("lê perfis diversos com quantidade colada ao código da peça", () => {
    const result = parseProdPiecesText(`
      PERFIS DIVERSOSPERFIS DIVERSOS AVULSOS "TUBOS"
      PD0431  35420,01QD20P - QD21P20,4986,833
    `);

    expect(result.pieces).toHaveLength(1);
    expect(result.pieces[0]).toMatchObject({
      piece_code: "PD04",
      system_code: "PERFIS DIVERSOS",
      quantity: 3,
      width_mm: 3542,
      height_mm: null,
      location: "QD20P - QD21P",
      area_m2: 0.01,
      unit_weight_kg: 6.833,
      total_weight_kg: 20.498,
    });
  });
});
