export function secureOrigin(value: string | undefined | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.pathname === "/" && !url.username &&
      !url.password && !url.search && !url.hash ? url.origin : null;
  } catch { return null; }
}

export function trustedReferrer(value: string | null, origins: Array<string | null>): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password &&
      origins.some((origin) => origin !== null && url.origin === origin);
  } catch { return false; }
}

export async function endBrowserSession(auth: {
  signOut: (options: { scope: "local" }) => Promise<{ error: unknown }>;
}): Promise<void> {
  const { error } = await auth.signOut({ scope: "local" });
  if (error) throw new Error("Não foi possível encerrar a sessão. Tente novamente.");
}
