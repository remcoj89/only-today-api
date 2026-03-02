import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient, healthCheck } from "../client";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

describe("supabase clients", () => {
  it("connects and enforces RLS", async () => {
    const supabaseUrl = requireEnv("SUPABASE_URL");
    const anonKey = requireEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");
    const testEmail = `hemera.test+${Date.now()}@example.com`;
    const testPassword = "TestPassword!123";

    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false }
    });

    const { data: createdUser, error: createUserError } = await admin.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      email_confirm: true
    });

    if (createUserError || !createdUser.user) {
      throw new Error(createUserError?.message ?? "Failed to create test user");
    }

    const anon = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false }
    });

    const signIn = await anon.auth.signInWithPassword({
      email: testEmail,
      password: testPassword
    });

    if (signIn.error || !signIn.data.session) {
      throw new Error(signIn.error?.message ?? "Failed to sign in test user");
    }

    const adminClient = getSupabaseAdminClient();

    const { data: otherUser, error: otherUserError } =
      await adminClient.auth.admin.createUser({
        email: `partner+${Date.now()}@example.com`,
        password: "TestPassword!123",
        email_confirm: true
      });

    if (otherUserError || !otherUser.user) {
      throw new Error(otherUserError?.message ?? "Failed to create partner user");
    }

    await adminClient.from("user_settings").upsert({
      user_id: otherUser.user.id,
      timezone: "UTC"
    });

    const { data: forbiddenData, error: forbiddenError } = await anon
      .from("user_settings")
      .select("user_id")
      .eq("user_id", otherUser.user.id);

    expect(forbiddenError).toBeNull();
    expect(forbiddenData).toEqual([]);

    const { data: adminData, error: adminError } = await adminClient
      .from("user_settings")
      .select("user_id")
      .eq("user_id", otherUser.user.id)
      .single();

    expect(adminError).toBeNull();
    expect(adminData?.user_id).toBe(otherUser.user.id);

    const healthy = await healthCheck();
    expect(healthy).toBe(true);
  });
});
