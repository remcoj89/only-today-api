import { getSupabaseAdminClient } from "./client";

const testUsers = [
  {
    email: "hemera.test+alpha@example.com",
    password: "TestPassword!123"
  },
  {
    email: "hemera.test+beta@example.com",
    password: "TestPassword!123"
  }
];

async function createTestUser(email: string, password: string) {
  const admin = getSupabaseAdminClient();
  const { data: existing } = await admin.auth.admin.listUsers();
  const user = existing?.users.find((entry) => entry.email === email);
  if (user) {
    return user;
  }

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true
  });
  if (error || !data.user) {
    throw new Error(error?.message ?? "Failed to create user");
  }
  return data.user;
}

async function run() {
  const admin = getSupabaseAdminClient();
  const userA = await createTestUser(testUsers[0].email, testUsers[0].password);
  const userB = await createTestUser(testUsers[1].email, testUsers[1].password);

  const now = new Date().toISOString();
  const quarterGoals = [
    {
      id: "q1-goal-1",
      title: "Ship MVP backend",
      smartDefinition: "Deliver Phase 1-3 backend endpoints with tests",
      whatIsDifferent: "Daily progress with clear milestones",
      consequencesIfNot: "Delayed beta launch",
      rewardIfAchieved: "Open beta to early users",
      progress: 15
    },
    {
      id: "q1-goal-2",
      title: "Stabilize reliability",
      smartDefinition: "Keep API tests green for 4 consecutive weeks",
      whatIsDifferent: "Proactive refactors and monitoring",
      consequencesIfNot: "Production incidents",
      rewardIfAchieved: "Confidence to scale",
      progress: 5
    },
    {
      id: "q1-goal-3",
      title: "Launch accountability",
      smartDefinition: "Deliver pairing + summaries + check-ins",
      whatIsDifferent: "Ship MVP feature set early",
      consequencesIfNot: "Lower retention",
      rewardIfAchieved: "Stronger user outcomes",
      progress: 0
    }
  ];

  const monthGoals = [
    {
      id: "m1-goal-1",
      title: "Complete Phase 1",
      description: "Schema, tests, server foundation",
      linkedQuarterGoals: ["q1-goal-1"],
      progress: 40
    }
  ];

  const weekGoals = [
    {
      id: "w1-goal-1",
      title: "Finish database verification",
      description: "Run migrations and RLS tests",
      linkedMonthGoals: ["m1-goal-1"],
      progress: 60
    }
  ];

  const dayContent = {
    dayStart: {
      slept8Hours: true,
      water3Glasses: true,
      meditation5Min: false,
      mobility5Min: true,
      gratefulFor: "Good health",
      intentionForDay: "Focus on Phase 1"
    },
    planning: {
      oneThing: {
        title: "Ship core schema",
        description: "Finalize migrations and tests",
        pomodorosPlanned: 2,
        pomodorosDone: 1
      },
      topThree: [
        {
          title: "Fix seed data",
          description: "Match Start Strong structure",
          pomodorosPlanned: 1,
          pomodorosDone: 1
        },
        {
          title: "Clean debug logs",
          description: "Remove agent log calls",
          pomodorosPlanned: 1,
          pomodorosDone: 0
        },
        {
          title: "Verify tests",
          description: "Run Phase 1 suite",
          pomodorosPlanned: 1,
          pomodorosDone: 0
        }
      ],
      otherTasks: [
        {
          title: "Update docs",
          description: "Sync blueprint checklist"
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
      goalsReviewed: true,
      reflection: {
        wentWell: "Good focus during deep work",
        whyWentWell: "Planned the day clearly",
        repeatInFuture: "Keep pomodoro discipline",
        wentWrong: "Context switching",
        whyWentWrong: "Too many interruptions",
        doDifferently: "Block focus time"
      }
    }
  };

  await admin.from("journal_documents").upsert([
    {
      user_id: userA.id,
      doc_type: "quarter",
      doc_key: "2026-Q1",
      schema_version: 1,
      status: "active",
      content: {
        lifeWheel: {
          work: 7,
          fun: 5,
          social: 6,
          giving: 4,
          money: 6,
          growth: 8,
          health: 7,
          love: 6
        },
        quarterGoals
      },
      client_updated_at: now,
      device_id: "seed"
    },
    {
      user_id: userA.id,
      doc_type: "month",
      doc_key: "2026-01",
      schema_version: 1,
      status: "active",
      content: { monthlyGoals: monthGoals },
      client_updated_at: now,
      device_id: "seed"
    },
    {
      user_id: userA.id,
      doc_type: "week",
      doc_key: "2026-W04",
      schema_version: 1,
      status: "active",
      content: { weeklyGoals: weekGoals },
      client_updated_at: now,
      device_id: "seed"
    }
  ]);

  await admin.from("journal_documents").upsert([
    {
      user_id: userA.id,
      doc_type: "day",
      doc_key: "2026-01-23",
      schema_version: 1,
      status: "closed",
      content: dayContent,
      client_updated_at: now,
      device_id: "seed"
    },
    {
      user_id: userA.id,
      doc_type: "day",
      doc_key: "2026-01-24",
      schema_version: 1,
      status: "open",
      content: dayContent,
      client_updated_at: now,
      device_id: "seed"
    },
    {
      user_id: userA.id,
      doc_type: "day",
      doc_key: "2026-01-22",
      schema_version: 1,
      status: "auto_closed",
      content: dayContent,
      client_updated_at: now,
      device_id: "seed"
    }
  ]);

  const { data: pair, error: pairError } = await admin
    .from("accountability_pairs")
    .upsert({
      user_a_id: [userA.id, userB.id].sort()[0],
      user_b_id: [userA.id, userB.id].sort()[1]
    })
    .select("id")
    .single();

  if (pairError || !pair) {
    throw new Error(pairError?.message ?? "Failed to create accountability pair");
  }

  await admin.from("accountability_daily_checkins").upsert([
    {
      pair_id: pair.id,
      author_user_id: userA.id,
      target_date: "2026-01-24",
      message: "Made solid progress today"
    },
    {
      pair_id: pair.id,
      author_user_id: userB.id,
      target_date: "2026-01-24",
      message: "Wrapped up day close"
    }
  ]);

  console.log("Seed data created");
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
