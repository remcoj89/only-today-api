import { createClient } from "@supabase/supabase-js";
import { formatInTimeZone } from "date-fns-tz";
import { subDays } from "date-fns";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUserSettings } from "../userService";
import {
  getLifePillarStreak,
  getLifePillarsStatus,
  updateLifePillars
} from "../dayWorkflowService";

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
  const email = `hemera.pillars+${Date.now()}@example.com`;
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

describe("dayWorkflowService (pillars)", () => {
  let user: { userId: string; accessToken: string };
  let todayKey: string;
  let yesterdayKey: string;

  beforeAll(async () => {
    user = await createUser();
    todayKey = formatInTimeZone(new Date(), "UTC", "yyyy-MM-dd");
    yesterdayKey = formatInTimeZone(subDays(new Date(), 1), "UTC", "yyyy-MM-dd");
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("updates and reads life pillars", async () => {
    await updateLifePillars(user.userId, user.accessToken, todayKey, {
      training: { completed: true },
      deepRelaxation: { completed: false }
    });
    const pillars = await getLifePillarsStatus(user.userId, user.accessToken, todayKey);
    expect(pillars.training.completed).toBe(true);
    expect(pillars.deepRelaxation.completed).toBe(false);
  });

  it("calculates pillar streaks", async () => {
    await updateLifePillars(user.userId, user.accessToken, todayKey, {
      training: { completed: true }
    });
    await updateLifePillars(user.userId, user.accessToken, yesterdayKey, {
      training: { completed: true }
    });
    const streak = await getLifePillarStreak(user.userId, user.accessToken, "training");
    expect(streak).toBeGreaterThanOrEqual(2);
  });
});
