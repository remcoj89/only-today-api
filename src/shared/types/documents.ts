export enum DocType {
  Day = "day",
  Week = "week",
  Month = "month",
  Quarter = "quarter"
}

export enum DocStatus {
  Open = "open",
  Closed = "closed",
  AutoClosed = "auto_closed"
}

export type TaskItem = {
  title: string;
  description: string;
  pomodorosPlanned: number;
  pomodorosDone: number;
};

export type OtherTaskItem = {
  title: string;
  description?: string;
  pomodorosPlanned?: number;
  pomodorosDone?: number;
};

export interface DocumentBase {
  id: string;
  userId: string;
  docType: DocType;
  docKey: string;
  schemaVersion: number;
  status: DocStatus | "active" | "archived";
  content: Record<string, unknown>;
  clientUpdatedAt: string;
  serverReceivedAt: string;
  deviceId?: string;
}

export interface DayStartContent {
  slept8Hours: boolean;
  water3Glasses: boolean;
  meditation5Min: boolean;
  mobility5Min: boolean;
  gratefulFor: string;
  intentionForDay: string;
}

export interface PlanningContent {
  oneThing: TaskItem;
  topThree: [TaskItem, TaskItem, TaskItem];
  otherTasks?: OtherTaskItem[];
}

export interface LifePillarItem {
  task: string;
  completed: boolean;
}

export interface LifePillarsContent {
  training: LifePillarItem;
  deepRelaxation: LifePillarItem;
  healthyNutrition: LifePillarItem;
  realConnection: LifePillarItem;
}

export interface ReflectionContent {
  wentWell: string;
  whyWentWell: string;
  repeatInFuture: string;
  wentWrong: string;
  whyWentWrong: string;
  doDifferently: string;
}

export interface DayCloseContent {
  noScreens2Hours: boolean;
  noCarbs3Hours: boolean;
  tomorrowPlanned: boolean;
  goalsReviewed: boolean;
  reflection: ReflectionContent;
}

export interface DayContent {
  dayStart: DayStartContent;
  planning: PlanningContent;
  lifePillars: LifePillarsContent;
  dayClose: DayCloseContent;
}

export interface WeekGoal {
  id: string;
  title: string;
  description: string;
  linkedMonthGoals: string[];
  progress: number;
  /** Day indices 0=Mon, 1=Tue, ..., 6=Sun. Goals assigned to these days appear in the week agenda. */
  assignedDays?: number[];
}

export interface MonthGoal {
  id: string;
  title: string;
  description: string;
  linkedQuarterGoals: string[];
  progress: number;
}

export interface QuarterGoal {
  id: string;
  title: string;
  smartDefinition: string;
  whatIsDifferent: string;
  consequencesIfNot: string;
  rewardIfAchieved: string;
  progress: number;
}

export interface WeekStartContent {
  weeklyGoals: WeekGoal[];
}

export interface MonthStartContent {
  monthlyGoals: MonthGoal[];
}

export interface QuarterStartContent {
  lifeWheel: LifeWheelScores;
  quarterGoals: QuarterGoal[];
}

export interface LifeWheelScores {
  work: number;
  fun: number;
  social: number;
  giving: number;
  money: number;
  growth: number;
  health: number;
  love: number;
}
