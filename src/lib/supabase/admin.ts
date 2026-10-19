import { createClient, type SupabaseClient } from "@supabase/supabase-js";

class SupabaseAdminConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SupabaseAdminConfigError";
  }
}

let adminClient: SupabaseClient | null = null;

export function getSupabaseAdminClient() {
  if (!adminClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) {
      throw new SupabaseAdminConfigError("NEXT_PUBLIC_SUPABASE_URL não configurado.");
    }

    if (!serviceRoleKey) {
      throw new SupabaseAdminConfigError("SUPABASE_SERVICE_ROLE_KEY não configurado no ambiente server-side.");
    }

    adminClient = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminClient;
}
