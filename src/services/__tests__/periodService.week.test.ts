import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AppError } from "../../errors";
import { createUserSettings } from "../userService";
import {
  createMonthStart,
  createQuarterStart,
  createWeekStart,
  getCurrentWeek,
  setMonthlyGoals,
  setQuarterGoals,
  setWeeklyGoals,
  updateWeekGoalProgress
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
  const email = `hemera.periods+week${Date.now()}@example.com`;
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

describe("periodService (week)", () => {
  let user: { userId: string; accessToken: string };
  let monthGoalIds: string[] = [];

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
    monthGoalIds = (monthDoc.content as { monthlyGoals: { id: string }[] }).monthlyGoals.map(
      (goal) => goal.id
    );
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it("creates week start document", async () => {
    const doc = await createWeekStart(user.userId, user.accessToken, "2026-W02");
    expect(doc.docKey).toBe("2026-W02");
  });

  it("requires weekly goals to link to month goals", async () => {
    await createWeekStart(user.userId, user.accessToken, "2026-W02");
    await expect(
      setWeeklyGoals(user.userId, user.accessToken, "2026-W02", [
        {
          title: "Week goal",
          description: "Plan",
          linkedMonthGoals: ["missing-goal"]
        }
      ])
    ).rejects.toBeInstanceOf(AppError);
  });

  it("updates weekly goal progress", async () => {
    await createWeekStart(user.userId, user.accessToken, "2026-W02");
    const doc = await setWeeklyGoals(user.userId, user.accessToken, "2026-W02", [
      {
        title: "Week goal",
        description: "Plan",
        linkedMonthGoals: [monthGoalIds[0]]
      }
    ]);
    expect(doc.content).toBeTruthy();
    const updated = await updateWeekGoalProgress(
      user.userId,
      user.accessToken,
      "2026-W02",
      0,
      50
    );
    const goals = (updated.content as { weeklyGoals: { progress: number }[] }).weeklyGoals;
    expect(goals[0].progress).toBe(50);
  });

  it("returns current week document", async () => {
    const current = await getCurrentWeek(user.userId, user.accessToken);
    expect(current.docType).toBe("week");
  });
});
