import { describe, expect, it } from "vitest";
import { demoSnapshot } from "./demo-data";
import { completionInPeriod, isOfficiallyCompleted, lifecycleRecordedAt, lifecycleView, parseLifecycleView, type ProdLifecycle } from "./lifecycle";
import { operationalSnapshot, reportableSnapshot } from "./lifecycle-snapshot";
import { getForecastVsDone, calculateDashboardMetrics } from "./production";
import { prodSchema } from "./schemas";
const completed: ProdLifecycle = { prod_id: "p", state: "concluida", manufacturing_state: "concluida", expedition_state: "total", total_quantity: 10, manufactured_quantity: 8, dispatched_quantity: 8, cancelled_quantity: 2, blocker_count: 0, archived_stage_count: 0, manufactured_at: "2026-10-20T15:00:00Z", completed_at: "2026-10-21T01:00:00Z", archived_at: null, archived_by: null, archive_reason: null };

it("declaração histórica entra em Concluídos sem simular a conclusão operacional", () => {
  const item = { lifecycle: { ...completed, state: "em_andamento" as const, completed_at: null, historical_recorded_at: "2026-10-27T14:00:00Z" } };
  expect(lifecycleView(item)).toBe("concluidos");
  expect(isOfficiallyCompleted(item)).toBe(false);
  expect(lifecycleRecordedAt(item)).toBe("2026-10-27T14:00:00Z");
  expect(item.lifecycle.state).toBe("em_andamento");
  expect(item.lifecycle.completed_at).toBeNull();
});
describe("official production lifecycle", () => {
  it("legacy status and dates alone never enter completed history", () => {
    const prod = { ...demoSnapshot.prods[0], status: "concluida" as const, actual_end_date: "2020-01-01" };
    expect(lifecycleView(prod)).toBe("em_andamento");
    expect(isOfficiallyCompleted(prod)).toBe(false);
    expect(getForecastVsDone({...demoSnapshot, prods:[prod]})[0].concluidas).toBe(0);
  });
  it("archives take precedence even over a stale completed marker", () => {
    const prod = {...demoSnapshot.prods[0], lifecycle:{...completed,archived_at:"2026-10-21T10:00:00Z"}};
    expect(lifecycleView(prod)).toBe("arquivados");
    expect(isOfficiallyCompleted(prod)).toBe(false);
    expect(getForecastVsDone({...demoSnapshot,prods:[prod]})).toEqual([]);
  });
  it("formal cancellations do not become completion", () => {
    expect(lifecycleView({lifecycle:{...completed,state:"cancelada",completed_at:null}})).toBe("cancelados");
  });
  it("officially completed PRODs leave queues independently from the contract", () => {
    const snapshot = structuredClone(demoSnapshot);
    snapshot.prods[0].lifecycle=completed;
    expect(operationalSnapshot(snapshot).prods.some(p=>p.id===snapshot.prods[0].id)).toBe(false);
    expect(reportableSnapshot(snapshot).prods.some(p=>p.id===snapshot.prods[0].id)).toBe(true);
    expect(lifecycleView(snapshot.contracts.find(c=>c.id===snapshot.prods[0].contract_id)!)).toBe("em_andamento");
  });
  it("archive filtering preserves original arrays and time entries", () => {
    const snapshot = structuredClone(demoSnapshot);
    snapshot.prods[0].lifecycle={...completed,archived_at:"2026-10-21T10:00:00Z"};
    const before=structuredClone(snapshot);
    const projected=reportableSnapshot(snapshot);
    expect(projected.prods.some(p=>p.id===snapshot.prods[0].id)).toBe(false);
    expect(snapshot).toEqual(before);
  });
  it("completion period uses Brasília date at the UTC boundary", () => {
    expect(completionInPeriod(completed.completed_at,"2026-10-20","2026-10-20")).toBe(true);
    expect(completionInPeriod(completed.completed_at,"2026-10-21","2026-10-21")).toBe(false);
    expect(completionInPeriod(null,"2026-10-01")).toBe(false);
  });
  it("reopened records cease counting as complete without relying on legacy status", () => {
    const prod={...demoSnapshot.prods[0],status:"concluida" as const,lifecycle:{...completed,state:"em_andamento" as const,completed_at:null}};
    expect(isOfficiallyCompleted(prod)).toBe(false);
    expect(lifecycleView(prod)).toBe("em_andamento");
    expect(getForecastVsDone({...demoSnapshot,prods:[prod]})[0].concluidas).toBe(0);
  });
  it("manual completed/cancelled status is rejected at form validation", () => {
    const base={contract_id:"00000000-0000-4000-8000-000000000001",prod_number:1};
    for(const status of ["concluida","cancelada"]) expect(prodSchema.safeParse({...base,status}).success).toBe(false);
  });
  it("untrusted URL views cannot access prototype properties", () => {
    for(const v of ["toString","__proto__","missing"]) expect(parseLifecycleView(v)).toBe("em_andamento");
  });
  it("archived work never appears in active dashboard counts", () => {
    const prod={...demoSnapshot.prods[0],status:"em_producao" as const,lifecycle:{...completed,state:"em_andamento" as const,completed_at:null,archived_at:"2026-10-21T10:00:00Z"}};
    expect(calculateDashboardMetrics({...demoSnapshot,prods:[prod]}).prodsInProgress).toBe(0);
  });
});
