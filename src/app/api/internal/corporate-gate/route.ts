import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function validSecret(header: string | null) {
  const expected = process.env.PORTAL_GATE_SYNC_SECRET;
  if (!expected || expected.length < 32 || !header?.startsWith("Bearer ")) return false;
  const supplied = header.slice(7);
  const left = createHash("sha256").update(supplied).digest();
  const right = createHash("sha256").update(expected).digest();
  return timingSafeEqual(left, right);
}

// Service-to-service gate update. The module keeps its Supabase service key;
// the Portal can only change this dedicated gate through a scoped secret.
export async function POST(request: Request) {
  if (process.env.CORPORATE_GATE_ENABLED !== "true") return NextResponse.json({ error: "Indisponível." }, { status: 404 });
  if (!validSecret(request.headers.get("authorization"))) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  const body: unknown = await request.json().catch(() => null);
  const input = body && typeof body === "object" ? body as Record<string, unknown> : null;
  if (!input || typeof input.authUserId !== "string" || !uuid.test(input.authUserId) ||
      typeof input.portalLinkId !== "string" || !uuid.test(input.portalLinkId) ||
      typeof input.allowed !== "boolean") return NextResponse.json({ error: "Solicitação inválida." }, { status: 400 });
  const { error } = await getSupabaseAdminClient().from("corporate_gate_subjects").upsert({
    auth_user_id: input.authUserId,
    portal_link_id: input.portalLinkId,
    allowed: input.allowed,
    updated_at: new Date().toISOString(),
  }, { onConflict: "auth_user_id" });
  if (error) return NextResponse.json({ error: "Falha ao atualizar vínculo." }, { status: 503 });
  return NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
