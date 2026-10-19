import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  DEFAULT_MAINTENANCE_MESSAGE,
  getSystemMaintenanceState,
} from "@/lib/system-maintenance-server";

export const dynamic = "force-dynamic";

const DEFAULT_COMPANY_SLUG = "concept21";
const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

type PublicMaintenanceStatus = {
  enabled: boolean;
  message: string;
  activated_at: string | null;
  updated_at: string;
};

function fallbackMaintenance(): PublicMaintenanceStatus {
  return {
    enabled: false,
    message: DEFAULT_MAINTENANCE_MESSAGE,
    activated_at: null,
    updated_at: new Date(0).toISOString(),
  };
}

async function getCompanyId() {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("companies")
    .select("id")
    .eq("slug", DEFAULT_COMPANY_SLUG)
    .maybeSingle();

  if (error) throw error;

  return typeof data?.id === "string" ? data.id : null;
}

export async function GET() {
  try {
    const companyId = await getCompanyId();

    if (!companyId) {
      return NextResponse.json(
        { maintenance: fallbackMaintenance() },
        { headers: noStoreHeaders },
      );
    }

    const admin = getSupabaseAdminClient();
    const maintenance = await getSystemMaintenanceState(admin, companyId);

    return NextResponse.json(
      {
        maintenance: {
          enabled: maintenance.enabled,
          message: maintenance.message,
          activated_at: maintenance.activated_at,
          updated_at: maintenance.updated_at,
        } satisfies PublicMaintenanceStatus,
      },
      { headers: noStoreHeaders },
    );
  } catch (error) {
    console.error("Falha ao consultar status público da manutenção", error);

    return NextResponse.json(
      { maintenance: fallbackMaintenance(), unavailable: true },
      { headers: noStoreHeaders },
    );
  }
}
