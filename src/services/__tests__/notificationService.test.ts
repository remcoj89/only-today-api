import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  registerDevice,
  sendEmail,
  sendPushNotification,
  unregisterDevice
} from "../notificationService";
import { createUserSettings } from "../userService";

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required env var: ${key}`);
  }
  return value;
}

const supabaseUrl = requireEnv("SUPABASE_URL");
const anonKey = requireEnv("SUPABASE_ANON_KEY");
const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

const realFetch = globalThis.fetch;

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});
const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false }
});

const createdUserIds: string[] = [];

async function createUser() {
  const email = `hemera.notify+${Date.now()}@example.com`;
  const password = "TestPassword!123";
  const { data, error } = await adminClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "Failed to create test user");
  }
  createdUserIds.push(data.user.id);
  await createUserSettings(data.user.id);
  const signIn = await anonClient.auth.signInWithPassword({ email, password });
  if (signIn.error || !signIn.data.session) {
    throw new Error(signIn.error?.message ?? "Failed to sign in test user");
  }
  return { userId: data.user.id, accessToken: signIn.data.session.access_token };
}

async function cleanupUsers() {
  await Promise.all(
    createdUserIds.map(async (userId) => {
      await adminClient.auth.admin.deleteUser(userId);
    })
  );
}

describe("notificationService", () => {
  let user: { userId: string; accessToken: string };

  beforeAll(async () => {
    user = await createUser();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("registers and unregisters a device", async () => {
    const device = await registerDevice(user.userId, user.accessToken, "push-token-1", "device-1", "web");
    expect(device.device_id).toBe("device-1");

    const { data: rows } = await adminClient
      .from("push_device_tokens")
      .select("*")
      .eq("user_id", user.userId)
      .eq("device_id", "device-1");
    expect(rows?.length).toBe(1);

    await unregisterDevice(user.userId, user.accessToken, "device-1");
    const { data: remaining } = await adminClient
      .from("push_device_tokens")
      .select("*")
      .eq("user_id", user.userId)
      .eq("device_id", "device-1");
    expect(remaining?.length ?? 0).toBe(0);
  });

  it("sends a push notification and logs it", async () => {
    await registerDevice(user.userId, user.accessToken, "push-token-2", "device-2", "web");

    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : (input as URL).href;
      if (url.includes("exp.host")) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { id: "expo-message-1" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }
      return realFetch(input as RequestInfo, init);
    });

    const result = await sendPushNotification(user.userId, {
      type: "day_start",
      title: "Start your day",
      body: "Time to start!",
      data: { screen: "dayStart" },
      targetDate: "2026-02-10"
    });

    expect(result.delivered).toBe(1);

    const { data: logRows } = await adminClient
      .from("notification_log")
      .select("*")
      .eq("user_id", user.userId)
      .eq("type", "day_start")
      .order("sent_at", { ascending: false })
      .limit(1);

    expect(logRows?.[0]?.status).toBe("sent");
  });

  it("sends an email notification and logs it", async () => {
    await sendEmail(user.userId, {
      type: "missed_2_days_email",
      subject: "Reminder",
      body: "You missed two days.",
      targetDate: "2026-02-11"
    });

    const { data: logRows } = await adminClient
      .from("notification_log")
      .select("*")
      .eq("user_id", user.userId)
      .eq("type", "missed_2_days_email")
      .order("sent_at", { ascending: false })
      .limit(1);

    expect(logRows?.[0]?.status).toBe("sent");
  });
});
