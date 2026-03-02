import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createUserSettings, updateUserSettings } from "../../services/userService";
import { registerDevice } from "../../services/notificationService";
import { getConsecutiveMissedCount, getMissedDays } from "../../services/missedDaysService";
import { runMissedDaysJob } from "../missedDaysJob";

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
  const email = `hemera.missed+${Date.now()}@example.com`;
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

async function createDayDocument(userId: string, dateKey: string, status: string, reflectionComplete: boolean) {
  const reflection = reflectionComplete
    ? {
        wentWell: "Progress",
        whyWentWell: "Focus",
        repeatInFuture: "Plan earlier",
        wentWrong: "Distractions",
        whyWentWrong: "Too many pings",
        doDifferently: "Mute notifications"
      }
    : {
        wentWell: "",
        whyWentWell: "",
        repeatInFuture: "",
        wentWrong: "",
        whyWentWrong: "",
        doDifferently: ""
      };

  await adminClient.from("journal_documents").upsert(
    {
      user_id: userId,
      doc_type: "day",
      doc_key: dateKey,
      status,
      content: {
        dayClose: {
          noScreens2Hours: false,
          noCarbs3Hours: false,
          tomorrowPlanned: false,
          goalsReviewed: false,
          reflection
        }
      },
      client_updated_at: new Date().toISOString()
    },
    { onConflict: "user_id,doc_type,doc_key" }
  );
}

describe("missedDaysJob", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("treats auto-closed day without reflection as missed", async () => {
    const user = await createUser();
    await updateUserSettings(user.userId, user.accessToken, { timezone: "UTC" });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T02:00:00Z"));

    await createDayDocument(user.userId, "2026-02-08", "auto_closed", false);

    const missed = await getMissedDays(user.userId, 10, user.accessToken);
    expect(missed).toContain("2026-02-08");
  });

  it("does not treat closed day as missed", async () => {
    const user = await createUser();
    await updateUserSettings(user.userId, user.accessToken, { timezone: "UTC" });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T02:00:00Z"));

    await createDayDocument(user.userId, "2026-02-08", "closed", true);

    const missed = await getMissedDays(user.userId, 10, user.accessToken);
    expect(missed).toEqual([]);
  });

  it("counts consecutive missed days", async () => {
    const user = await createUser();
    await updateUserSettings(user.userId, user.accessToken, { timezone: "UTC" });

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T02:00:00Z"));

    await createDayDocument(user.userId, "2026-02-08", "auto_closed", false);
    await createDayDocument(user.userId, "2026-02-07", "auto_closed", false);

    const count = await getConsecutiveMissedCount(user.userId, user.accessToken);
    expect(count).toBe(2);
  });

  it("sends notifications for two or more missed days", async () => {
    const user = await createUser();
    await updateUserSettings(user.userId, user.accessToken, {
      timezone: "UTC",
      push_enabled: true,
      email_for_escalations_enabled: true
    });
    await registerDevice(user.userId, user.accessToken, "push-token-1", "device-1", "web");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T02:00:00Z"));
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

    await createDayDocument(user.userId, "2026-02-08", "auto_closed", false);
    await createDayDocument(user.userId, "2026-02-07", "auto_closed", false);

    await runMissedDaysJob();

    const { data: pushLogs } = await adminClient
      .from("notification_log")
      .select("*")
      .eq("user_id", user.userId)
      .eq("type", "missed_2_days_push");
    expect(pushLogs?.length ?? 0).toBe(1);

    const { data: emailLogs } = await adminClient
      .from("notification_log")
      .select("*")
      .eq("user_id", user.userId)
      .eq("type", "missed_2_days_email");
    expect(emailLogs?.length ?? 0).toBe(1);
  });

  it("does not notify for a single missed day", async () => {
    const user = await createUser();
    await updateUserSettings(user.userId, user.accessToken, {
      timezone: "UTC",
      push_enabled: true,
      email_for_escalations_enabled: true
    });
    await registerDevice(user.userId, user.accessToken, "push-token-2", "device-2", "web");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T02:00:00Z"));

    await createDayDocument(user.userId, "2026-02-08", "auto_closed", false);

    await runMissedDaysJob();

    const { data: logs } = await adminClient
      .from("notification_log")
      .select("*")
      .eq("user_id", user.userId)
      .eq("type", "missed_2_days_push");
    expect(logs?.length ?? 0).toBe(0);
  });

  it("sends email only when enabled", async () => {
    const user = await createUser();
    await updateUserSettings(user.userId, user.accessToken, {
      timezone: "UTC",
      push_enabled: true,
      email_for_escalations_enabled: false
    });
    await registerDevice(user.userId, user.accessToken, "push-token-3", "device-3", "web");

    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-11T02:00:00Z"));
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

    await createDayDocument(user.userId, "2026-02-08", "auto_closed", false);
    await createDayDocument(user.userId, "2026-02-07", "auto_closed", false);

    await runMissedDaysJob();

    const { data: pushLogs } = await adminClient
      .from("notification_log")
      .select("*")
      .eq("user_id", user.userId)
      .eq("type", "missed_2_days_push");
    expect(pushLogs?.length ?? 0).toBe(1);

    const { data: emailLogs } = await adminClient
      .from("notification_log")
      .select("*")
      .eq("user_id", user.userId)
      .eq("type", "missed_2_days_email");
    expect(emailLogs?.length ?? 0).toBe(0);
  });
});
