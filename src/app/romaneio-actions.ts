"use server";

import { revalidatePath } from "next/cache";
import { buildExpeditionRomaneioReport, type ExpeditionRomaneioReport } from "@/lib/expedition";
import { isExpeditionArchived } from "@/lib/expedition-archive";
import { toUserFriendlyErrorMessage } from "@/lib/errors";
import { getCurrentPermissionFlags, requireAuthenticatedProfile } from "@/lib/server-access";
import type { Client, ProductionContract, ProductionPiece, ProductionPieceStage, ProductionProd } from "@/lib/types";

export type IssuedRomaneio = {
  id: string;
  number: string;
  created_at: string;
  report: ExpeditionRomaneioReport;
};

type IssueResult = { ok: true; romaneio: IssuedRomaneio } | { ok: false; message: string };

export async function issueRomaneioAction(prodId: string): Promise<IssueResult> {
  if (!/^[0-9a-f-]{36}$/i.test(prodId)) return { ok: false, message: "PROD inválida." };

  try {
    const { admin, profile } = await requireAuthenticatedProfile();
    const access = await getCurrentPermissionFlags([
      "production.pointing.perform", "production.shipping.manage",
    ]);
    if (!access.isMaster && !access.permissions["production.pointing.perform"] &&
        !access.permissions["production.shipping.manage"]) {
      return { ok: false, message: "Sem permissão para emitir romaneio." };
    }

    const { data: prod, error: prodError } = await admin.from("production_prods")
      .select("*").eq("company_id", profile.company_id).eq("id", prodId).maybeSingle();
    if (prodError) throw prodError;
    if (!prod) return { ok: false, message: "PROD não encontrada." };

    const [{ data: contract, error: contractError }, { data: expedition, error: stageError },
      { data: pieces, error: piecesError }, { data: rows, error: rowsError },
      { data: assignments, error: assignmentsError }] = await Promise.all([
      admin.from("production_contracts").select("*").eq("company_id", profile.company_id).eq("id", prod.contract_id).single(),
      admin.from("production_stages").select("id").eq("company_id", profile.company_id).eq("sort_order", 9).single(),
      admin.from("production_prod_pieces").select("*, disposition:production_piece_dispositions(*)")
        .eq("company_id", profile.company_id).eq("prod_id", prodId),
      admin.from("production_prod_piece_stages")
        .select("*, expedition_archive:production_expedition_archives(archived_at,restored_at,reason)")
        .eq("company_id", profile.company_id).eq("prod_id", prodId),
      admin.from("production_romaneio_items").select("piece_stage_id")
        .eq("company_id", profile.company_id).eq("prod_id", prodId),
    ]);
    if (contractError) throw contractError;
    if (stageError) throw stageError;
    if (piecesError) throw piecesError;
    if (rowsError) throw rowsError;
    if (assignmentsError) throw assignmentsError;
    if (!contract || !expedition) return { ok: false, message: "Dados da PROD incompletos." };

    const { data: client, error: clientError } = await admin.from("clients")
      .select("*").eq("company_id", profile.company_id).eq("id", contract.client_id).single();
    if (clientError) throw clientError;
    const assigned = new Set((assignments ?? []).map(item => item.piece_stage_id));
    const activePieces = (pieces ?? []).filter(piece => !piece.disposition?.cancelled_at) as ProductionPiece[];
    const activePieceIds = new Set(activePieces.map(piece => piece.id));
    const eligible = ((rows ?? []) as ProductionPieceStage[]).filter(row =>
      row.stage_id === expedition.id && Number(row.load_volume_count ?? 0) > 0 &&
      activePieceIds.has(row.piece_id) && !isExpeditionArchived(row) && !assigned.has(row.id),
    );
    if (!eligible.length) {
      return { ok: false, message: "Não há peças com volumes salvos sem romaneio nesta PROD." };
    }

    const report = buildExpeditionRomaneioReport({
      client: client as Client,
      contract: contract as ProductionContract,
      prod: prod as ProductionProd,
      pieces: activePieces,
      pieceStages: eligible,
    });
    const { data: id, error: issueError } = await admin.rpc("production_romaneio_issue", {
      p_actor: profile.id,
      p_prod: prodId,
      p_piece_stage_ids: eligible.map(row => row.id),
      p_report: report,
    });
    if (issueError) throw issueError;
    const { data: document, error: documentError } = await admin.from("production_romaneios")
      .select("id,number,created_at,report")
      .eq("company_id", profile.company_id).eq("id", id).single();
    if (documentError) throw documentError;
    revalidatePath(`/prods/${prodId}`);
    return { ok: true, romaneio: document as IssuedRomaneio };
  } catch (error) {
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}
