"use client";

import { createBrowserClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { assertSupabasePublicConfig, getSupabasePublicConfig } from "@/lib/supabase/config";

let browserClient: SupabaseClient | null = null;

export function hasSupabaseBrowserEnv() {
  return getSupabasePublicConfig().isConfigured;
}

export function createSupabaseBrowserClient() {
  if (!browserClient) {
    const config = assertSupabasePublicConfig();
    browserClient = createBrowserClient(config.url, config.anonKey);
  }

  return browserClient;
}

export function createSupabaseCallbackBrowserClient() {
  const config = assertSupabasePublicConfig();

  return createBrowserClient(config.url, config.anonKey, {
    auth: {
      detectSessionInUrl: false,
    },
    isSingleton: false,
  });
}

export function createSupabaseSignupClient() {
  const config = assertSupabasePublicConfig();

  return createClient(config.url, config.anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "implicit",
      persistSession: false,
    },
  });
}
