import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "../errors";
import { createUserSettings } from "../services/userService";
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
} from "../services/periodService";
import { getGoalHierarchy, getPeriodProgress } from "../services/periodHierarchy";

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
  const email = `hemera.periods+integration${Date.now()}@example.com`;
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

describe("periods integration", () => {
  let user: { userId: string; accessToken: string };
  let quarterGoalIds: string[] = [];
  let monthGoalIds: string[] = [];

  beforeAll(async () => {
    user = await createUser();
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("runs complete period setup flow", async () => {
    await createQuarterStart(user.userId, user.accessToken, "2026-01-01");
    const quarterDoc = await setQuarterGoals(user.userId, user.accessToken, "2026-Q1", quarterGoals);
    quarterGoalIds = (quarterDoc.content as { quarterGoals: { id: string }[] }).quarterGoals.map(
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
    monthGoalIds = (monthDoc.content as { monthlyGoals: { id: string }[] }).monthlyGoals.map(
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

    const hierarchy = await getGoalHierarchy(user.userId, user.accessToken, 0);
    expect(hierarchy.quarterGoal.id).toBe(quarterGoalIds[0]);
  }, 15000);

  it("aggregates progress across periods", async () => {
    await updateWeekGoalProgress(user.userId, user.accessToken, "2026-W02", 0, 50);
    await updateMonthGoalProgress(user.userId, user.accessToken, "2026-01", 0, 30);
    await updateQuarterGoalProgress(user.userId, user.accessToken, "2026-Q1", 0, 20);

    const progress = await getPeriodProgress(user.userId, user.accessToken);
    expect(progress.week.progress).toBe(50);
    expect(progress.month.progress).toBe(30);
    expect(progress.quarter.progress).toBeGreaterThanOrEqual(0);
  });

  it("rejects invalid linking", async () => {
    await expect(
      setMonthlyGoals(user.userId, user.accessToken, "2026-01", [
        {
          title: "Bad link",
          description: "Invalid",
          linkedQuarterGoals: ["missing"]
        }
      ])
    ).rejects.toBeInstanceOf(AppError);
  });

  it("supports period navigation via hierarchy", async () => {
    const hierarchy = await getGoalHierarchy(user.userId, user.accessToken, 0);
    expect(hierarchy.weekGoal.title).toBe("Week goal");
  });
});
