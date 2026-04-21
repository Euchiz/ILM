import { createClient, type SupabaseClient } from "@supabase/supabase-js";

declare global {
  interface ImportMetaEnv {
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
  }
  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

// Vite replaces direct `import.meta.env.VITE_*` property reads with string
// literals at build time. The direct access pattern below is REQUIRED for
// that static replacement — going through a helper like `env[key]` leaves
// the references in the bundle as runtime lookups against an empty object
// and breaks the GitHub Pages build. See Vite docs on env variables.
//
// Only the public URL and anon key are read here. The service-role key
// must never be bundled into the frontend.

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

const requireValue = (name: string, value: string | undefined): string => {
  if (!value || value.trim() === "") {
    throw new Error(
      `Missing ${name}. Define it in your .env.local (dev) or repo secrets ` +
        `(GitHub Actions) before building the app.`
    );
  }
  return value;
};

let cachedClient: SupabaseClient | null = null;

export const getSupabaseClient = (): SupabaseClient => {
  if (cachedClient) return cachedClient;
  const url = requireValue("VITE_SUPABASE_URL", SUPABASE_URL);
  const anonKey = requireValue("VITE_SUPABASE_ANON_KEY", SUPABASE_ANON_KEY);

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

export const isSupabaseConfigured = (): boolean =>
  Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export type { SupabaseClient };
