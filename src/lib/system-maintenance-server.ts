import type { SupabaseClient } from "@supabase/supabase-js";
import type { SystemMaintenance } from "@/lib/types";

export const DEFAULT_MAINTENANCE_MESSAGE =
  "Sistema em manutenção para atualização controlada.";

type QueryError = {
  code?: string;
  message?: string;
};

function isMissingRelation(error?: QueryError | null) {
  if (!error) return false;
  const message = error.message?.toLowerCase() ?? "";

  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    message.includes("could not find the table") ||
    message.includes("schema cache")
  );
}

function fallbackMaintenance(companyId: string): SystemMaintenance {
  return {
    company_id: companyId,
    enabled: false,
    message: DEFAULT_MAINTENANCE_MESSAGE,
    activated_at: null,
    activated_by: null,
    deactivated_at: null,
    deactivated_by: null,
    updated_at: new Date(0).toISOString(),
    updated_by: null,
  };
}

export async function getSystemMaintenanceState(
  client: SupabaseClient,
  companyId: string,
): Promise<SystemMaintenance> {
  const { data, error } = await client
    .from("system_maintenance")
    .select("*")
    .eq("company_id", companyId)
    .maybeSingle();

  if (error) {
    if (isMissingRelation(error)) return fallbackMaintenance(companyId);
    throw error;
  }

  return (data as SystemMaintenance | null) ?? fallbackMaintenance(companyId);
}
