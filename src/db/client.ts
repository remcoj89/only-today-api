import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { config } from "../config";

let cachedAnonClient: SupabaseClient | null = null;
let cachedAdminClient: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient {
  if (!cachedAnonClient) {
    cachedAnonClient = createClient(config.supabaseUrl, config.supabaseAnonKey, {
      auth: { persistSession: false }
    });
  }
  return cachedAnonClient;
}

export function getSupabaseAdminClient(): SupabaseClient {
  if (!cachedAdminClient) {
    cachedAdminClient = createClient(config.supabaseUrl, config.supabaseServiceRoleKey, {
      auth: { persistSession: false }
    });
  }
  return cachedAdminClient;
}

export async function healthCheck(): Promise<boolean> {
  const adminClient = getSupabaseAdminClient();
  const { error } = await adminClient.from("user_settings").select("user_id").limit(1);
  return !error;
}
