import { describe, expect, it } from "vitest";
import { isPieceStageDone, isPieceStageUnlocked } from "./pointing";

const stages = [
  { id: "cut", sort_order: 5 },
  { id: "machine", sort_order: 6 },
  { id: "assembly", sort_order: 7 },
  { id: "pack", sort_order: 8 },
  { id: "ship", sort_order: 9 },
];
const row = (stage_id: string, status: string) => ({ piece_id: "piece", stage_id, status });
const queue = (rows: ReturnType<typeof row>[]) =>
  rows.filter((entry) => !isPieceStageDone(entry.status) && isPieceStageUnlocked(entry, rows, stages)).map((entry) => entry.stage_id);

describe("pointing stage queue transitions", () => {
  it("removes a skipped stage while exposing the following stage", () => {
    expect(queue([row("cut", "concluida"), row("machine", "nao_aplicavel"), row("assembly", "aguardando"), row("pack", "nao_iniciada")])).toEqual(["assembly"]);
  });
  it("shows packaging and hides expedition after a return", () => {
    expect(queue([row("assembly", "concluida"), row("pack", "aguardando"), row("ship", "nao_iniciada")])).toEqual(["pack"]);
  });
  it("exposes expedition again after packaging is completed", () => {
    expect(queue([row("assembly", "concluida"), row("pack", "concluida"), row("ship", "aguardando")])).toEqual(["ship"]);
  });
});
