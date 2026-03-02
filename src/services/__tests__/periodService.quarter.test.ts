import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "../../errors";
import { createUserSettings } from "../userService";
import {
  createQuarterStart,
  setQuarterGoals,
  updateLifeWheel,
  updateQuarterGoalProgress
} from "../periodService";

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
  const email = `hemera.periods+${Date.now()}@example.com`;
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

const quarterGoals = [
  {
    title: "Goal 1",
    smartDefinition: "Specific",
    whatIsDifferent: "Different",
    consequencesIfNot: "Consequences",
    rewardIfAchieved: "Reward"
  },
  {
    title: "Goal 2",
    smartDefinition: "Specific",
    whatIsDifferent: "Different",
    consequencesIfNot: "Consequences",
    rewardIfAchieved: "Reward"
  },
  {
    title: "Goal 3",
    smartDefinition: "Specific",
    whatIsDifferent: "Different",
    consequencesIfNot: "Consequences",
    rewardIfAchieved: "Reward"
  }
];

describe("periodService (quarter)", () => {
  let user: { userId: string; accessToken: string };

  beforeAll(async () => {
    user = await createUser();
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("creates quarter start document", async () => {
    const doc = await createQuarterStart(user.userId, user.accessToken, "2026-01-01");
    expect(doc.docKey).toBe("2026-Q1");
  });

  it("rejects missing life wheel fields", async () => {
    await createQuarterStart(user.userId, user.accessToken, "2026-01-01");
    await expect(
      updateLifeWheel(user.userId, user.accessToken, "2026-Q1", {
        work: 7,
        fun: 6,
        social: 5,
        giving: 4,
        money: 6,
        growth: 7,
        health: 8
      } as unknown as Record<string, number>)
    ).rejects.toBeInstanceOf(AppError);
  });

  it("rejects life wheel scores outside 1-10", async () => {
    await expect(
      updateLifeWheel(user.userId, user.accessToken, "2026-Q1", {
        work: 7,
        fun: 6,
        social: 5,
        giving: 4,
        money: 6,
        growth: 7,
        health: 11,
        love: 6
      })
    ).rejects.toBeInstanceOf(AppError);
  });

  it("requires exactly 3 quarter goals", async () => {
    await expect(
      setQuarterGoals(user.userId, user.accessToken, "2026-Q1", quarterGoals.slice(0, 2))
    ).rejects.toBeInstanceOf(AppError);
  });

  it("updates goal progress within bounds", async () => {
    await setQuarterGoals(user.userId, user.accessToken, "2026-Q1", quarterGoals);
    const updated = await updateQuarterGoalProgress(
      user.userId,
      user.accessToken,
      "2026-Q1",
      1,
      40
    );
    const goals = (updated.content as { quarterGoals: { progress: number }[] }).quarterGoals;
    expect(goals[1].progress).toBe(40);
  });

  it("rejects invalid progress values", async () => {
    await expect(
      updateQuarterGoalProgress(user.userId, user.accessToken, "2026-Q1", 0, 101)
    ).rejects.toBeInstanceOf(AppError);
  });
});
