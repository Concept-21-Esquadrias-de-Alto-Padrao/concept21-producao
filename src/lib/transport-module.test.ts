import { describe, expect, it, vi } from "vitest";
import { demoSnapshot } from "./demo-data";
import { getPointingStages } from "./pointing";
import { getAttentionItems } from "./production";
import { canAccessModule, firstAllowedAppRoute, getAllowedSettingsTabIds, MODULE_ACCESS } from "./module-access";
import { isolateTransportSnapshot, isSnapshotKeyEnabled, isTransportStage, TRANSPORT_DISABLED_MESSAGE } from "./transport-module";

const databaseAccess = vi.hoisted(() => ({
  admin: vi.fn(() => { throw new Error("Unexpected database access"); }),
  session: vi.fn(() => { throw new Error("Unexpected database access"); }),
}));
vi.mock("@/lib/supabase/admin", () => ({ getSupabaseAdminClient: databaseAccess.admin }));
vi.mock("@/lib/supabase/server", () => ({ createSupabaseServerClient: databaseAccess.session, hasSupabaseEnv: () => true }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn(), unstable_noStore: vi.fn() }));

describe("transport isolation", () => {
  it("rejects legacy URLs before streaming the page", async () => {
    const { proxy } = await import("../proxy");
    const response = proxy();
    expect(response.status).toBe(410);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toContain(TRANSPORT_DISABLED_MESSAGE);
  });

  it("blocks transport for master and transport-only profiles without creating a redirect loop", () => {
    const master = { isMaster: true, permissions: {} };
    const transportOnly = { isMaster: false, permissions: { "production.freights.view": true, "production.settings.manage_logistics": true } };
    expect(canAccessModule(master, MODULE_ACCESS.transport)).toBe(false);
    expect(canAccessModule(master, MODULE_ACCESS.pointing)).toBe(true);
    expect(getAllowedSettingsTabIds(master)).not.toContain("logistics");
    expect(firstAllowedAppRoute(transportOnly)).toBeNull();
  });

  it("projects production data without mutating history or requiring a freight stage", () => {
    const original = structuredClone(demoSnapshot);
    const snapshot = isolateTransportSnapshot(demoSnapshot);
    expect(snapshot.freights).toEqual([]);
    expect(snapshot.freightDemands).toEqual([]);
    expect(snapshot.logisticsSettings).toBeNull();
    expect(snapshot.stages.some(isTransportStage)).toBe(false);
    expect(snapshot.prodStages.some((stage) => stage.stage_id === "stage-freight")).toBe(false);
    expect(getPointingStages(snapshot.stages).map((stage) => stage.sort_order)).toEqual([5, 6, 7, 8, 9]);
    expect(snapshot.prods).toEqual(original.prods);
    expect(snapshot.shippingRecords).toEqual(original.shippingRecords);
    expect(demoSnapshot).toEqual(original);
    expect(getAttentionItems(snapshot).some((item) => /frete/i.test(item.reason))).toBe(false);
  });

  it("never schedules queries to logistics tables while keeping production and shipping queries", () => {
    for (const key of ["freightDemands", "freights", "freightStops", "freightRouteHelpers", "logisticsRecipients", "logisticsDrivers", "logisticsVehicles", "logisticsSettings", "extraServices", "extraServiceCatalog"] as const) {
      expect(isSnapshotKeyEnabled(key)).toBe(false);
    }
    expect(isSnapshotKeyEnabled("shippingRecords")).toBe(true);
    expect(isSnapshotKeyEnabled("prodPieceStages")).toBe(true);
  });

  it("rejects all six legacy server actions before touching a database, including forged requests", async () => {
    const actions = await import("../app/actions");
    for (const action of [actions.createFreightAction, actions.updateFreightAction, actions.deleteFreightAction, actions.planFreightDemandAction, actions.createExtraServiceAction, actions.planExtraServiceAction]) {
      expect(await action({ ok: true, message: "" }, new FormData())).toEqual({ ok: false, message: TRANSPORT_DISABLED_MESSAGE });
    }
    expect(databaseAccess.admin).not.toHaveBeenCalled();
    expect(databaseAccess.session).not.toHaveBeenCalled();
  });

  it("rejects both logistics API methods before any database access", async () => {
    const { GET, POST } = await import("../app/api/settings/logistics/route");
    expect((await GET()).status).toBe(410);
    expect((await POST(new Request("http://localhost/api/settings/logistics", { method: "POST", body: "{}" }))).status).toBe(410);
    expect(databaseAccess.admin).not.toHaveBeenCalled();
    expect(databaseAccess.session).not.toHaveBeenCalled();
  });
});
