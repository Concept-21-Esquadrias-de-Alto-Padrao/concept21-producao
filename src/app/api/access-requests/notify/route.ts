import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type NotifyRequestBody = {
  requestId?: string;
};

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

type QueueItem = {
  id: string;
  recipient_email: string;
  recipient_name: string | null;
  subject: string;
  body: string;
};

function isServerUserEmailConfirmed(user: { email_confirmed_at?: string | null; confirmed_at?: string | null }) {
  return Boolean(user.email_confirmed_at ?? user.confirmed_at);
}

async function readProviderResponse(response: Response): Promise<Record<string, JsonValue> | null> {
  try {
    const payload = (await response.json()) as JsonValue;

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      return payload as Record<string, JsonValue>;
    }

    return { value: payload };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as NotifyRequestBody;

  if (!body.requestId) {
    return NextResponse.json({ error: "requestId obrigatório." }, { status: 400 });
  }

  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user || !isServerUserEmailConfirmed(user)) {
    return NextResponse.json({ error: "Sessão não autorizada." }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: accessRequest, error: requestError } = await admin
    .from("access_review_requests")
    .select("id, auth_user_id, company_id, status")
    .eq("id", body.requestId)
    .maybeSingle();

  if (requestError) {
    return NextResponse.json({ error: requestError.message }, { status: 500 });
  }

  if (!accessRequest) {
    return NextResponse.json({ error: "Solicitação não encontrada." }, { status: 404 });
  }

  if (accessRequest.auth_user_id !== user.id) {
    const { data: canManage } = await authClient.rpc("has_permission", {
      permission_key: "production.settings.manage_users",
    });

    if (!canManage) {
      return NextResponse.json({ error: "Sem permissão para processar esta solicitação." }, { status: 403 });
    }
  }

  const { data: queuedItems, error: queueError } = await admin
    .from("email_notification_queue")
    .select("*")
    .eq("metadata->>access_request_id", accessRequest.id)
    .eq("status", "queued");

  if (queueError) {
    return NextResponse.json({ error: queueError.message }, { status: 500 });
  }

  const resendApiKey = process.env.RESEND_API_KEY;
  const from = process.env.ACCESS_REQUEST_FROM_EMAIL;
  const items = (queuedItems ?? []) as QueueItem[];

  if (!resendApiKey || !from) {
    return NextResponse.json({
      providerConfigured: false,
      queued: items.length,
      sent: 0,
    });
  }

  let sent = 0;
  let failed = 0;

  for (const item of items) {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: item.recipient_email,
        subject: item.subject,
        text: item.body,
      }),
    });

    const providerResponse = await readProviderResponse(response);

    if (response.ok) {
      sent += 1;
      await admin
        .from("email_notification_queue")
        .update({
          status: "sent",
          provider: "resend",
          provider_response: providerResponse,
          sent_at: new Date().toISOString(),
          error_message: null,
        })
        .eq("id", item.id);
    } else {
      failed += 1;
      await admin
        .from("email_notification_queue")
        .update({
          status: "failed",
          provider: "resend",
          provider_response: providerResponse,
          error_message: response.statusText || "Falha no envio do e-mail.",
        })
        .eq("id", item.id);
    }
  }

  return NextResponse.json({
    providerConfigured: true,
    queued: items.length,
    sent,
    failed,
  });
}
