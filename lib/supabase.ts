import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "./env";

let cached: SupabaseClient | null = null;

// Client serveur avec la cle service_role. A n'utiliser QUE cote serveur.
export function db(): SupabaseClient {
  if (cached) return cached;
  cached = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } }
  );
  return cached;
}
