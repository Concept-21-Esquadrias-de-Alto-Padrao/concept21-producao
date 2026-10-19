export class SupabaseConfigError extends Error {
  constructor() {
    super(
      "Supabase não configurado. Preencha NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY.",
    );
    this.name = "SupabaseConfigError";
  }
}

export function getSupabasePublicConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  return {
    url,
    anonKey,
    isConfigured: Boolean(url && anonKey),
  };
}

export function assertSupabasePublicConfig() {
  const config = getSupabasePublicConfig();

  if (!config.url || !config.anonKey) {
    throw new SupabaseConfigError();
  }

  return {
    url: config.url,
    anonKey: config.anonKey,
  };
}

export function getPublicAppOrigin() {
  const configuredOrigin = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/+$/, "");

  if (configuredOrigin) {
    return configuredOrigin;
  }

  if (typeof window !== "undefined") {
    return window.location.origin;
  }

  return "http://localhost:3000";
}
