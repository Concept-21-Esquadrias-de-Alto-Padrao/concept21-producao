"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireAuthenticatedProfile } from "@/lib/server-access";
import { hasSupabaseEnv } from "@/lib/supabase/server";

const commandSchema = z.object({
  entity: z.string().uuid(),
  command: z.enum(["dispatch", "return_dispatch", "cancel_pieces", "restore_pieces", "confirm_scope", "reopen_scope", "close_contract", "reopen_contract", "archive_prod", "restore_prod", "archive_contract", "restore_contract", "reopen_historical_prod"]),
  reason: z.string().trim().min(3).max(1000),
  pieces: z.array(z.string().uuid()).max(500),
  reference: z.string().trim().max(200).nullable(),
  confirmed: z.literal("yes"),
});
export async function lifecycleAction(_: { ok: boolean; message: string }, form: FormData) {
  if (!hasSupabaseEnv()) return { ok: false, message: "Demonstração: nenhuma alteração foi gravada." };
  const parsed = commandSchema.safeParse({
    entity: form.get("entity"), command: form.get("command"), reason: form.get("reason"),
    pieces: form.getAll("piece_id"), reference: form.get("reference"), confirmed: form.get("confirmed"),
  });
  if (!parsed.success) return { ok: false, message: "Confira a seleção, o motivo e a confirmação da operação." };
  try {
    const context = await requireAuthenticatedProfile();
    const { data: userData, error: userError } = await context.admin.auth.admin.getUserById(context.authUserId);
    if (userError || !userData.user?.email_confirmed_at) return { ok: false, message: "É necessário um usuário ativo com e-mail confirmado." };
    const value = parsed.data;
    const { data, error } = value.command === "reopen_historical_prod"
      ? await context.admin.rpc("production_reopen_historical_prod", {
          p_actor: context.profile.id, p_prod: value.entity, p_reason: value.reason,
        })
      : await context.admin.rpc("production_lifecycle_command", {
          p_actor: context.profile.id, p_entity: value.entity, p_command: value.command,
          p_reason: value.reason, p_piece_ids: value.pieces, p_reference: value.reference,
        });
    if (error) return { ok: false, message: error.message };
    for (const path of ["/", "/prods", "/contracts", "/pointing", "/reports", "/archives"]) revalidatePath(path);
    if (data?.prod_id) revalidatePath(`/prods/${data.prod_id}`);
    if (data?.contract_id) revalidatePath(`/contracts/${data.contract_id}`);
    return { ok: true, message: "Operação registrada e situação recalculada." };
  } catch (error) {
    return { ok: false, message: error instanceof Error ? error.message : "Não foi possível registrar a operação." };
  }
}
