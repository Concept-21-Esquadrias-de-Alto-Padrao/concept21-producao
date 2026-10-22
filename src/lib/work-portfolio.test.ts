import { describe, expect, it } from "vitest";
import { buildWorkPortfolio, planningDeadline } from "./work-portfolio";
import type { ProductionSnapshot } from "./types";

function snapshot(): ProductionSnapshot {
  return {
    clients: [{ id: "client-a", name: "Cliente A" }],
    contracts: [
      { id: "contract-a", client_id: "client-a", contract_number: "25-0001", work_name: "Obra A", general_delivery_forecast: "2026-11-01" },
      { id: "contract-b", client_id: "client-a", contract_number: "25-0002", work_name: "Obra B", general_delivery_forecast: null },
    ],
    prods: [
      { id: "prod-1", contract_id: "contract-a", prod_number: 1, status: "planejamento" },
      { id: "prod-2", contract_id: "contract-a", prod_number: 2, status: "em_producao" },
    ],
    prodPieces: [
      { id: "piece-1", prod_id: "prod-1", piece_code: "J01", quantity: 2, released_to_production: true },
      { id: "piece-2", prod_id: "prod-2", piece_code: "J02", quantity: 1, released_to_production: false },
      { id: "piece-3", prod_id: "prod-2", piece_code: "J03", quantity: 5, disposition: { cancelled_at: "2026-10-22" } },
    ],
    prodMaterials: [{ prod_id: "prod-1", confirmation_status: "nao_verificado" }],
  } as ProductionSnapshot;
}

describe("carteira de obras", () => {
  it("mantém a obra sem PROD e soma apenas itens ativos das PRODs pertencentes ao contrato", () => {
    const [a, b] = buildWorkPortfolio(snapshot(), true);
    expect(a.prods).toHaveLength(2);
    expect(a.pieceLines).toBe(2);
    expect(a.pieceUnits).toBe(3);
    expect(a.releasedLines).toBe(1);
    expect(a.materialState).toBe("nao_verificado");
    expect(a.progress).toBe("em_producao");
    expect(b.progress).toBe("sem_prod");
    expect(b.pieceUnits).toBe(0);
  });

  it("não interpreta falta de permissão de materiais como confirmação ou ausência", () => {
    expect(buildWorkPortfolio(snapshot(), false)[0].materialState).toBe("indisponivel");
  });

  it("filtra o prazo na data do planejamento, com trinta dias inclusivos", () => {
    expect(planningDeadline(null, "2026-10-22")).toBe("sem_data");
    expect(planningDeadline("2026-10-21", "2026-10-22")).toBe("vencido");
    expect(planningDeadline("2026-11-21", "2026-10-22")).toBe("proximos_30");
    expect(planningDeadline("2026-11-22", "2026-10-22")).toBe("futuro");
  });
});
