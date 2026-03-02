import { formatInTimeZone } from "date-fns-tz";
import { getSupabaseAdminClient } from "../db/client";
import { AppError } from "../errors";
import { formatDateKey } from "../utils/dateUtils";
import { getPartner } from "../services/accountabilityService";
import { sendPushNotification } from "../services/notificationService";

type UserSettingsRow = {
  user_id: string;
  day_start_reminder_time: string | null;
  day_close_reminder_time: string | null;
  timezone: string | null;
  push_enabled: boolean;
};

function normalizeTime(value: string | null): string | null {
  if (!value) {
    return null;
  }
  return value.slice(0, 5);
}

function getCurrentTime(timeZone: string) {
  return formatInTimeZone(new Date(), timeZone, "HH:mm");
}

async function loadReminderUsers(
  column: "day_start_reminder_time" | "day_close_reminder_time"
): Promise<UserSettingsRow[]> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_settings")
    .select("user_id,day_start_reminder_time,day_close_reminder_time,timezone,push_enabled")
    .eq("push_enabled", true)
    .not(column, "is", null);

  if (error) {
    throw AppError.internal("Failed to load notification settings");
  }

  return (Array.isArray(data) ? data : []) as UserSettingsRow[];
}

async function isDayClosed(userId: string, dateKey: string): Promise<boolean> {
  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("journal_documents")
    .select("status")
    .eq("user_id", userId)
    .eq("doc_type", "day")
    .eq("doc_key", dateKey)
    .limit(1);

  if (error) {
    throw AppError.internal("Failed to load day status");
  }

  return data && data.length > 0 ? data[0].status === "closed" : false;
}

export async function runDayStartReminders() {
  const users = await loadReminderUsers("day_start_reminder_time");
  const now = new Date();

  await Promise.all(
    users.map(async (user) => {
      const timeZone = user.timezone ?? "UTC";
      const reminderTime = normalizeTime(user.day_start_reminder_time);
      if (!reminderTime) {
        return;
      }
      if (getCurrentTime(timeZone) !== reminderTime) {
        return;
      }
      const dateKey = formatDateKey(now, timeZone);
      await sendPushNotification(user.user_id, {
        type: "day_start",
        title: "Time to start your day!",
        body: "Open your day start checklist.",
        data: { dateKey },
        targetDate: dateKey
      });
    })
  );
}

export async function runDayCloseReminders() {
  const users = await loadReminderUsers("day_close_reminder_time");
  const now = new Date();

  await Promise.all(
    users.map(async (user) => {
      const timeZone = user.timezone ?? "UTC";
      const reminderTime = normalizeTime(user.day_close_reminder_time);
      if (!reminderTime) {
        return;
      }
      if (getCurrentTime(timeZone) !== reminderTime) {
        return;
      }
      const dateKey = formatDateKey(now, timeZone);
      const closed = await isDayClosed(user.user_id, dateKey);
      if (closed) {
        return;
      }
      await sendPushNotification(user.user_id, {
        type: "day_close",
        title: "Don't forget to close your day!",
        body: "Complete your reflection and close your day.",
        data: { dateKey },
        targetDate: dateKey
      });
    })
  );
}

export async function notifyPartnerDayClosed(userId: string, accessToken: string, dateKey: string) {
  const partner = await getPartner(userId, accessToken);
  if (!partner) {
    return;
  }

  const admin = getSupabaseAdminClient();
  const { data, error } = await admin
    .from("user_settings")
    .select("push_enabled")
    .eq("user_id", partner.id)
    .single();

  if (error) {
    throw AppError.internal("Failed to load partner notification settings");
  }

  if (!data?.push_enabled) {
    return;
  }

  await sendPushNotification(partner.id, {
    type: "partner_closed",
    title: "Your partner closed their day!",
    body: "Check in to see their progress.",
    data: { dateKey },
    targetDate: dateKey
  });
}
