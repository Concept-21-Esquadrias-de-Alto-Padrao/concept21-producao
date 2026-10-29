import type { PointingClient, PointingContract } from "./types";
import { accentDisplayText } from "./utils";

export type PointingContractRow = PointingContract & {
  lifecycle: { archived_at: string | null }[] | { archived_at: string | null } | null;
};

export function isActivePointingContract(contract: PointingContractRow) {
  const lifecycle = contract.lifecycle;
  return !(
    Array.isArray(lifecycle)
      ? lifecycle.some((entry) => Boolean(entry.archived_at))
      : lifecycle?.archived_at
  );
}

// Explicit DTOs: extra columns from a database row cannot reach client props.
export function projectPointingContract(row: PointingContractRow): PointingContract {
  return {
    id: row.id,
    client_id: row.client_id,
    contract_number: row.contract_number,
    work_name: accentDisplayText(row.work_name),
    full_address: accentDisplayText(row.full_address) ?? "",
    street: accentDisplayText(row.street),
    block: accentDisplayText(row.block),
    lot: accentDisplayText(row.lot),
    sector: accentDisplayText(row.sector),
    city: accentDisplayText(row.city) ?? "",
    state: row.state,
    site_contact: accentDisplayText(row.site_contact),
  };
}

export function projectPointingClient(row: PointingClient): PointingClient {
  return { id: row.id, name: accentDisplayText(row.name), phone: row.phone };
}
