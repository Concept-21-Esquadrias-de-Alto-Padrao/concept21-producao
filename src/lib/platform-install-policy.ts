export const PLATFORM_PROVIDER = "custom:concept21-portal";
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export type PlatformBinding = { authUserId: string; portalAuthUserId: string; portalLinkId: string };
export function parsePlatformInstall(value: unknown, approvedIds: string[]): {
  clientId: string; clientSecret: string; bindings: PlatformBinding[];
} | null {
  if (!value || typeof value !== "object" || !approvedIds.length || approvedIds.some(id => !uuid.test(id))) return null;
  const v = value as Record<string, unknown>;
  if (typeof v.clientId !== "string" || !uuid.test(v.clientId) || typeof v.clientSecret !== "string" ||
      v.clientSecret.length < 16 || v.clientSecret.length > 2048 || !Array.isArray(v.bindings) ||
      v.bindings.length !== new Set(approvedIds).size || v.bindings.length > 50) return null;
  const bindings: PlatformBinding[] = [];
  for (const row of v.bindings) {
    if (!row || typeof row !== "object") return null;
    const b = row as Record<string, unknown>;
    if (![b.authUserId,b.portalAuthUserId,b.portalLinkId].every(id => typeof id === "string" && uuid.test(id)) ||
        !approvedIds.includes(b.authUserId as string) ||
        bindings.some(previous => previous.authUserId === b.authUserId || previous.portalAuthUserId === b.portalAuthUserId ||
          previous.portalLinkId === b.portalLinkId)) return null;
    bindings.push(b as PlatformBinding);
  }
  return {clientId:v.clientId,clientSecret:v.clientSecret,bindings};
}
