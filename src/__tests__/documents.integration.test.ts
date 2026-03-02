import { createClient } from "@supabase/supabase-js";
import { addDays, addMinutes, format, subDays, subMinutes } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DocType } from "../shared";
import { AppError } from "../errors";
import { createUserSettings } from "../services/userService";
import {
  autoClosePendingDays,
  closeDay,
  getDocument,
  saveDocument
} from "../services/documentService";

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

const validDayContent = {
  dayStart: {
    slept8Hours: true,
    water3Glasses: true,
    meditation5Min: true,
    mobility5Min: true,
    gratefulFor: "Focus",
    intentionForDay: "Ship"
  },
  planning: {
    oneThing: {
      title: "Main task",
      description: "Finish core work",
      pomodorosPlanned: 2,
      pomodorosDone: 1
    },
    topThree: [
      {
        title: "Task 1",
        description: "Desc 1",
        pomodorosPlanned: 1,
        pomodorosDone: 0
      },
      {
        title: "Task 2",
        description: "Desc 2",
        pomodorosPlanned: 1,
        pomodorosDone: 0
      },
      {
        title: "Task 3",
        description: "Desc 3",
        pomodorosPlanned: 1,
        pomodorosDone: 0
      }
    ]
  },
  lifePillars: {
    training: { task: "", completed: false },
    deepRelaxation: { task: "", completed: true },
    healthyNutrition: { task: "", completed: true },
    realConnection: { task: "", completed: false }
  },
  dayClose: {
    noScreens2Hours: false,
    noCarbs3Hours: true,
    tomorrowPlanned: true,
    goalsReviewed: false,
    reflection: {
      wentWell: "Progress",
      whyWentWell: "Focus",
      repeatInFuture: "Plan earlier",
      wentWrong: "Distractions",
      whyWentWrong: "Too many pings",
      doDifferently: "Mute notifications"
    }
  }
};

const validQuarterContent = {
  lifeWheel: {
    work: 7,
    fun: 6,
    social: 5,
    giving: 4,
    money: 6,
    growth: 7,
    health: 8,
    love: 6
  },
  quarterGoals: [
    {
      id: "q1",
      title: "Goal 1",
      smartDefinition: "Specific",
      whatIsDifferent: "Different",
      consequencesIfNot: "Consequences",
      rewardIfAchieved: "Reward",
      progress: 10
    },
    {
      id: "q2",
      title: "Goal 2",
      smartDefinition: "Specific",
      whatIsDifferent: "Different",
      consequencesIfNot: "Consequences",
      rewardIfAchieved: "Reward",
      progress: 20
    },
    {
      id: "q3",
      title: "Goal 3",
      smartDefinition: "Specific",
      whatIsDifferent: "Different",
      consequencesIfNot: "Consequences",
      rewardIfAchieved: "Reward",
      progress: 30
    }
  ]
};

async function createUser() {
  const email = `hemera.integration+${Date.now()}@example.com`;
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

describe("document system integration", () => {
  let user: { userId: string; accessToken: string };

  beforeAll(async () => {
    user = await createUser();
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  it(
    "runs complete day lifecycle",
    async () => {
      const todayKey = formatInTimeZone(new Date(), "UTC", "yyyy-MM-dd");
      await getDocument(user.userId, user.accessToken, DocType.Day, todayKey);
    await saveDocument(
      user.userId,
      user.accessToken,
      DocType.Day,
        todayKey,
      validDayContent,
      new Date().toISOString(),
      "device-a"
    );
      const closed = await closeDay(user.userId, user.accessToken, todayKey, {
      wentWell: "Progress",
      whyWentWell: "Focus",
      repeatInFuture: "Plan earlier",
      wentWrong: "Distractions",
      whyWentWrong: "Too many pings",
      doDifferently: "Mute notifications"
    });

    expect(closed.status).toBe("closed");

      const { data } = await adminClient
      .from("daily_status_summary")
      .select("*")
      .eq("user_id", user.userId)
        .eq("date", todayKey)
      .single();

      expect(data?.day_closed).toBe(true);
    },
    15000
  );

  it("enforces day locking", async () => {
    await expect(
      saveDocument(
        user.userId,
        user.accessToken,
        DocType.Day,
        formatInTimeZone(subDays(new Date(), 3), "UTC", "yyyy-MM-dd"),
        validDayContent,
        new Date().toISOString()
      )
    ).rejects.toBeInstanceOf(AppError);
  });

  it("resolves conflicts using LWW", async () => {
    const docKey = formatInTimeZone(new Date(), "UTC", "yyyy-MM-dd");
    const baseTime = new Date();
    await saveDocument(
      user.userId,
      user.accessToken,
      DocType.Day,
      docKey,
      validDayContent,
      subMinutes(baseTime, 1).toISOString(),
      "device-a"
    );

    const newer = await saveDocument(
      user.userId,
      user.accessToken,
      DocType.Day,
      docKey,
      { ...validDayContent, planning: { ...validDayContent.planning, oneThing: { ...validDayContent.planning.oneThing, title: "Newer" } } },
      addMinutes(baseTime, 1).toISOString(),
      "device-b"
    );

    expect(newer.conflictResolution?.winner).toBe("incoming");

    const older = await saveDocument(
      user.userId,
      user.accessToken,
      DocType.Day,
      docKey,
      { ...validDayContent, planning: { ...validDayContent.planning, oneThing: { ...validDayContent.planning.oneThing, title: "Older" } } },
      subMinutes(baseTime, 2).toISOString(),
      "device-a"
    );

    expect(older.conflictResolution?.winner).toBe("existing");
  });

  it("auto-closes old open days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(subDays(new Date(), 3));
    const pastKey = formatInTimeZone(new Date(), "UTC", "yyyy-MM-dd");
    await saveDocument(
      user.userId,
      user.accessToken,
      DocType.Day,
      pastKey,
      validDayContent,
      new Date().toISOString()
    );

    vi.useRealTimers();
    const closedCount = await autoClosePendingDays(user.userId, user.accessToken);
    expect(closedCount).toBeGreaterThan(0);
  });

  it("saves quarter Start Strong document", async () => {
    const result = await saveDocument(
      user.userId,
      user.accessToken,
      DocType.Quarter,
      format(addDays(new Date(), 1), "yyyy-'Q'Q"),
      validQuarterContent,
      new Date().toISOString()
    );

    expect(result.document.docType).toBe(DocType.Quarter);
  });
});
