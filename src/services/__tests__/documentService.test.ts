import { createClient } from "@supabase/supabase-js";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { DocType } from "../../shared";
import { AppError } from "../../errors";
import { createUserSettings } from "../userService";
import { autoClosePendingDays, closeDay, getDocument, saveDocument } from "../documentService";

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
      pomodorosDone: 0
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

async function createUser() {
  const email = `hemera.docservice+${Date.now()}@example.com`;
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

describe("documentService", () => {
  let user: { userId: string; accessToken: string };

  beforeAll(async () => {
    user = await createUser();
  });

  afterAll(async () => {
    await cleanupUsers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates a new document if missing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-02T10:00:00Z"));

    const doc = await getDocument(user.userId, user.accessToken, DocType.Day, "2026-02-03");
    expect(doc.docKey).toBe("2026-02-03");

    vi.useRealTimers();
  });

  it("returns existing document", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-02T10:00:00Z"));

    const first = await getDocument(user.userId, user.accessToken, DocType.Day, "2026-02-03");
    const second = await getDocument(user.userId, user.accessToken, DocType.Day, "2026-02-03");
    expect(second.id).toBe(first.id);

    vi.useRealTimers();
  });

  it("throws for unavailable day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-01T00:00:00Z"));

    await expect(
      getDocument(user.userId, user.accessToken, DocType.Day, "2026-02-03")
    ).rejects.toBeInstanceOf(AppError);

    vi.useRealTimers();
  });

  it("saves valid documents", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-02T10:00:00Z"));

    const result = await saveDocument(
      user.userId,
      user.accessToken,
      DocType.Day,
      "2026-02-02",
      validDayContent,
      new Date().toISOString(),
      "device-a"
    );

    expect(result.document.docKey).toBe("2026-02-02");

    vi.useRealTimers();
  });

  it("rejects invalid content (wrong structure)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-02T10:00:00Z"));

    const invalid = {
      ...validDayContent,
      planning: {
        ...validDayContent.planning,
        topThree: validDayContent.planning.topThree.slice(0, 2)
      }
    };

    await expect(
      saveDocument(
        user.userId,
        user.accessToken,
        DocType.Day,
        "2026-02-02",
        invalid,
        new Date().toISOString()
      )
    ).rejects.toBeInstanceOf(AppError);

    vi.useRealTimers();
  });

  it("rejects locked day saves", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-05T12:00:00Z"));

    await expect(
      saveDocument(
        user.userId,
        user.accessToken,
        DocType.Day,
        "2026-02-01",
        validDayContent,
        new Date().toISOString()
      )
    ).rejects.toBeInstanceOf(AppError);

    vi.useRealTimers();
  });

  it("requires reflection to close day", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-02T12:00:00Z"));

    await expect(
      closeDay(user.userId, user.accessToken, "2026-02-02", {
        wentWell: "",
        whyWentWell: "",
        repeatInFuture: "",
        wentWrong: "",
        whyWentWrong: "",
        doDifferently: ""
      })
    ).rejects.toBeInstanceOf(AppError);

    vi.useRealTimers();
  });

  it("updates status summary on close", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-02-02T12:00:00Z"));

    await saveDocument(
      user.userId,
      user.accessToken,
      DocType.Day,
      "2026-02-02",
      validDayContent,
      new Date().toISOString()
    );

    const closed = await closeDay(user.userId, user.accessToken, "2026-02-02", {
      wentWell: "Progress",
      whyWentWell: "Focus",
      repeatInFuture: "Plan earlier",
      wentWrong: "Distractions",
      whyWentWrong: "Too many pings",
      doDifferently: "Mute notifications"
    });

    const { data } = await adminClient
      .from("daily_status_summary")
      .select("*")
      .eq("user_id", user.userId)
      .eq("date", "2026-02-02")
      .single();

    expect(closed.status).toBe("closed");
    expect(data?.day_closed).toBe(true);

    vi.useRealTimers();
  });

  it("auto-closes old open days", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-02-01T12:00:00Z"));

    await saveDocument(
      user.userId,
      user.accessToken,
      DocType.Day,
      "2026-01-31",
      validDayContent,
      new Date().toISOString()
    );

    vi.setSystemTime(new Date("2026-02-03T12:00:00Z"));
    const closedCount = await autoClosePendingDays(user.userId, user.accessToken);
    expect(closedCount).toBeGreaterThan(0);

    vi.useRealTimers();
  });
});
