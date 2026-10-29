import { describe, expect, it } from "vitest";
import { getOpenProdPlans, planningWindow, todayInBrasilia } from "./open-prod-planning";
import type { ProductionSnapshot } from "./types";

describe("planejamento das PRODs abertas", () => {
  it("usa o dia de Brasília, inclusive na virada do mês", () => {
    const now = new Date("2026-10-30T02:59:59Z");
    expect(todayInBrasilia(now)).toBe("2026-10-29");
    expect(planningWindow("2026-10-28", todayInBrasilia(now))).toBe("atrasada");
    expect(planningWindow("2026-10-29", todayInBrasilia(now))).toBe("hoje");
    expect(planningWindow("2026-11-05", todayInBrasilia(now))).toBe("proximos_7_dias");
    expect(planningWindow("2026-11-06", todayInBrasilia(now))).toBe("futura");
    expect(planningWindow(null, todayInBrasilia(now))).toBe("sem_data");
  });

  it("não inclui PRODs concluídas e distingue confirmação de ausência de registro", () => {
    const snapshot = {
      contracts: [{ id: "contract-1", lifecycle: { archived_at: null } }],
      prods: [
        { id: "open", contract_id: "contract-1", planned_end_date: "2026-10-29", lifecycle: { state: "em_andamento" } },
        { id: "closed", contract_id: "contract-1", planned_end_date: "2026-10-28", lifecycle: { completed_at: "2026-10-28T12:00:00Z" } },
        { id: "no-record", contract_id: "contract-1", planned_end_date: null, lifecycle: { state: "em_andamento" } },
        { id: "waiting-dispatch", contract_id: "contract-1", planned_end_date: "2026-10-20", lifecycle: { state: "em_andamento", manufacturing_state: "concluida" } },
      ],
      prodMaterials: [
        { prod_id: "open", group: "vidros", confirmation_status: "confirmado" },
        { prod_id: "open", group: "perfis", confirmation_status: "aguardando_confirmacao" },
      ],
      documentChecks: [
        { prod_id: "open", checked: false },
        { prod_id: "open", checked: true },
      ],
    } as unknown as ProductionSnapshot;
    const plans = getOpenProdPlans(snapshot, new Date("2026-10-29T15:00:00Z"));
    expect(Object.keys(plans).sort()).toEqual(["no-record", "open", "waiting-dispatch"]);
    expect(plans["waiting-dispatch"].window).toBe("producao_concluida");
    expect(plans.open).toMatchObject({
      window: "hoje", materials: "pendente", materialIssues: ["perfis"],
      documents: "pendente", pendingDocuments: 1,
    });
    expect(plans["no-record"]).toMatchObject({
      window: "sem_data", materials: "sem_registro", documents: "sem_registro",
    });
  });
});
