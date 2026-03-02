import type {
  MonthStartContent,
  QuarterStartContent,
  WeekStartContent
} from "../shared";
import { AppError } from "../errors";
import {
  getCurrentMonth,
  getCurrentQuarter,
  getCurrentWeek
} from "./periodService";

const quarterKeyPattern = /^(\d{4})-Q([1-4])$/;
const monthKeyPattern = /^(\d{4})-(\d{2})$/;
const weekKeyPattern = /^(\d{4})-W(\d{2})$/;

function parseQuarterKey(quarterKey: string) {
  const match = quarterKeyPattern.exec(quarterKey);
  if (!match) {
    throw AppError.validationError("Invalid quarter key", { quarterKey });
  }
  return { year: Number(match[1]), quarter: Number(match[2]) };
}

function parseMonthKey(monthKey: string) {
  const match = monthKeyPattern.exec(monthKey);
  if (!match) {
    throw AppError.validationError("Invalid month key", { monthKey });
  }
  return { year: Number(match[1]), month: Number(match[2]) };
}

function parseWeekKey(weekKey: string) {
  const match = weekKeyPattern.exec(weekKey);
  if (!match) {
    throw AppError.validationError("Invalid week key", { weekKey });
  }
  return { year: Number(match[1]), week: Number(match[2]) };
}

function getIsoWeekStart(year: number, week: number): Date {
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const day = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() + (week - 1) * 7 - (day - 1));
  return monday;
}

function averageProgress(values: number[]): number {
  if (values.length === 0) {
    return 0;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Math.round(total / values.length);
}

export function validateMonthBelongsToQuarter(monthKey: string, quarterKey: string): boolean {
  const { year: quarterYear, quarter } = parseQuarterKey(quarterKey);
  const { year: monthYear, month } = parseMonthKey(monthKey);
  if (quarterYear !== monthYear) {
    return false;
  }
  const quarterStartMonth = (quarter - 1) * 3 + 1;
  return month >= quarterStartMonth && month <= quarterStartMonth + 2;
}

export function validateWeekBelongsToMonth(weekKey: string, monthKey: string): boolean {
  const { year, month } = parseMonthKey(monthKey);
  const { year: weekYear, week } = parseWeekKey(weekKey);
  if (year !== weekYear) {
    return false;
  }
  const weekStart = getIsoWeekStart(weekYear, week);
  const weekMonth = weekStart.getUTCMonth() + 1;
  return weekMonth === month;
}

export async function getGoalHierarchy(
  userId: string,
  accessToken: string,
  weekGoalIndex: number
) {
  if (!Number.isInteger(weekGoalIndex) || weekGoalIndex < 0) {
    throw AppError.validationError("Invalid goal index", { weekGoalIndex });
  }
  const weekDoc = await getCurrentWeek(userId, accessToken);
  const monthDoc = await getCurrentMonth(userId, accessToken);
  const quarterDoc = await getCurrentQuarter(userId, accessToken);

  const weekContent = weekDoc.content as WeekStartContent;
  const weekGoal = weekContent?.weeklyGoals?.[weekGoalIndex];
  if (!weekGoal) {
    throw AppError.validationError("Weekly goal not found", { weekGoalIndex });
  }

  const monthContent = monthDoc.content as MonthStartContent;
  const monthGoalId = weekGoal.linkedMonthGoals?.[0];
  const monthGoal = monthContent?.monthlyGoals?.find((goal) => goal.id === monthGoalId);
  if (!monthGoal) {
    throw AppError.validationError("Linked month goal not found", { monthGoalId });
  }

  const quarterContent = quarterDoc.content as QuarterStartContent;
  const quarterGoalId = monthGoal.linkedQuarterGoals?.[0];
  const quarterGoal = quarterContent?.quarterGoals?.find((goal) => goal.id === quarterGoalId);
  if (!quarterGoal) {
    throw AppError.validationError("Linked quarter goal not found", { quarterGoalId });
  }

  return { weekGoal, monthGoal, quarterGoal };
}

export async function getPeriodProgress(userId: string, accessToken: string) {
  const weekDoc = await getCurrentWeek(userId, accessToken);
  const monthDoc = await getCurrentMonth(userId, accessToken);
  const quarterDoc = await getCurrentQuarter(userId, accessToken);

  const weekContent = weekDoc.content as WeekStartContent;
  const monthContent = monthDoc.content as MonthStartContent;
  const quarterContent = quarterDoc.content as QuarterStartContent;

  const weekProgress = averageProgress(
    (weekContent?.weeklyGoals ?? []).map((goal) => goal.progress)
  );
  const monthProgress = averageProgress(
    (monthContent?.monthlyGoals ?? []).map((goal) => goal.progress)
  );
  const quarterProgress = averageProgress(
    (quarterContent?.quarterGoals ?? []).map((goal) => goal.progress)
  );

  return {
    week: { progress: weekProgress, goals: weekContent?.weeklyGoals ?? [] },
    month: { progress: monthProgress, goals: monthContent?.monthlyGoals ?? [] },
    quarter: { progress: quarterProgress, goals: quarterContent?.quarterGoals ?? [] }
  };
}
