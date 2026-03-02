export type UserSettings = {
  notificationPreferences: {
    dayStartReminder: boolean;
    dayCloseReminder: boolean;
    pomodoroReminders: boolean;
    accountabilityCheckins: boolean;
  };
  timezone: string;
};

export enum SubscriptionStatus {
  Free = "free",
  Pro = "pro",
  Trial = "trial",
  Canceled = "canceled"
}
