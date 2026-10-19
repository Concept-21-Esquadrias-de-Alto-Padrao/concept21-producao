import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import {
  getErrorMessage,
  getHttpStatus,
  HttpError,
  requireMasterAccess,
} from "@/lib/server-access";
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  getSystemMaintenanceState,
} from "@/lib/system-maintenance-server";

type SystemActionBody = {
  enabled?: unknown;
};

function jsonError(error: unknown, fallback: string) {
  return NextResponse.json(
    { error: getErrorMessage(error, fallback) },
    { status: getHttpStatus(error) },
  );
}

export async function GET() {
  try {
    const context = await requireMasterAccess();
    const maintenance = await getSystemMaintenanceState(
      context.admin,
      context.profile.company_id,
    );

    return NextResponse.json({
      maintenance,
      isMaster: true,
      currentProfileId: context.profile.id,
    });
  } catch (error) {
    return jsonError(error, "Não foi possível carregar a manutenção do sistema.");
  }
}

export async function POST(request: Request) {
  try {
    const context = await requireMasterAccess();
    const body = (await request.json().catch(() => ({}))) as SystemActionBody;

    if (typeof body.enabled !== "boolean") {
      throw new HttpError(400, "Informe se a manutenção deve ficar ativa ou inativa.");
    }

    const now = new Date().toISOString();
    const current = await getSystemMaintenanceState(
      context.admin,
      context.profile.company_id,
    );
    const payload = {
      company_id: context.profile.company_id,
      enabled: body.enabled,
      message: DEFAULT_MAINTENANCE_MESSAGE,
      activated_at: body.enabled ? now : current.activated_at,
      activated_by: body.enabled ? context.profile.id : current.activated_by,
      deactivated_at: body.enabled ? null : now,
      deactivated_by: body.enabled ? null : context.profile.id,
      updated_at: now,
      updated_by: context.profile.id,
    };

    const { error } = await context.admin
      .from("system_maintenance")
      .upsert(payload, { onConflict: "company_id" });

    if (error) throw new HttpError(500, error.message);

    revalidatePath("/");
    revalidatePath("/settings");

    const maintenance = await getSystemMaintenanceState(
      context.admin,
      context.profile.company_id,
    );

    return NextResponse.json({
      ok: true,
      maintenance,
      isMaster: true,
      currentProfileId: context.profile.id,
    });
  } catch (error) {
    return jsonError(error, "Não foi possível alterar a manutenção do sistema.");
  }
}
