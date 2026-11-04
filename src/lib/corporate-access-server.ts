export async function checkCorporateAccess(token: string): Promise<"allowed" | "revoked" | "unavailable"> {
  if (process.env.CORPORATE_GATE_ENABLED !== "true") return "allowed";
  const endpoint = process.env.PORTAL_CORPORATE_ACCESS_URL;
  if (!endpoint || !token) return "unavailable";
  try {
    const url = new URL(endpoint);
    if (url.protocol !== "https:" || url.pathname !== "/api/internal/module-access" ||
        url.username || url.password || url.search || url.hash) return "unavailable";
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ moduleKey: "production" }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (response.ok) return "allowed";
    if (response.status === 403 || response.status === 401) return "revoked";
  } catch { /* Fail closed if Portal is unavailable. */ }
  return "unavailable";
}
