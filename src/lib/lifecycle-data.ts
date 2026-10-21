import { createSupabaseServerClient, hasSupabaseEnv } from "./supabase/server";
import type { LifecycleEvent, PieceDispatch } from "./lifecycle";

export async function getLifecycleHistory(entityId: string, type: "prod" | "contract") {
  if (!hasSupabaseEnv()) return { events: [] as LifecycleEvent[], dispatches: [] as PieceDispatch[] };
  const db = await createSupabaseServerClient();
  // Keyset pagination: history must not silently stop at PostgREST's row limit.
  async function rows(table: string, field: string) {
    const all: Record<string, unknown>[] = [];
    let after: string | null = null;
    while (true) {
      let query = db.from(table).select("*").eq(field, entityId).order("id").limit(500);
      if (after) query = query.gt("id", after);
      const result = await query;
      if (result.error) throw new Error(`Falha ao carregar histórico: ${result.error.message}`);
      all.push(...result.data);
      if (result.data.length < 500) return all;
      after = String(result.data.at(-1)!.id);
    }
  }
  const [eventRows, dispatchRows] = await Promise.all([
    rows("production_lifecycle_events", type === "prod" ? "prod_id" : "contract_id"),
    type === "prod" ? rows("production_piece_dispatches", "prod_id") : Promise.resolve([]),
  ]);
  const events = eventRows as LifecycleEvent[];
  const dispatches = dispatchRows as PieceDispatch[];
  return { events: events.sort((a,b) => b.occurred_at.localeCompare(a.occurred_at)), dispatches };
}
