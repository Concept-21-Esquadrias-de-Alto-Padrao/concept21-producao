import { describe, expect, it } from "vitest";
import { deriveProdStatus } from "./prod-progress";
import type { ProductionPiece, ProductionPieceStage, ProductionProd, ProductionStage, StageStatus } from "./types";

const stages = [5, 6, 7, 8].map(sort_order => ({ id: `stage-${sort_order}`, sort_order })) as ProductionStage[];
const prod = (status: ProductionProd["status"] = "planejamento", manufacture = "em_andamento") => ({
  id: "prod-1", status, legacy_status: status,
  lifecycle: { state: "em_andamento", manufacturing_state: manufacture, historical_recorded_at: null },
}) as ProductionProd;
const piece = (id: string, cancelled = false) => ({
  id, prod_id: "prod-1", released_to_production: true,
  disposition: cancelled ? { cancelled_at: "2026-10-27T12:00:00Z" } : null,
}) as ProductionPiece;
const slot = (piece_id: string, order: number, status: StageStatus): ProductionPieceStage => ({
  piece_id, prod_id: "prod-1", stage_id: `stage-${order}`, status,
  completed_at: ["concluida", "nao_aplicavel"].includes(status) ? "2026-10-27T12:00:00Z" : null,
  started_at: ["em_andamento", "pausada", "concluida"].includes(status) ? "2026-10-27T11:00:00Z" : null,
  blockers: null,
}) as ProductionPieceStage;
const done = (id: string, until: number) => [5, 6, 7, 8].map(order =>
  slot(id, order, order <= until ? "concluida" : "aguardando"));

describe("andamento geral derivado de evidências", () => {
  it("mantém as classificações anteriores enquanto não há apontamento de fabricação", () => {
    expect(deriveProdStatus(prod("aguardando_listas"), [piece("a")], [], stages))
      .toEqual({ status: "aguardando_listas", status_origin: "manual" });
    expect(deriveProdStatus(prod("em_producao"), [piece("a")], [], stages).status_origin).toBe("legado");
  });

  it("mostra produção após o primeiro apontamento e não pausa a PROD por uma peça pausada", () => {
    expect(deriveProdStatus(prod(), [piece("a")], [slot("a", 5, "em_andamento")], stages).status).toBe("em_producao");
    expect(deriveProdStatus(prod(), [piece("a")], [slot("a", 5, "pausada")], stages).status).toBe("em_producao");
  });

  it("mantém a fase mais antiga ainda incompleta quando peças avançam em ritmos diferentes", () => {
    const rows = [...done("a", 7), slot("b", 5, "em_andamento")];
    expect(deriveProdStatus(prod(), [piece("a"), piece("b")], rows, stages).status).toBe("em_producao");
    expect(deriveProdStatus(prod(), [piece("a"), piece("b", true)], rows, stages).status).toBe("embalagem");
  });

  it("avança para embalagem e expedição com evidência integral das etapas", () => {
    expect(deriveProdStatus(prod(), [piece("a")], done("a", 7), stages).status).toBe("embalagem");
    expect(deriveProdStatus(prod("planejamento", "concluida"), [piece("a")], done("a", 8), stages).status).toBe("expedicao");
  });

  it("recalcula após retorno e respeita conclusão, pausa formal e histórico", () => {
    const returned = [...done("a", 8).filter(row => row.stage_id !== "stage-6"), slot("a", 6, "aguardando")];
    expect(deriveProdStatus(prod("expedicao"), [piece("a")], returned, stages).status).toBe("em_producao");
    expect(deriveProdStatus(prod("pausada"), [piece("a")], [slot("a", 5, "pausada")], stages).status).toBe("pausada");
    expect(deriveProdStatus({ ...prod(), lifecycle: { state: "concluida" } } as ProductionProd, [piece("a")], [], stages).status).toBe("concluida");
    expect(deriveProdStatus({ ...prod(), lifecycle: { state: "em_andamento", historical_recorded_at: "2026-10-27T12:00:00Z" } } as ProductionProd, [piece("a")], [], stages).status_origin).toBe("historico");
  });
});
