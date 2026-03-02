import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUserSettings } from "../userService";
import {
  createMonthStart,
  createQuarterStart,
  createWeekStart,
  setMonthlyGoals,
  setQuarterGoals,
  setWeeklyGoals,
  updateMonthGoalProgress,
  updateQuarterGoalProgress,
  updateWeekGoalProgress
} from "../periodService";
import {
  getGoalHierarchy,
  getPeriodProgress,
  validateMonthBelongsToQuarter,
  validateWeekBelongsToMonth
} from "../periodHierarchy";

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
  const email = `hemera.periods+hier${Date.now()}@example.com`;
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

describe("periodHierarchy", () => {
  let user: { userId: string; accessToken: string };
  let weekGoalIndex = 0;

  beforeAll(async () => {
    user = await createUser();
    await createQuarterStart(user.userId, user.accessToken, "2026-01-01");
    const quarterDoc = await setQuarterGoals(user.userId, user.accessToken, "2026-Q1", quarterGoals);
    const quarterGoalIds = (quarterDoc.content as { quarterGoals: { id: string }[] }).quarterGoals.map(
      (goal) => goal.id
    );
    await createMonthStart(user.userId, user.accessToken, "2026-01");
    const monthDoc = await setMonthlyGoals(user.userId, user.accessToken, "2026-01", [
      {
        title: "Month goal",
        description: "Plan",
        linkedQuarterGoals: [quarterGoalIds[0]]
      }
    ]);
    const monthGoalIds = (monthDoc.content as { monthlyGoals: { id: string }[] }).monthlyGoals.map(
      (goal) => goal.id
    );
    await createWeekStart(user.userId, user.accessToken, "2026-W02");
    await setWeeklyGoals(user.userId, user.accessToken, "2026-W02", [
      {
        title: "Week goal",
        description: "Plan",
        linkedMonthGoals: [monthGoalIds[0]]
      }
    ]);
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("validates month-to-quarter boundaries", () => {
    expect(validateMonthBelongsToQuarter("2026-01", "2026-Q1")).toBe(true);
    expect(validateMonthBelongsToQuarter("2026-04", "2026-Q1")).toBe(false);
  });

  it("validates week-to-month boundaries", () => {
    expect(validateWeekBelongsToMonth("2026-W02", "2026-01")).toBe(true);
    expect(validateWeekBelongsToMonth("2026-W08", "2026-01")).toBe(false);
  });

  it("traces goal hierarchy", async () => {
    const hierarchy = await getGoalHierarchy(user.userId, user.accessToken, weekGoalIndex);
    expect(hierarchy.weekGoal.title).toBe("Week goal");
    expect(hierarchy.monthGoal.title).toBe("Month goal");
    expect(hierarchy.quarterGoal.title).toBe("Goal 1");
  });

  it("aggregates period progress", async () => {
    await updateWeekGoalProgress(user.userId, user.accessToken, "2026-W02", 0, 50);
    await updateMonthGoalProgress(user.userId, user.accessToken, "2026-01", 0, 30);
    await updateQuarterGoalProgress(user.userId, user.accessToken, "2026-Q1", 0, 20);
    const progress = await getPeriodProgress(user.userId, user.accessToken);
    expect(progress.week.progress).toBe(50);
    expect(progress.month.progress).toBe(30);
    expect(progress.quarter.progress).toBeGreaterThanOrEqual(0);
  });
});
