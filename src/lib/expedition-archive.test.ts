import { describe, expect, it } from "vitest";
import { activeExpeditionArchive, isExpeditionArchived } from "./expedition-archive";

describe("Expedition archive", () => {
  const archive = { archived_at: "2026-10-19T17:00:00Z", restored_at: null, reason: "Saneamento autorizado" };
  it("keeps legacy/unarchived stages visible", () => {
    expect(isExpeditionArchived({})).toBe(false);
    expect(isExpeditionArchived({ expedition_archive: [] })).toBe(false);
  });
  it("recognizes both PostgREST one-to-one and array relationships", () => {
    expect(isExpeditionArchived({ expedition_archive: archive })).toBe(true);
    expect(isExpeditionArchived({ expedition_archive: [archive] })).toBe(true);
  });
  it("restores visibility without changing production status or times", () => {
    const stage = { status: "aguardando", total_productive_seconds: 734,
      expedition_archive: { ...archive, restored_at: "2026-10-20T17:00:00Z" } };
    const before = structuredClone(stage);
    expect(isExpeditionArchived(stage)).toBe(false);
    expect(activeExpeditionArchive(stage.expedition_archive)).toBeNull();
    expect(stage).toEqual(before);
  });
});
