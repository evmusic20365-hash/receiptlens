import { createClient, SupabaseClient } from "@supabase/supabase-js";

// Server-side only — never import this in client components.
// Requires SUPABASE_SERVICE_KEY (service_role), not the anon key.
if (typeof window !== "undefined") {
  throw new Error("supabase-admin must only be imported in server-side code.");
}

let _client: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_client) return _client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_KEY must be set in .env.local");
  _client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return _client;
}

// Lazy proxy — accessing any property triggers lazy init at call time, not module load time
export const supabaseAdmin = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabaseAdmin() as unknown as Record<string | symbol, unknown>)[prop];
  },
});
