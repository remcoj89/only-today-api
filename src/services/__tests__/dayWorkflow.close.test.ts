import { createClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "../../errors";
import { createUserSettings } from "../userService";
import { closeDay, completeDayStart, submitReflection } from "../dayWorkflowService";

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

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false }
});
const anonClient = createClient(supabaseUrl, anonKey, {
  auth: { persistSession: false }
});

const createdUserIds: string[] = [];

async function createUser() {
  const email = `hemera.dayclose+${Date.now()}@example.com`;
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

describe("dayWorkflowService (day close)", () => {
  let user: { userId: string; accessToken: string };
  let todayKey: string;

  beforeAll(async () => {
    user = await createUser();
    todayKey = formatInTimeZone(new Date(), "UTC", "yyyy-MM-dd");
    await completeDayStart(user.userId, user.accessToken, todayKey, {
      slept8Hours: true,
      water3Glasses: true,
      meditation5Min: true,
      mobility5Min: true,
      gratefulFor: "Progress",
      intentionForDay: "Consistency"
    });
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("rejects close without reflection", async () => {
    await expect(closeDay(user.userId, user.accessToken, todayKey)).rejects.toBeInstanceOf(AppError);
  });

  it("rejects incomplete reflection submission", async () => {
    await expect(
      submitReflection(user.userId, user.accessToken, todayKey, {
        wentWell: "",
        whyWentWell: "",
        repeatInFuture: "",
        wentWrong: "",
        whyWentWrong: "",
        doDifferently: ""
      })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("closes day with complete reflection and updates summary", async () => {
    await submitReflection(user.userId, user.accessToken, todayKey, {
      wentWell: "Focus",
      whyWentWell: "Planning",
      repeatInFuture: "Start early",
      wentWrong: "Distractions",
      whyWentWrong: "Notifications",
      doDifferently: "Mute alerts"
    });

    const document = await closeDay(user.userId, user.accessToken, todayKey);
    expect(document.status).toBe("closed");

    const { data, error } = await adminClient
      .from("daily_status_summary")
      .select("*")
      .eq("user_id", user.userId)
      .eq("date", todayKey)
      .single();

    expect(error).toBeNull();
    expect(data?.day_closed).toBe(true);
  });
});
