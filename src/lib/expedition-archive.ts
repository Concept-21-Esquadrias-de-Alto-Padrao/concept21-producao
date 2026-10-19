export type ExpeditionArchive = {
  archived_at: string;
  restored_at: string | null;
  reason: string;
};

export function activeExpeditionArchive(
  value: ExpeditionArchive | ExpeditionArchive[] | null | undefined,
) {
  const rows = Array.isArray(value) ? value : value ? [value] : [];
  return rows.find((row) => row.archived_at && !row.restored_at) ?? null;
}

export function isExpeditionArchived(row: {
  expedition_archive?: ExpeditionArchive | ExpeditionArchive[] | null;
}) {
  return Boolean(activeExpeditionArchive(row.expedition_archive));
}
