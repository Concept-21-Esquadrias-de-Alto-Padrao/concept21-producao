import { isOperationalProd, lifecycleView } from "./lifecycle";
import { isExpeditionArchived } from "./expedition-archive";
import type { ProductionSnapshot } from "./types";

/** Routine queues exclude closed/cancelled/archived records. Details keep every original fact. */
export function operationalSnapshot(snapshot: ProductionSnapshot): ProductionSnapshot {
  return filterSnapshot(snapshot, new Set(snapshot.prods.filter(p => isOperationalProd(p, snapshot.contracts)).map(p => p.id)), true);
}
/** Reporting excludes archives without deleting their real time entries from the database. */
export function reportableSnapshot(snapshot: ProductionSnapshot): ProductionSnapshot {
  return filterSnapshot(snapshot, new Set(snapshot.prods.filter(p => !["arquivados", "cancelados"].includes(lifecycleView(p)) && !snapshot.contracts.find(c => c.id === p.contract_id)?.lifecycle?.archived_at).map(p => p.id)));
}
function filterSnapshot(snapshot: ProductionSnapshot, prodIds: Set<string>, retainArchivedStages = false): ProductionSnapshot {
  const pieces = snapshot.prodPieces.filter(p => prodIds.has(p.prod_id) && !p.disposition?.cancelled_at);
  const pieceIds = new Set(pieces.map(p => p.id));
  const stages = snapshot.prodPieceStages.filter(p => prodIds.has(p.prod_id) && pieceIds.has(p.piece_id) && (retainArchivedStages || !isExpeditionArchived(p)));
  const stageIds = new Set(stages.map(s => s.id));
  return { ...snapshot,
    prods: snapshot.prods.filter(p => prodIds.has(p.id)),
    contracts: snapshot.contracts.filter(c => !c.lifecycle?.archived_at),
    prodPieces: pieces, prodPieceStages: stages,
    prodStages: snapshot.prodStages.filter(p => prodIds.has(p.prod_id)),
    prodMaterials: snapshot.prodMaterials.filter(p => prodIds.has(p.prod_id)),
    stageTimeEntries: snapshot.stageTimeEntries.filter(e => stageIds.has(e.piece_stage_id)),
    pieceReworks: snapshot.pieceReworks.filter(p => prodIds.has(p.prod_id)),
    pointingSessions: snapshot.pointingSessions.filter(s => s.prod_ids.some(id => prodIds.has(id))),
  };
}
