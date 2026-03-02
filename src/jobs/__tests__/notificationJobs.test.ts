import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { formatDateKey } from "../../utils/dateUtils";
import { createUserSettings, updateUserSettings } from "../../services/userService";
import { registerDevice } from "../../services/notificationService";
import { closeDay, submitReflection } from "../../services/dayWorkflowService";
import { runDayCloseReminders, runDayStartReminders } from "../notificationJobs";

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
  const email = `hemera.jobs+${Date.now()}@example.com`;
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

const reflection = {
  wentWell: "Progress",
  whyWentWell: "Focus",
  repeatInFuture: "Plan earlier",
  wentWrong: "Distractions",
  whyWentWrong: "Too many pings",
  doDifferently: "Mute notifications"
};

describe("notification jobs", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("sends day start reminders for matching time", async () => {
    const user = await createUser();
    await updateUserSettings(user.userId, user.accessToken, {
      day_start_reminder_time: "08:00",
      push_enabled: true,
      timezone: "UTC"
    });
    await registerDevice(user.userId, user.accessToken, "push-token-1", "device-1", "web");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-12T08:00:00Z"));
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : (input as URL).href;
      if (url.includes("exp.host")) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { id: "expo-1" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }
      return realFetch(input as RequestInfo, init);
    });

    await runDayStartReminders();

    const { data } = await adminClient
      .from("notification_log")
      .select("*")
      .eq("user_id", user.userId)
      .eq("type", "day_start");
    expect(data?.length ?? 0).toBe(1);
  });

  it("skips day close reminders when day is closed", async () => {
    const user = await createUser();
    await updateUserSettings(user.userId, user.accessToken, {
      day_close_reminder_time: "21:00",
      push_enabled: true,
      timezone: "UTC"
    });
    await registerDevice(user.userId, user.accessToken, "push-token-2", "device-2", "web");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-12T21:00:00Z"));

    const dateKey = formatDateKey(new Date(), "UTC");
    await adminClient.from("journal_documents").upsert(
      {
        user_id: user.userId,
        doc_type: "day",
        doc_key: dateKey,
        status: "closed",
        content: {},
        client_updated_at: new Date().toISOString()
      },
      { onConflict: "user_id,doc_type,doc_key" }
    );

    await runDayCloseReminders();

    const { data } = await adminClient
      .from("notification_log")
      .select("*")
      .eq("user_id", user.userId)
      .eq("type", "day_close");
    expect(data?.length ?? 0).toBe(0);
  });

  it("notifies partner when a day is closed", async () => {
    const userA = await createUser();
    const userB = await createUser();
    await updateUserSettings(userB.userId, userB.accessToken, { push_enabled: true, timezone: "UTC" });
    await registerDevice(userB.userId, userB.accessToken, "push-token-3", "device-3", "web");

    const [userAId, userBId] = userA.userId < userB.userId ? [userA.userId, userB.userId] : [userB.userId, userA.userId];
    await adminClient.from("accountability_pairs").insert({
      user_a_id: userAId,
      user_b_id: userBId
    });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-14T12:00:00Z"));
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : (input as URL).href;
      if (url.includes("exp.host")) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { id: "expo-2" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }
      return realFetch(input as RequestInfo, init);
    });

    await submitReflection(userA.userId, userA.accessToken, "2026-02-14", reflection);
    await closeDay(userA.userId, userA.accessToken, "2026-02-14");

    const { data } = await adminClient
      .from("notification_log")
      .select("*")
      .eq("user_id", userB.userId)
      .eq("type", "partner_closed");
    expect(data?.length ?? 0).toBe(1);
  });

  it("respects user timezones when sending reminders", async () => {
    const user = await createUser();
    await updateUserSettings(user.userId, user.accessToken, {
      day_start_reminder_time: "07:30",
      push_enabled: true,
      timezone: "America/New_York"
    });
    await registerDevice(user.userId, user.accessToken, "push-token-4", "device-4", "web");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-12T12:30:00Z"));
    vi.spyOn(globalThis, "fetch").mockImplementation((input, init) => {
      const url = typeof input === "string" ? input : (input as URL).href;
      if (url.includes("exp.host")) {
        return Promise.resolve(
          new Response(JSON.stringify({ data: { id: "expo-3" } }), {
            status: 200,
            headers: { "Content-Type": "application/json" }
          })
        );
      }
      return realFetch(input as RequestInfo, init);
    });

    await runDayStartReminders();

    const { data } = await adminClient
      .from("notification_log")
      .select("*")
      .eq("user_id", user.userId)
      .eq("type", "day_start");
    expect(data?.length ?? 0).toBe(1);
  });
});
