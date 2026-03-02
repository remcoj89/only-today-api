export type TaskType = "oneThing" | "topThree" | "other";

export type TaskReference = {
  taskType: TaskType;
  taskIndex?: number;
};

export type PomodoroSession = {
  id: string;
  userId: string;
  dateKey: string;
  taskType: TaskType;
  taskIndex?: number;
  startedAt: string;
  completedAt?: string;
  breakStartedAt?: string;
};
