import { describe, expect, it } from "vitest";
import { DocType } from "../../shared";
import { validateDocument } from "../documentValidation";

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
    ],
    otherTasks: [
      {
        title: "Optional",
        description: "Nice to have",
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

describe("documentValidation", () => {
  it("accepts valid day document", () => {
    expect(() => validateDocument(DocType.Day, validDayContent)).not.toThrow();
  });

  it("accepts empty oneThing title for partial saves", () => {
    const partial = {
      ...validDayContent,
      planning: {
        ...validDayContent.planning,
        oneThing: { ...validDayContent.planning.oneThing, title: "" }
      }
    };
    expect(() => validateDocument(DocType.Day, partial)).not.toThrow();
  });

  it("rejects topThree with 2 items", () => {
    const invalid = {
      ...validDayContent,
      planning: {
        ...validDayContent.planning,
        topThree: validDayContent.planning.topThree.slice(0, 2)
      }
    };
    expect(() => validateDocument(DocType.Day, invalid)).toThrow();
  });

  it("rejects topThree with 4 items", () => {
    const invalid = {
      ...validDayContent,
      planning: {
        ...validDayContent.planning,
        topThree: [...validDayContent.planning.topThree, validDayContent.planning.topThree[0]]
      }
    };
    expect(() => validateDocument(DocType.Day, invalid)).toThrow();
  });

  it("rejects pomodorosPlanned > 6", () => {
    const invalid = {
      ...validDayContent,
      planning: {
        ...validDayContent.planning,
        oneThing: { ...validDayContent.planning.oneThing, pomodorosPlanned: 7 }
      }
    };
    expect(() => validateDocument(DocType.Day, invalid)).toThrow();
  });

  it("accepts valid quarter document", () => {
    expect(() => validateDocument(DocType.Quarter, validQuarterContent)).not.toThrow();
  });

  it("rejects quarter with 2 goals", () => {
    const invalid = {
      ...validQuarterContent,
      quarterGoals: validQuarterContent.quarterGoals.slice(0, 2)
    };
    expect(() => validateDocument(DocType.Quarter, invalid)).toThrow();
  });

  it("rejects quarter with lifeWheel score > 10", () => {
    const invalid = {
      ...validQuarterContent,
      lifeWheel: { ...validQuarterContent.lifeWheel, health: 11 }
    };
    expect(() => validateDocument(DocType.Quarter, invalid)).toThrow();
  });

  it("accepts empty reflection fields for open day partial saves", () => {
    const partial = {
      ...validDayContent,
      dayClose: {
        ...validDayContent.dayClose,
        reflection: {
          ...validDayContent.dayClose.reflection,
          wentWell: ""
        }
      }
    };
    expect(() => validateDocument(DocType.Day, partial)).not.toThrow();
  });
});
