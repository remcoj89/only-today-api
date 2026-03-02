export interface AccountabilityPair {
  id: string;
  userAId: string;
  userBId: string;
  createdAt: string;
}

export interface DailyCheckin {
  id: string;
  pairId: string;
  authorUserId: string;
  targetDate: string;
  message: string;
  createdAt: string;
}

export interface DailyStatusSummary {
  userId: string;
  date: string;
  dayClosed: boolean;
  oneThingDone: boolean;
  reflectionPresent: boolean;
  updatedAt: string;
}
