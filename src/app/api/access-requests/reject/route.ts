import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";

type RejectRequestBody = {
  profileId?: string;
};

type QueryError = {
  code?: string;
  message?: string;
};

function isMissingRelation(error?: QueryError | null) {
  if (!error) return false;
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    error.message?.toLowerCase().includes("could not find the table")
  );
}

async function ignoreMissingRelation<T extends { error: QueryError | null }>(
  promise: PromiseLike<T>,
) {
  const result = await promise;
  if (result.error && !isMissingRelation(result.error)) {
    return result.error;
  }

  return null;
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as RejectRequestBody;

  if (!body.profileId) {
    return NextResponse.json({ error: "profileId obrigatório." }, { status: 400 });
  }

  const authClient = await createSupabaseServerClient();
  const {
    data: { user },
  } = await authClient.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Sessão não autorizada." }, { status: 401 });
  }

  const admin = getSupabaseAdminClient();
  const { data: requesterProfile, error: requesterProfileError } = await admin
    .from("profiles")
    .select("id, company_id, status, is_master")
    .eq("user_id", user.id)
    .maybeSingle();

  if (requesterProfileError) {
    return NextResponse.json({ error: requesterProfileError.message }, { status: 500 });
  }

  if (!requesterProfile || requesterProfile.status !== "active") {
    return NextResponse.json({ error: "Somente usuários administradores podem excluir cadastros." }, { status: 403 });
  }

  const { data: requesterMasterRole, error: requesterRoleError } = await admin
    .from("user_roles")
    .select("id, role:roles!inner(is_master_role, active)")
    .eq("profile_id", requesterProfile.id)
    .eq("role.is_master_role", true)
    .eq("role.active", true)
    .maybeSingle();

  if (requesterRoleError) {
    return NextResponse.json({ error: requesterRoleError.message }, { status: 500 });
  }

  if (!requesterProfile.is_master && !requesterMasterRole) {
    return NextResponse.json({ error: "Somente usuários administradores podem excluir cadastros." }, { status: 403 });
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, company_id, user_id, email, name")
    .eq("id", body.profileId)
    .maybeSingle();

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 500 });
  }

  if (!profile || profile.company_id !== requesterProfile.company_id) {
    return NextResponse.json({ error: "Perfil não encontrado." }, { status: 404 });
  }

  if (profile.user_id === user.id) {
    return NextResponse.json({ error: "Você não pode excluir o próprio cadastro." }, { status: 400 });
  }

  const notificationError = await ignoreMissingRelation(
    admin.from("platform_notifications").delete().eq("metadata->>profile_id", profile.id),
  );
  if (notificationError) {
    return NextResponse.json({ error: notificationError.message }, { status: 500 });
  }

  const queueError = await ignoreMissingRelation(
    admin.from("email_notification_queue").delete().eq("metadata->>profile_id", profile.id),
  );
  if (queueError) {
    return NextResponse.json({ error: queueError.message }, { status: 500 });
  }

  if (profile.user_id) {
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(profile.user_id);

    if (deleteUserError) {
      return NextResponse.json({ error: deleteUserError.message }, { status: 500 });
    }
  } else {
    const { error: deleteProfileError } = await admin.from("profiles").delete().eq("id", profile.id);

    if (deleteProfileError) {
      return NextResponse.json({ error: deleteProfileError.message }, { status: 500 });
    }
  }

  return NextResponse.json({ ok: true });
}
