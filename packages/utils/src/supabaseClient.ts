import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Vite injects import.meta.env at build time. We read the *public* URL and
// *anon* key only — the service-role key must never be bundled into the
// frontend.
type ViteEnv = {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
};

const readEnv = (): ViteEnv => {
  const meta = import.meta as unknown as { env?: ViteEnv };
  return meta.env ?? {};
};

const requireEnv = (key: keyof ViteEnv): string => {
  const value = readEnv()[key];
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing ${key}. Define it in your .env.local (dev) or repo secrets ` +
        `(GitHub Actions) before building the app.`
    );
  }
  return value;
};

let cachedClient: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient => {
  if (cachedClient) return cachedClient;
  const url = requireEnv("VITE_SUPABASE_URL");
  const anonKey = requireEnv("VITE_SUPABASE_ANON_KEY");

  cachedClient = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: "ilm.auth",
    },
  });
  return cachedClient;
};

export const isSupabaseConfigured = (): boolean => {
  const env = readEnv();
  return Boolean(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY);
};

export type { SupabaseClient };
