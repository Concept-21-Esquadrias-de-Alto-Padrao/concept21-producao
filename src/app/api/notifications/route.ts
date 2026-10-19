import { NextResponse } from "next/server";
import {
  getErrorMessage,
  getHttpStatus,
  HttpError,
  isMissingRelation,
  requireAuthenticatedProfile,
} from "@/lib/server-access";
import type { PlatformNotification } from "@/lib/types";

type MarkReadBody = {
  notificationId?: unknown;
};

function text(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonError(error: unknown, fallback: string) {
  return NextResponse.json(
    { error: getErrorMessage(error, fallback) },
    { status: getHttpStatus(error) },
  );
}

export async function GET(request: Request) {
  try {
    const context = await requireAuthenticatedProfile();
    const url = new URL(request.url);
    const limitParam = Number(url.searchParams.get("limit") ?? 6);
    const limit = Number.isInteger(limitParam) && limitParam > 0 ? Math.min(limitParam, 20) : 6;

    const { data, error } = await context.admin
      .from("platform_notifications")
      .select("*")
      .or(
        `recipient_profile_id.eq.${context.profile.id},recipient_auth_user_id.eq.${context.authUserId}`,
      )
      .is("read_at", null)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      if (isMissingRelation(error)) {
        return NextResponse.json({ notifications: [] });
      }

      throw new HttpError(500, error.message);
    }

    return NextResponse.json({ notifications: (data ?? []) as PlatformNotification[] });
  } catch (error) {
    return jsonError(error, "Não foi possível carregar as notificações.");
  }
}

export async function PATCH(request: Request) {
  try {
    const context = await requireAuthenticatedProfile();
    const body = (await request.json().catch(() => ({}))) as MarkReadBody;
    const notificationId = text(body.notificationId);

    if (!notificationId) {
      throw new HttpError(400, "Notificação inválida.");
    }

    const { data: notification, error: readError } = await context.admin
      .from("platform_notifications")
      .select("id, recipient_profile_id, recipient_auth_user_id")
      .eq("id", notificationId)
      .maybeSingle();

    if (readError) {
      if (isMissingRelation(readError)) {
        return NextResponse.json({ ok: true });
      }

      throw new HttpError(500, readError.message);
    }

    if (!notification) {
      throw new HttpError(404, "Notificação não encontrada.");
    }

    const isRecipient =
      notification.recipient_profile_id === context.profile.id ||
      notification.recipient_auth_user_id === context.authUserId;

    if (!isRecipient) {
      throw new HttpError(403, "Você não pode alterar esta notificação.");
    }

    const { error: updateError } = await context.admin
      .from("platform_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("id", notificationId);

    if (updateError) throw new HttpError(500, updateError.message);

    return NextResponse.json({ ok: true });
  } catch (error) {
    return jsonError(error, "Não foi possível atualizar a notificação.");
  }
}
