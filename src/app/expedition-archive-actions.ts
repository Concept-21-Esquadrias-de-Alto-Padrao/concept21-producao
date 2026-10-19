"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireMasterAccess } from "@/lib/server-access";
import { toUserFriendlyErrorMessage } from "@/lib/errors";

const selectionSchema = z.array(z.string().uuid()).min(1).max(500);
type State = { ok: boolean; message: string };

export async function setExpeditionArchiveAction(_: State, formData: FormData): Promise<State> {
  try {
    const context = await requireMasterAccess();
    const ids = selectionSchema.parse(formData.getAll("piece_stage_id"));
    const operation = z.enum(["archive", "restore"]).parse(formData.get("operation"));
    const reason = z.string().trim().min(3).max(1000).parse(formData.get("reason"));
    const { data, error } = await context.admin.rpc("set_expedition_archive", {
      p_company_id: context.profile.company_id,
      p_actor_id: context.profile.id,
      p_piece_stage_ids: [...new Set(ids)],
      p_archive: operation === "archive",
      p_reason: reason,
    });
    if (error) throw error;
    revalidatePath("/pointing");
    revalidatePath("/prods", "layout");
    return { ok: true, message: `${data} peça(s) ${operation === "archive" ? "arquivada(s)" : "reativada(s)"}. Histórico preservado.` };
  } catch (error) {
    if (error instanceof z.ZodError) return { ok: false, message: "Selecione as peças e informe um motivo de 3 a 1000 caracteres." };
    return { ok: false, message: toUserFriendlyErrorMessage(error) };
  }
}
